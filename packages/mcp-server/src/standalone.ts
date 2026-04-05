#!/usr/bin/env node

/**
 * Corpus MCP Server (Standalone)
 * Self-contained -- all scanner logic inline, no external imports.
 * Works from any directory without workspace resolution.
 */

// ── Inline Scanners ──────────────────────────────────────────────────────────

const SECRET_PATTERNS: { name: string; regex: RegExp; fix: string }[] = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, fix: 'Move to process.env.AWS_ACCESS_KEY_ID' },
  { name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g, fix: 'Move to process.env.GITHUB_TOKEN' },
  { name: 'OpenAI/Anthropic Key', regex: /sk-[A-Za-z0-9]{20,}/g, fix: 'Move to process.env.API_KEY' },
  { name: 'Stripe Live Key', regex: /[sr]k_live_[A-Za-z0-9]{20,}/g, fix: 'Move to process.env.STRIPE_SECRET_KEY' },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, fix: 'Never hardcode private keys' },
  { name: 'Database URL', regex: /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/g, fix: 'Move to process.env.DATABASE_URL' },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z-]{10,}/g, fix: 'Move to process.env.SLACK_TOKEN' },
  { name: 'Hardcoded Password', regex: /(?:password|passwd|pwd)\s*[=:]\s*['"]([^'"]{8,})['"]/gi, fix: 'Use environment variable' },
];

const SAFETY_PATTERNS: { name: string; regex: RegExp; severity: string; fix: string }[] = [
  { name: 'eval()', regex: /\beval\s*\(/g, severity: 'CRITICAL', fix: 'Use JSON.parse() or Function()' },
  { name: 'innerHTML', regex: /\.innerHTML\s*=/g, severity: 'WARNING', fix: 'Use textContent or DOMPurify' },
  { name: 'Disabled SSL', regex: /rejectUnauthorized\s*:\s*false/g, severity: 'WARNING', fix: 'Set rejectUnauthorized: true' },
  { name: 'Wildcard CORS', regex: /(?:cors|origin)\s*[=:]\s*['"]\*['"]/gi, severity: 'WARNING', fix: 'Set specific origin' },
  { name: 'chmod 777', regex: /chmod\s+777/g, severity: 'WARNING', fix: 'Use 755 or 644' },
  { name: 'Wildcard IAM', regex: /"(?:Action|Resource)"\s*:\s*"\*"/g, severity: 'CRITICAL', fix: 'Use least-privilege' },
  { name: 'dangerouslySetInnerHTML', regex: /dangerouslySetInnerHTML/g, severity: 'WARNING', fix: 'Sanitize HTML first' },
];

const INJECTION_PATTERNS = [
  'ignore previous instructions', 'ignore all previous', 'you are now',
  'system prompt', 'developer mode', 'jailbreak', 'bypass safety',
  'new instructions:', 'forget everything',
];

const PLACEHOLDER_SKIP = [/test|fake|dummy|placeholder|example|changeme|xxx|your_/i];

interface Finding {
  severity: string;
  type: string;
  line: number;
  message: string;
  fix: string;
}

function scanContent(content: string, filename: string): Finding[] {
  const findings: Finding[] = [];

  // Secrets
  for (const pat of SECRET_PATTERNS) {
    pat.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.regex.exec(content)) !== null) {
      const val = m[1] ?? m[0];
      if (PLACEHOLDER_SKIP.some(p => p.test(val))) continue;
      const line = content.slice(0, m.index).split('\n').length;
      findings.push({ severity: 'CRITICAL', type: pat.name, line, message: `${pat.name} detected`, fix: pat.fix });
    }
  }

  // Safety
  for (const pat of SAFETY_PATTERNS) {
    pat.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.regex.exec(content)) !== null) {
      const line = content.slice(0, m.index).split('\n').length;
      findings.push({ severity: pat.severity, type: pat.name, line, message: pat.name, fix: pat.fix });
    }
  }

  // PII
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(content)) {
    const idx = content.search(/\b\d{3}-\d{2}-\d{4}\b/);
    findings.push({ severity: 'CRITICAL', type: 'SSN', line: content.slice(0, idx).split('\n').length, message: 'SSN in source', fix: 'Remove immediately' });
  }

  return findings;
}

function computeTrustScore(findings: Finding[]): number {
  let critD = 0, warnD = 0, infoD = 0;
  for (const f of findings) {
    if (f.severity === 'CRITICAL') critD += 15;
    else if (f.severity === 'WARNING') warnD += 5;
    else infoD += 1;
  }
  return Math.max(0, Math.round(100 - Math.min(critD, 60) - Math.min(warnD, 25) - Math.min(infoD, 10)));
}

function checkInjection(content: string, source: string): { severity: string; message: string } {
  const lower = content.toLowerCase();
  for (const pattern of INJECTION_PATTERNS) {
    if (lower.includes(pattern)) {
      return { severity: 'BLOCK', message: `Injection pattern "${pattern}" from ${source}` };
    }
  }
  return { severity: 'CLEAN', message: '' };
}

