#!/usr/bin/env node

/**
 * Corpus MCP Server
 *
 * Exposes security scanning tools to AI coding agents via the
 * Model Context Protocol (MCP). The AI can check proposed code
 * for secrets, PII, and unsafe patterns BEFORE writing to disk.
 *
 * Tools:
 *   scan_content   - Scan code content for security issues
 *   check_secret   - Check if a string looks like a secret/credential
 *   check_safety   - Check code for unsafe patterns (eval, innerHTML, etc.)
 *   get_policy     - Get the verdict for an action type
 *
 * Setup in Claude Code / .mcp.json:
 *   { "command": "npx", "args": ["corpus-mcp"], "type": "stdio" }
 */

import { detectSecrets } from '@corpus/core';
import { checkCodeSafety } from '@corpus/core';
import { scanForInjection } from '@corpus/core';
import { scanPayload } from '@corpus/core';
import { computeFileTrust } from '@corpus/core';

// ── MCP Protocol Types ───────────────────────────────────────────────────────

interface McpRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

// ── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'scan_content',
    description: 'Scan code content for secrets, PII, injection patterns, and unsafe code. Call this before writing any file to check for security issues.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The code content to scan' },
        filename: { type: 'string', description: 'The filename (used to determine scan rules)' },
      },
      required: ['content', 'filename'],
    },
  },
  {
    name: 'check_secret',
    description: 'Check if a string value looks like a secret, API key, token, or credential. Use this before hardcoding any string value.',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'string', description: 'The string value to check' },
      },
      required: ['value'],
    },
  },
  {
    name: 'check_safety',
    description: 'Check code for unsafe patterns like eval(), innerHTML, SQL injection, command injection, disabled SSL, wildcard CORS.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The code to check' },
        filename: { type: 'string', description: 'The filename' },
      },
      required: ['content', 'filename'],
    },
  },
  {
    name: 'check_injection',
    description: 'Scan text content for prompt injection patterns. Use this before including any external content in LLM context.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The content to scan' },
        source: { type: 'string', description: 'Where this content came from' },
      },
      required: ['content'],
    },
  },
  {
    name: 'verify_file',
    description: 'Compute a deterministic trust score (0-100) for a file with line-by-line findings and fix suggestions. Call this BEFORE writing any file. If score is below 50, do NOT write the file -- fix the issues first.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The code content to verify' },
        filename: { type: 'string', description: 'The filename' },
      },
      required: ['content', 'filename'],
    },
  },
  {
    name: 'corpus_check',
    description: 'CORPUS IMMUNE SYSTEM: Check code against the codebase contract graph BEFORE writing. If this returns VIOLATES, you MUST fix the violations and re-check. Do NOT write the file until this returns VERIFIED. This catches behavioral breakage: removed functions, deleted guard clauses, changed signatures.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The code content to check against the graph' },
        filepath: { type: 'string', description: 'The absolute file path being written' },
        project_root: { type: 'string', description: 'The project root directory (where .corpus/ lives)' },
      },
      required: ['content', 'filepath'],
    },
  },
  {
    name: 'corpus_health',
    description: 'Get the current health status of the codebase immune system. Returns overall health score, verified/violating/uncertain counts, and recent changes.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: { type: 'string', description: 'The project root directory' },
      },
      required: ['project_root'],
    },
  },
];

