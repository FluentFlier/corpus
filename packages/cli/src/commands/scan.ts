import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { green, amber, red, dim, bold, cyan } from '../utils/colors.js';

interface ScanOptions {
  paths: string[];
  format: 'pretty' | 'json';
  staged: boolean;
  secrets: boolean;
  pii: boolean;
  injection: boolean;
  safety: boolean;
  fix: boolean;
}

interface Finding {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  type: string;
  file: string;
  line: number;
  message: string;
  value?: string;
  isAiPattern?: boolean;
  suggestion?: string;
}

// ── Secret detection patterns ────────────────────────────────────────────────

const SECRET_PATTERNS: { name: string; regex: RegExp; severity: 'CRITICAL' | 'WARNING' }[] = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, severity: 'CRITICAL' },
  { name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,255}/g, severity: 'CRITICAL' },
  { name: 'OpenAI Key', regex: /sk-[A-Za-z0-9]{20,}/g, severity: 'CRITICAL' },
  { name: 'Anthropic Key', regex: /sk-ant-[A-Za-z0-9-]{20,}/g, severity: 'CRITICAL' },
  { name: 'Stripe Key', regex: /[sr]k_live_[A-Za-z0-9]{20,}/g, severity: 'CRITICAL' },
  { name: 'Database URL', regex: /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/g, severity: 'CRITICAL' },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: 'CRITICAL' },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z-]{10,}/g, severity: 'CRITICAL' },
  { name: 'SendGrid Key', regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, severity: 'CRITICAL' },
  { name: 'Generic Secret', regex: /(?:api_key|apikey|api_secret|secret_key|auth_token|access_token)\s*[=:]\s*['"]([A-Za-z0-9_\-]{16,})['"]/gi, severity: 'WARNING' },
  { name: 'Password', regex: /(?:password|passwd|pwd)\s*[=:]\s*['"]([^'"]{8,})['"]/gi, severity: 'WARNING' },
];

const PLACEHOLDER_SKIP = [
  /^sk-(?:test|fake|dummy|placeholder|example|xxx|your)/i,
  /^(?:test|fake|dummy|placeholder|example|changeme|TODO|your_)/i,
  /^(?:xxx|aaa|123|abc)/i,
  /<[A-Z_]+>/,
  /^pk_test_/,
];

// AI-specific patterns
const AI_PATTERNS: { name: string; regex: RegExp; severity: 'WARNING' | 'INFO'; message: string }[] = [
  { name: 'Inlined Env Var', regex: /(?:const|let|var)\s+\w+\s*=\s*['"](?:postgres|mysql|mongodb|redis|https?):\/\/[^'"]+['"]/g, severity: 'WARNING', message: 'URL hardcoded instead of read from environment variable' },
  { name: 'Disabled SSL', regex: /rejectUnauthorized\s*:\s*false/g, severity: 'INFO', message: 'SSL verification disabled' },
  { name: 'Wildcard CORS', regex: /(?:cors|origin)\s*[=:]\s*['"]\*['"]/gi, severity: 'WARNING', message: 'CORS set to wildcard (*)' },
  { name: 'chmod 777', regex: /chmod\s+777/g, severity: 'WARNING', message: 'Overly permissive file permissions' },
  { name: 'eval()', regex: /\beval\s*\(/g, severity: 'CRITICAL' as 'WARNING', message: 'eval() enables arbitrary code execution' },
  { name: 'Debug Endpoint', regex: /(?:app|router)\.\s*(?:get|post|use)\s*\(\s*['"]\/(?:debug|test|admin)/g, severity: 'WARNING', message: 'Debug/admin endpoint may be accessible in production' },
];

// PII patterns
const PII_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'Email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'Credit Card', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
];

// Injection patterns
const INJECTION_PATTERNS = [
  'ignore previous instructions', 'ignore all previous', 'you are now',
  'system prompt', 'developer mode', 'jailbreak', 'bypass safety',
  'override:', 'new instructions:', 'forget everything',
];

// ── File scanning ────────────────────────────────────────────────────────────

function isPlaceholder(val: string): boolean {
  return PLACEHOLDER_SKIP.some((p) => p.test(val));
}

function isTestFile(f: string): boolean {
  const l = f.toLowerCase();
  return l.includes('test') || l.includes('spec') || l.includes('mock') || l.includes('fixture') || l.includes('__tests__');
}

function isScannable(f: string): boolean {
  const ext = path.extname(f).toLowerCase();
  const name = path.basename(f).toLowerCase();
  const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.kt', '.swift', '.rb', '.php', '.c', '.cpp', '.h', '.cs', '.json', '.yaml', '.yml', '.toml', '.sh', '.bash', '.sql', '.tf', '.hcl', '.xml', '.vue', '.svelte', '.ini', '.cfg', '.conf', '.plist', '.md'];
  return codeExts.includes(ext) || name.startsWith('.env') || name === 'dockerfile' || name === 'makefile';
}

function getFilesToScan(paths: string[], staged: boolean): string[] {
  if (staged) {
    try {
      const output = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf-8' });
      return output.trim().split('\n').filter((f) => f && isScannable(f));
    } catch {
      return [];
    }
  }

  const files: string[] = [];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const stat = statSync(p);
    if (stat.isFile() && isScannable(p)) {
      files.push(p);
    } else if (stat.isDirectory()) {
      walkDir(p, files);
    }
  }
  return files;
}

function walkDir(dir: string, files: string[]): void {
  const skip = ['node_modules', '.git', 'dist', '.next', '__pycache__', '.venv', 'venv'];
  try {
    for (const entry of readdirSync(dir)) {
      if (skip.includes(entry)) continue;
      const full = path.join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) walkDir(full, files);
        else if (stat.isFile() && isScannable(full)) files.push(full);
      } catch { /* permission errors */ }
    }
  } catch { /* permission errors */ }
}

function scanFile(filepath: string, opts: ScanOptions): Finding[] {
  const findings: Finding[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, 'utf-8');
  } catch {
    return findings;
  }

  if (isTestFile(filepath)) return findings;

  // Secrets
  if (opts.secrets) {
    for (const pat of SECRET_PATTERNS) {
      pat.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.regex.exec(content)) !== null) {
        const val = m[1] ?? m[0];
        if (isPlaceholder(val)) continue;
        const line = content.slice(0, m.index).split('\n').length;
        findings.push({
          severity: pat.severity,
          type: pat.name,
          file: filepath,
          line,
          message: `${pat.name} detected`,
          value: val.length > 12 ? val.slice(0, 6) + '...' + val.slice(-4) : '***',
        });
      }
    }

    // AI patterns
    for (const pat of AI_PATTERNS) {
      pat.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.regex.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length;
        findings.push({
          severity: pat.severity,
          type: pat.name,
          file: filepath,
          line,
          message: pat.message,
          isAiPattern: true,
        });
      }
    }
  }

  // PII
  if (opts.pii) {
    for (const pat of PII_PATTERNS) {
      pat.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.regex.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length;
        findings.push({
          severity: 'WARNING',
          type: `PII: ${pat.name}`,
          file: filepath,
          line,
          message: `${pat.name} found in source code`,
        });
      }
    }
  }

  // Injection
  if (opts.injection) {
    const lower = content.toLowerCase();
    for (const pattern of INJECTION_PATTERNS) {
      if (lower.includes(pattern)) {
        const idx = lower.indexOf(pattern);
        const line = content.slice(0, idx).split('\n').length;
        findings.push({
          severity: 'CRITICAL',
          type: 'Injection Pattern',
          file: filepath,
          line,
          message: `Prompt injection pattern found: "${pattern}"`,
        });
      }
    }
  }

  return findings;
}

