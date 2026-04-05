export type SecretSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface SecretFinding {
  severity: SecretSeverity;
  type: string;
  value: string;
  redacted: string;
  line: number;
  column: number;
  file: string;
  message: string;
  isAiPattern: boolean;
}

interface PatternDef {
  name: string;
  regex: RegExp;
  severity: SecretSeverity;
  message: string;
}

// Standard secret patterns (regex-based)
const SECRET_PATTERNS: PatternDef[] = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, severity: 'CRITICAL', message: 'AWS Access Key ID detected' },
  { name: 'AWS Secret Key', regex: /(?:aws_secret_access_key|secret_key)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi, severity: 'CRITICAL', message: 'AWS Secret Access Key detected' },
  { name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,255}/g, severity: 'CRITICAL', message: 'GitHub token detected' },
  { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9]{20,}/g, severity: 'CRITICAL', message: 'OpenAI API key detected' },
  { name: 'Anthropic API Key', regex: /sk-ant-[A-Za-z0-9-]{20,}/g, severity: 'CRITICAL', message: 'Anthropic API key detected' },
  { name: 'Stripe Key', regex: /[sr]k_(live|test)_[A-Za-z0-9]{20,}/g, severity: 'CRITICAL', message: 'Stripe API key detected' },
  { name: 'Database URL', regex: /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/g, severity: 'CRITICAL', message: 'Database connection string with credentials detected' },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: 'CRITICAL', message: 'Private key detected' },
  { name: 'Generic API Key Assignment', regex: /(?:api_key|apikey|api_secret|secret_key|auth_token|access_token)\s*[=:]\s*['"]([A-Za-z0-9_\-]{16,})['"](?!\s*(?:\/\/|#)\s*(?:placeholder|example|test|fake|dummy))/gi, severity: 'WARNING', message: 'Possible API key or secret in assignment' },
  { name: 'Bearer Token', regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, severity: 'WARNING', message: 'Bearer token detected' },
  { name: 'Password Assignment', regex: /(?:password|passwd|pwd)\s*[=:]\s*['"]([^'"]{8,})['"](?!\s*(?:\/\/|#)\s*(?:placeholder|example|test|fake|dummy))/gi, severity: 'WARNING', message: 'Hardcoded password detected' },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z-]{10,}/g, severity: 'CRITICAL', message: 'Slack token detected' },
  { name: 'Twilio Key', regex: /SK[0-9a-fA-F]{32}/g, severity: 'CRITICAL', message: 'Twilio API key detected' },
  { name: 'SendGrid Key', regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, severity: 'CRITICAL', message: 'SendGrid API key detected' },
];

// AI-specific patterns (heuristic, not regex-only)
const AI_PATTERNS = {
  // Env var inlined instead of referenced
  inlinedEnvVar: /(?:const|let|var)\s+\w+\s*=\s*['"](?:postgres|mysql|mongodb|redis|https?):\/\/[^'"]+['"]/g,
  // Real values in .env.example or .env.sample
  realValueInExample: /^[A-Z_]+=(?!your_|<|placeholder|example|changeme|xxx|TODO)[A-Za-z0-9_\-]{16,}/gm,
  // Hardcoded URLs with credentials
  hardcodedCredUrl: /['"]https?:\/\/[^:]+:[^@]+@[^'"]+['"]/g,
  // Disabled SSL
  disabledSsl: /rejectUnauthorized\s*:\s*false/g,
  // Overly permissive CORS
  wildcardCors: /(?:cors|origin)\s*[=:]\s*['"]\*['"]/gi,
};

// Known placeholders and test values to SKIP (reduce false positives)
const PLACEHOLDER_PATTERNS = [
  /^sk-(?:test|fake|dummy|placeholder|example|xxx|your)[_-]/i,
  /^(?:test|fake|dummy|placeholder|example|changeme|TODO|your_)/i,
  /^(?:xxx|aaa|bbb|123|abc)/i,
  /<[A-Z_]+>/,  // <YOUR_API_KEY> style
  /^(?:pk_test|sk_test)_/,  // Stripe test keys are fine
];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(value));
}

function isTestFile(filepath: string): boolean {
  const lower = filepath.toLowerCase();
  return (
    lower.includes('test') ||
    lower.includes('spec') ||
    lower.includes('mock') ||
    lower.includes('fixture') ||
    lower.includes('__tests__')
  );
}

function redactValue(value: string): string {
  if (value.length <= 8) return '***';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

/**
 * Scans file content for secrets and AI-specific security patterns.
 * Returns findings sorted by severity (CRITICAL first).
 */
export function detectSecrets(
  content: string,
  filepath: string,
  options?: { skipTests?: boolean; skipPlaceholders?: boolean }
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split('\n');
  const skipTests = options?.skipTests ?? true;
  const skipPlaceholders = options?.skipPlaceholders ?? true;

  if (skipTests && isTestFile(filepath)) return findings;

  // Standard secret patterns
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(content)) !== null) {
      const value = match[1] ?? match[0];
      if (skipPlaceholders && isPlaceholder(value)) continue;

      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;

      findings.push({
        severity: pattern.severity,
        type: pattern.name,
        value,
        redacted: redactValue(value),
        line,
        column,
        file: filepath,
        message: pattern.message,
        isAiPattern: false,
      });
    }
  }

  // AI-specific: env vars inlined in code
  const isExampleFile = /\.example|\.sample|\.template/i.test(filepath);

  if (!isExampleFile) {
    AI_PATTERNS.inlinedEnvVar.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = AI_PATTERNS.inlinedEnvVar.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      findings.push({
        severity: 'WARNING',
        type: 'Inlined Environment Variable',
        value: match[0],
        redacted: redactValue(match[0]),
        line,
        column: 0,
        file: filepath,
        message: 'URL with credentials hardcoded in code instead of read from environment variable. AI coding tools often inline values instead of referencing process.env.',
        isAiPattern: true,
      });
    }
  }

  // AI-specific: real values in .env.example
  if (isExampleFile) {
    AI_PATTERNS.realValueInExample.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = AI_PATTERNS.realValueInExample.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      findings.push({
        severity: 'WARNING',
        type: 'Real Value in Example File',
        value: match[0],
        redacted: redactValue(match[0]),
        line,
        column: 0,
        file: filepath,
        message: 'Example/template file contains what looks like a real value instead of a placeholder. AI often copies real .env values into example files.',
        isAiPattern: true,
      });
    }
  }

  // AI-specific: disabled SSL
  AI_PATTERNS.disabledSsl.lastIndex = 0;
  let sslMatch: RegExpExecArray | null;
  while ((sslMatch = AI_PATTERNS.disabledSsl.exec(content)) !== null) {
    const beforeMatch = content.slice(0, sslMatch.index);
    const line = beforeMatch.split('\n').length;
    findings.push({
      severity: 'INFO',
      type: 'Disabled SSL Verification',
      value: sslMatch[0],
      redacted: sslMatch[0],
      line,
      column: 0,
      file: filepath,
      message: 'SSL verification disabled. AI adds this to "make it work" during development but it should not ship to production.',
      isAiPattern: true,
    });
  }

  // AI-specific: wildcard CORS
  AI_PATTERNS.wildcardCors.lastIndex = 0;
  let corsMatch: RegExpExecArray | null;
  while ((corsMatch = AI_PATTERNS.wildcardCors.exec(content)) !== null) {
    const beforeMatch = content.slice(0, corsMatch.index);
    const line = beforeMatch.split('\n').length;
    findings.push({
      severity: 'WARNING',
      type: 'Wildcard CORS',
      value: corsMatch[0],
      redacted: corsMatch[0],
      line,
      column: 0,
      file: filepath,
      message: 'CORS set to wildcard (*). AI defaults to permissive CORS to avoid errors during development.',
      isAiPattern: true,
    });
  }

  // Sort by severity: CRITICAL > WARNING > INFO
  const severityOrder: Record<SecretSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return findings;
}

/**
 * Scans multiple files and returns aggregate results.
 */
export function scanFiles(
  files: { path: string; content: string }[],
  options?: { skipTests?: boolean; skipPlaceholders?: boolean }
): { findings: SecretFinding[]; scannedFiles: number; scanTimeMs: number } {
  const start = Date.now();
  const allFindings: SecretFinding[] = [];

  for (const file of files) {
    const findings = detectSecrets(file.content, file.path, options);
    allFindings.push(...findings);
  }

  return {
    findings: allFindings,
    scannedFiles: files.length,
    scanTimeMs: Date.now() - start,
  };
}