// ── Tool Handlers ────────────────────────────────────────────────────────────

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (name) {
    case 'scan_content': {
      const content = String(args.content ?? '');
      const filename = String(args.filename ?? 'unknown');

      const secrets = detectSecrets(content, filename);
      const safety = checkCodeSafety(content, filename);
      const pii = scanPayload(content);

      const issues = [
        ...secrets.map((s) => ({
          severity: s.severity,
          type: s.type,
          line: s.line,
          message: s.message,
          isAiPattern: s.isAiPattern,
        })),
        ...safety.map((s) => ({
          severity: s.severity,
          type: s.rule,
          line: s.line,
          message: s.message,
          isAiPattern: false,
        })),
        ...(pii.hasPii ? pii.matches.map((m) => ({
          severity: 'WARNING' as const,
          type: `PII: ${m.type}`,
          line: 0,
          message: `${m.type} found in content`,
          isAiPattern: false,
        })) : []),
      ];

      const clean = issues.length === 0;
      const text = clean
        ? `CLEAN: No security issues found in ${filename}.`
        : `FOUND ${issues.length} issue(s) in ${filename}:\n${issues.map((i) => `  [${i.severity}] ${i.message}${i.isAiPattern ? ' (AI pattern)' : ''}`).join('\n')}`;

      return { content: [{ type: 'text', text }] };
    }

    case 'check_secret': {
      const value = String(args.value ?? '');
      const findings = detectSecrets(`const x = "${value}";`, 'check.ts');
      const isSecret = findings.length > 0;

      return {
        content: [{
          type: 'text',
          text: isSecret
            ? `WARNING: This looks like a ${findings[0].type}. Do NOT hardcode this value. Use an environment variable instead.`
            : `OK: This value does not match known secret patterns.`,
        }],
      };
    }

    case 'check_safety': {
      const content = String(args.content ?? '');
      const filename = String(args.filename ?? 'unknown');
      const findings = checkCodeSafety(content, filename);

      if (findings.length === 0) {
        return { content: [{ type: 'text', text: 'SAFE: No unsafe code patterns found.' }] };
      }

      return {
        content: [{
          type: 'text',
          text: `FOUND ${findings.length} unsafe pattern(s):\n${findings.map((f) => `  [${f.severity}] ${f.message}\n    Fix: ${f.suggestion}`).join('\n')}`,
        }],
      };
    }

    case 'check_injection': {
      const content = String(args.content ?? '');
      const source = String(args.source ?? 'unknown');
      const result = scanForInjection(content, source);

      return {
        content: [{
          type: 'text',
          text: result.severity === 'CLEAN'
            ? 'CLEAN: No injection patterns found.'
            : `${result.severity}: ${result.message}`,
        }],
      };
    }

    case 'verify_file': {
      const content = String(args.content ?? '');
      const filename = String(args.filename ?? 'unknown');
      const result = computeFileTrust(content, filename);

      if (result.findings.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `TRUST SCORE: ${result.score}/100 - CLEAN. No issues found in ${filename}. Safe to write.`,
          }],
        };
      }

      const findingsText = result.findings
        .map((f) => `  [${f.severity}] Line ${f.line}: ${f.message}\n    FIX: ${f.fix}`)
        .join('\n');

      const recommendation = result.score < 50
        ? 'DO NOT write this file. Fix the critical issues first.'
        : result.score < 80
        ? 'File has warnings. Consider fixing before writing.'
        : 'File is acceptable. Safe to write.';

      return {
        content: [{
          type: 'text',
          text: `TRUST SCORE: ${result.score}/100 for ${filename}\n${recommendation}\n\n${result.findings.length} finding(s):\n${findingsText}`,
        }],
      };
    }

    case 'corpus_check': {
      const content = String(args.content ?? '');
      const filepath = String(args.filepath ?? '');
      const projectRoot = String(args.project_root ?? process.cwd());

      try {
        // Dynamic import to avoid breaking if graph-engine isn't built yet
        const { checkFile } = await import('@corpus/core');
        const result = checkFile(projectRoot, filepath, content);

        if (result.verdict === 'VERIFIED') {
          return {
            content: [{
              type: 'text',
              text: `CORPUS VERIFIED: All contracts satisfied for ${result.file}. Safe to write.`,
            }],
          };
        }

        if (result.verdict === 'UNCERTAIN') {
          return {
            content: [{
              type: 'text',
              text: `CORPUS UNCERTAIN: ${result.instructions}`,
            }],
          };
        }

        // VIOLATES - return fix instructions
        return {
          content: [{
            type: 'text',
            text: `CORPUS VIOLATES: ${result.instructions}\n\nYou MUST fix these violations before writing the file. Regenerate the code with these fixes applied, then call corpus_check again.`,
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: 'text',
            text: `CORPUS UNCERTAIN: Could not check graph contracts. ${e instanceof Error ? e.message : 'Unknown error'}. Run \`corpus init\` to build the immune system.`,
          }],
        };
      }
    }

    case 'corpus_health': {
      const projectRoot = String(args.project_root ?? process.cwd());

      try {
        const { getHealthSummary } = await import('@corpus/core');
        const health = getHealthSummary(projectRoot);

        const status = health.healthy ? 'HEALTHY' : 'DEGRADED';
        return {
          content: [{
            type: 'text',
            text: `CORPUS ${status}: Score ${health.score}/100 | ${health.totalNodes} nodes | ${health.verified} verified | ${health.violating} violating | ${health.uncertain} uncertain`,
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: 'text',
            text: `CORPUS: No immune system found. Run \`corpus init\` to build the codebase graph.`,
          }],
        };
      }
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
}

// ── MCP stdio transport ──────────────────────────────────────────────────────

function sendResponse(response: McpResponse): void {
  const json = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

function handleRequest(request: McpRequest): void {
  switch (request.method) {
    case 'initialize':
      sendResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'corpus-mcp', version: '0.2.0' },
        },
      });
      break;

    case 'tools/list':
      sendResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: TOOLS },
      });
      break;

    case 'tools/call': {
      const params = request.params as { name: string; arguments?: Record<string, unknown> };
      handleToolCall(params.name, params.arguments ?? {}).then((result) => {
        sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          result,
        });
      }).catch((err) => {
        sendResponse({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' },
        });
      });
      break;
    }

    case 'notifications/initialized':
      // No response needed for notifications
      break;

    default:
      sendResponse({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      });
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

let buffer = '';

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;

    if (buffer.length < bodyStart + contentLength) break;

    const body = buffer.slice(bodyStart, bodyStart + contentLength);
    buffer = buffer.slice(bodyStart + contentLength);

    try {
      const request = JSON.parse(body) as McpRequest;
      handleRequest(request);
    } catch {
      // Invalid JSON, skip
    }
  }
});

process.stderr.write('[corpus-mcp] Server started\n');