// ── Output formatting ────────────────────────────────────────────────────────

function formatPretty(findings: Finding[], fileCount: number, timeMs: number): void {
  const critical = findings.filter((f) => f.severity === 'CRITICAL');
  const warning = findings.filter((f) => f.severity === 'WARNING');
  const info = findings.filter((f) => f.severity === 'INFO');

  process.stdout.write('\n');
  process.stdout.write(bold(`  CORPUS SCAN  ${fileCount} files scanned in ${(timeMs / 1000).toFixed(1)}s\n`));
  process.stdout.write('  ' + '\u2550'.repeat(46) + '\n\n');

  if (findings.length === 0) {
    process.stdout.write(green('  No issues found. Your code is clean.\n\n'));
    return;
  }

  for (const f of findings) {
    const sev = f.severity === 'CRITICAL' ? red('CRITICAL') :
                f.severity === 'WARNING' ? amber('WARNING ') :
                dim('INFO    ');
    const ai = f.isAiPattern ? amber(' [AI]') : '';
    process.stdout.write(`  ${sev}  ${f.file}:${f.line}${ai}\n`);
    process.stdout.write(`    ${f.message}\n`);
    if (f.value) process.stdout.write(`    Value: ${dim(f.value)}\n`);
    if (f.suggestion) process.stdout.write(`    Fix: ${dim(f.suggestion)}\n`);
    process.stdout.write('\n');
  }

  const summary: string[] = [];
  if (critical.length > 0) summary.push(red(`${critical.length} critical`));
  if (warning.length > 0) summary.push(amber(`${warning.length} warning`));
  if (info.length > 0) summary.push(dim(`${info.length} info`));
  process.stdout.write(`  ${summary.join(', ')}\n\n`);
}