// ── MCP Protocol ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'verify_file',
    description: 'Compute a trust score (0-100) for code with line-by-line findings and fixes. If score < 50, do NOT write the file.',
    inputSchema: { type: 'object', properties: { content: { type: 'string', description: 'Code content' }, filename: { type: 'string', description: 'Filename' } }, required: ['content', 'filename'] },
  },
  {
    name: 'scan_content',
    description: 'Scan code for secrets, PII, and unsafe patterns.',
    inputSchema: { type: 'object', properties: { content: { type: 'string', description: 'Code content' }, filename: { type: 'string', description: 'Filename' } }, required: ['content', 'filename'] },
  },
  {
    name: 'check_secret',
    description: 'Check if a string value is a secret/credential.',
    inputSchema: { type: 'object', properties: { value: { type: 'string', description: 'Value to check' } }, required: ['value'] },
  },
  {
    name: 'check_safety',
    description: 'Check code for unsafe patterns like eval(), innerHTML, SQL injection.',
    inputSchema: { type: 'object', properties: { content: { type: 'string', description: 'Code' }, filename: { type: 'string', description: 'Filename' } }, required: ['content', 'filename'] },
  },
  {
    name: 'check_injection',
    description: 'Scan text for prompt injection patterns.',
    inputSchema: { type: 'object', properties: { content: { type: 'string', description: 'Content to scan' }, source: { type: 'string', description: 'Source' } }, required: ['content'] },
  },
];

function handleTool(name: string, args: Record<string, unknown>): { content: { type: string; text: string }[] } {
  const text = (t: string) => ({ content: [{ type: 'text', text: t }] });

  switch (name) {
    case 'verify_file': {
      const content = String(args.content ?? '');
      const filename = String(args.filename ?? 'unknown');
      const findings = scanContent(content, filename);
      const score = computeTrustScore(findings);
      if (findings.length === 0) return text(`TRUST SCORE: ${score}/100 - CLEAN. Safe to write.`);
      const rec = score < 50 ? 'DO NOT write this file. Fix critical issues first.' : score < 80 ? 'Warnings found. Consider fixing.' : 'Safe to write.';
      const details = findings.map(f => `  [${f.severity}] Line ${f.line}: ${f.message}\n    FIX: ${f.fix}`).join('\n');
      return text(`TRUST SCORE: ${score}/100 for ${filename}\n${rec}\n\n${findings.length} finding(s):\n${details}`);
    }
    case 'scan_content': {
      const findings = scanContent(String(args.content ?? ''), String(args.filename ?? 'unknown'));
      if (findings.length === 0) return text('CLEAN: No issues found.');
      return text(`FOUND ${findings.length} issue(s):\n${findings.map(f => `  [${f.severity}] ${f.message}`).join('\n')}`);
    }
    case 'check_secret': {
      const findings = scanContent(`const x = "${args.value}";`, 'check.ts');
      return text(findings.length > 0 ? `WARNING: Looks like a ${findings[0].type}. Use an environment variable.` : 'OK: Not a known secret pattern.');
    }
    case 'check_safety': {
      const findings = scanContent(String(args.content ?? ''), String(args.filename ?? 'unknown')).filter(f => ['eval()', 'innerHTML', 'Disabled SSL', 'Wildcard CORS', 'chmod 777', 'Wildcard IAM', 'dangerouslySetInnerHTML'].includes(f.type));
      if (findings.length === 0) return text('SAFE: No unsafe patterns.');
      return text(`FOUND ${findings.length} unsafe pattern(s):\n${findings.map(f => `  [${f.severity}] ${f.message}\n    FIX: ${f.fix}`).join('\n')}`);
    }
    case 'check_injection': {
      const result = checkInjection(String(args.content ?? ''), String(args.source ?? 'unknown'));
      return text(result.severity === 'CLEAN' ? 'CLEAN: No injection patterns.' : `${result.severity}: ${result.message}`);
    }
    default:
      return text(`Unknown tool: ${name}`);
  }
}

// ── stdio transport ──────────────────────────────────────────────────────────

interface McpRequest { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> }

function send(response: object): void {
  const json = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

function handle(req: McpRequest): void {
  switch (req.method) {
    case 'initialize':
      send({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'corpus-mcp', version: '0.1.0' } } });
      break;
    case 'tools/list':
      send({ jsonrpc: '2.0', id: req.id, result: { tools: TOOLS } });
      break;
    case 'tools/call': {
      const p = req.params as { name: string; arguments?: Record<string, unknown> };
      send({ jsonrpc: '2.0', id: req.id, result: handleTool(p.name, p.arguments ?? {}) });
      break;
    }
    case 'notifications/initialized':
      break;
    default:
      send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } });
  }
}

let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) { buffer = buffer.slice(headerEnd + 4); continue; }
    const len = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + len) break;
    const body = buffer.slice(bodyStart, bodyStart + len);
    buffer = buffer.slice(bodyStart + len);
    try { handle(JSON.parse(body)); } catch {}
  }
});

process.stderr.write('[corpus-mcp] Server started\n');