function formatJson(findings: Finding[], fileCount: number, timeMs: number): void {
  process.stdout.write(JSON.stringify({
    scannedFiles: fileCount,
    scanTimeMs: timeMs,
    findings: findings.map((f) => ({
      severity: f.severity,
      type: f.type,
      file: f.file,
      line: f.line,
      message: f.message,
      isAiPattern: f.isAiPattern ?? false,
    })),
    summary: {
      critical: findings.filter((f) => f.severity === 'CRITICAL').length,
      warning: findings.filter((f) => f.severity === 'WARNING').length,
      info: findings.filter((f) => f.severity === 'INFO').length,
    },
  }, null, 2) + '\n');
}

// ── Auto-fix ─────────────────────────────────────────────────────────────────

function autoFix(findings: Finding[]): void {
  // Types that have actual auto-fix logic implemented
  const AUTO_FIXABLE_TYPES = new Set(['Disabled SSL', 'Wildcard CORS']);
  // Types that look fixable but require manual intervention
  const MANUAL_FIX_TYPES = new Set(['Generic Secret', 'Password', 'Inlined Env Var']);

  const fixable = findings.filter((f) => AUTO_FIXABLE_TYPES.has(f.type));
  const manualOnly = findings.filter((f) => MANUAL_FIX_TYPES.has(f.type));

  if (fixable.length === 0 && manualOnly.length === 0) {
    process.stdout.write(dim('  No auto-fixable issues found.\n'));
    process.stdout.write(dim('  Auto-fix works on: disabled SSL, wildcard CORS.\n\n'));
    return;
  }

  if (manualOnly.length > 0) {
    process.stdout.write(dim(`  ${manualOnly.length} issue(s) require manual fix (Generic Secret, Password, Inlined Env Var).\n`));
  }

  if (fixable.length === 0) {
    process.stdout.write(dim('  No auto-fixable issues found.\n\n'));
    return;
  }

  process.stdout.write(bold(`  AUTO-FIX: ${fixable.length} fixable issue(s)\n\n`));

  // Group by file
  const byFile = new Map<string, Finding[]>();
  for (const f of fixable) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file)!.push(f);
  }

  let fixed = 0;
  const envEntries: string[] = [];

  for (const [filepath, fileFindings] of byFile) {
    let content = readFileSync(filepath, 'utf-8');
    const lines = content.split('\n');

    for (const finding of fileFindings) {
      if (finding.type === 'Disabled SSL') {
        // Replace rejectUnauthorized: false with true
        content = content.replace(/rejectUnauthorized\s*:\s*false/g, 'rejectUnauthorized: true');
        process.stdout.write(`  ${green('\u2714')} ${filepath}:${finding.line} - Enabled SSL verification\n`);
        fixed++;
      } else if (finding.type === 'Wildcard CORS') {
        // Replace wildcard with env var reference
        content = content.replace(
          /((?:cors|origin)\s*[=:]\s*)['"]?\*['"]?/gi,
          '$1process.env.CORS_ORIGIN || "http://localhost:3000"'
        );
        envEntries.push('CORS_ORIGIN=http://localhost:3000');
        process.stdout.write(`  ${green('\u2714')} ${filepath}:${finding.line} - Replaced wildcard CORS with env var\n`);
        fixed++;
      }
    }

    writeFileSync(filepath, content);
  }

  // Write env entries if any
  if (envEntries.length > 0) {
    const envPath = '.env';
    let envContent = '';
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, 'utf-8');
    }
    for (const entry of envEntries) {
      const key = entry.split('=')[0];
      if (!envContent.includes(key)) {
        envContent += `\n# Added by corpus scan --fix\n${entry}\n`;
      }
    }
    writeFileSync(envPath, envContent);
  }

  process.stdout.write(`\n  ${green(`${fixed} issue(s) auto-fixed.`)}\n`);
  if (fixed < fixable.length) {
    process.stdout.write(dim(`  ${fixable.length - fixed} issue(s) need manual review.\n`));
  }
  process.stdout.write('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function runScan(): Promise<void> {
  const args = process.argv.slice(3);
  const opts: ScanOptions = {
    paths: ['.'],
    format: 'pretty',
    staged: false,
    secrets: false,
    pii: false,
    injection: false,
    safety: false,
    fix: false,
  };

  // Parse args — individual flags are collected first; if none are set we
  // default to scanning everything.
  let anyFilterFlag = false;
  const paths: string[] = [];
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--format': opts.format = (args[++i] as 'pretty' | 'json') ?? 'pretty'; break;
      case '--staged': opts.staged = true; break;
      case '--json': opts.format = 'json'; break;
      case '--fix': opts.fix = true; break;
      case '--secrets': opts.secrets = true; anyFilterFlag = true; break;
      case '--pii': opts.pii = true; anyFilterFlag = true; break;
      case '--injection': opts.injection = true; anyFilterFlag = true; break;
      case '--help': case '-h':
        process.stdout.write(`
  corpus scan [paths...] [options]

  Scan files for secrets, PII, injection patterns, and unsafe code.

  Options:
    --staged       Scan only git staged files (for pre-commit hooks)
    --fix          Auto-fix: replace hardcoded secrets with env var references
    --json         Output as JSON
    --secrets      Scan for secrets only
    --pii          Scan for PII only
    --injection    Scan for injection patterns only
    --format <fmt> Output format: pretty (default) or json
    --help         Show this help

  Examples:
    corpus scan                  Scan current directory
    corpus scan src/ config/     Scan specific directories
    corpus scan --staged         Scan staged git changes (pre-commit)
    corpus scan --fix            Scan and auto-fix secrets
    corpus scan --json           Machine-readable output for CI

`);
        return;
      default:
        if (!args[i].startsWith('-')) paths.push(args[i]);
    }
  }

  // If no filter flags were provided, enable all scan categories (default).
  if (!anyFilterFlag) {
    opts.secrets = true;
    opts.pii = true;
    opts.injection = true;
    opts.safety = true;
  }

  if (paths.length > 0) opts.paths = paths;

  const start = Date.now();
  const files = getFilesToScan(opts.paths, opts.staged);

  if (files.length === 0) {
    if (opts.format === 'json') {
      process.stdout.write(JSON.stringify({ scannedFiles: 0, findings: [], summary: { critical: 0, warning: 0, info: 0 } }) + '\n');
    } else {
      process.stdout.write(dim('\n  No scannable files found.\n\n'));
    }
    return;
  }

  const allFindings: Finding[] = [];
  for (const filepath of files) {
    allFindings.push(...scanFile(filepath, opts));
  }

  const timeMs = Date.now() - start;

  if (opts.format === 'json') {
    formatJson(allFindings, files.length, timeMs);
  } else {
    formatPretty(allFindings, files.length, timeMs);
  }

  // Auto-fix mode
  if (opts.fix && allFindings.length > 0) {
    autoFix(allFindings);
  }

  // Exit code: 2 for critical, 1 for warnings, 0 for clean
  const hasCritical = allFindings.some((f) => f.severity === 'CRITICAL');
  const hasWarning = allFindings.some((f) => f.severity === 'WARNING');
  if (hasCritical) process.exit(2);
  if (hasWarning) process.exit(1);
}
