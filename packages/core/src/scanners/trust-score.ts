import { detectSecrets, type SecretFinding } from './secret-detector.js';
import { checkCodeSafety, type SafetyFinding } from './code-safety.js';
import { scanPayload, type PiiMatch } from './exfiltration-guard.js';

export interface TrustFinding {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  type: string;
  line: number;
  message: string;
  fix: string;
  isAiPattern: boolean;
}

export interface FileTrustResult {
  file: string;
  score: number;
  findings: TrustFinding[];
  lines: number;
}

export interface CodebaseTrustResult {
  score: number;
  files: FileTrustResult[];
  totalFiles: number;
  criticalFiles: number;
  warningFiles: number;
  cleanFiles: number;
  scanTimeMs: number;
}

// Severity deductions
const DEDUCTIONS = {
  CRITICAL: 15,
  WARNING: 5,
  INFO: 1,
};

const CAPS = {
  CRITICAL: 60,
  WARNING: 25,
  INFO: 10,
};

// Test file multiplier
const TEST_MULTIPLIER = 0.5;

function isTestFile(filepath: string): boolean {
  const l = filepath.toLowerCase();
  return l.includes('test') || l.includes('spec') || l.includes('__tests__') || l.includes('fixture');
}

// Fix suggestions for each finding type
const FIX_MAP: Record<string, string> = {
  'AWS Access Key': 'Move to environment variable: process.env.AWS_ACCESS_KEY_ID',
  'GitHub Token': 'Move to environment variable: process.env.GITHUB_TOKEN',
  'OpenAI API Key': 'Move to environment variable: process.env.OPENAI_API_KEY',
  'Anthropic API Key': 'Move to environment variable: process.env.ANTHROPIC_API_KEY',
  'Stripe Key': 'Move to environment variable: process.env.STRIPE_SECRET_KEY',
  'Database URL': 'Move to environment variable: process.env.DATABASE_URL',
  'Private Key': 'Move to a secure key store or .env file (never commit)',
  'Slack Token': 'Move to environment variable: process.env.SLACK_TOKEN',
  'SendGrid Key': 'Move to environment variable: process.env.SENDGRID_API_KEY',
  'Generic API Key Assignment': 'Replace with process.env.YOUR_KEY_NAME',
  'Bearer Token': 'Load from secure token store, not hardcoded',
  'Password Assignment': 'Move to environment variable or secret manager',
  'Inlined Environment Variable': 'Use process.env.VARIABLE_NAME instead of hardcoding the URL',
  'Real Value in Example File': 'Replace with a placeholder like YOUR_VALUE_HERE',
  'Disabled SSL Verification': 'Set rejectUnauthorized: true (only disable in development)',
  'Wildcard CORS': 'Set a specific origin: process.env.CORS_ORIGIN',
  'eval_usage': 'Use JSON.parse() for data or Function() for dynamic code',
  'innerHTML_assignment': 'Use textContent for text, or sanitize with DOMPurify',
  'sql_concatenation': 'Use parameterized queries or an ORM',
  'exec_usage': 'Use execFile() with an argument array',
  'disabled_auth': 'Ensure authentication is enabled in production',
  'hardcoded_ip': 'Use process.env.HOST for binding address',
  'chmod_777': 'Use minimum required permissions (755 for executables, 644 for files)',
  'console_log_sensitive': 'Remove sensitive data from log output or use a debug wrapper',
  'todo_security': 'Address this security TODO before shipping to production',
  'no_verify_flag': 'Remove bypass flags before production deployment',
  'debug_endpoint': 'Gate behind authentication or remove before deployment',
  'wildcard_permissions': 'Use least-privilege: specify exact actions and resources',
};

function getFix(type: string): string {
  return FIX_MAP[type] ?? 'Review and fix manually';
}

/**
 * Compute trust score for a single file.
 */
export function computeFileTrust(content: string, filepath: string): FileTrustResult {
  const findings: TrustFinding[] = [];
  const lines = content.split('\n').length;
  const isTF = isTestFile(filepath);

  // Run secret detector
  const secrets = detectSecrets(content, filepath, { skipTests: false, skipPlaceholders: true });
  for (const s of secrets) {
    findings.push({
      severity: s.severity,
      type: s.type,
      line: s.line,
      message: s.message,
      fix: getFix(s.type),
      isAiPattern: s.isAiPattern,
    });
  }

  // Run code safety
  const safety = checkCodeSafety(content, filepath);
  for (const s of safety) {
    findings.push({
      severity: s.severity,
      type: s.rule,
      line: s.line,
      message: s.message,
      fix: s.suggestion,
      isAiPattern: false,
    });
  }

  // Run PII scan
  const pii = scanPayload(content);
  if (pii.hasPii) {
    for (const m of pii.matches) {
      findings.push({
        severity: m.type === 'SSN' || m.type === 'CREDIT_CARD' ? 'CRITICAL' : 'INFO',
        type: `PII: ${m.type}`,
        line: 0,
        message: `${m.type} found in source code`,
        fix: `Remove or redact ${m.type} from source code`,
        isAiPattern: false,
      });
    }
  }

  // Error handling checks (regex-based)
  const fetchWithoutTry = /(?:await\s+)?fetch\s*\([^)]*\)/g;
  let fetchMatch: RegExpExecArray | null;
  while ((fetchMatch = fetchWithoutTry.exec(content)) !== null) {
    const before = content.slice(Math.max(0, fetchMatch.index - 200), fetchMatch.index);
    if (!before.includes('try') && !before.includes('catch') && !before.includes('.catch')) {
      const line = content.slice(0, fetchMatch.index).split('\n').length;
      findings.push({
        severity: 'WARNING',
        type: 'unhandled_fetch',
        line,
        message: 'fetch() call without error handling',
        fix: 'Wrap in try/catch or add .catch() handler',
        isAiPattern: true,
      });
    }
  }

  // Compute score
  let criticalDeductions = 0;
  let warningDeductions = 0;
  let infoDeductions = 0;

  for (const f of findings) {
    const mult = isTF ? TEST_MULTIPLIER : 1;
    if (f.severity === 'CRITICAL') {
      criticalDeductions += DEDUCTIONS.CRITICAL * mult;
    } else if (f.severity === 'WARNING') {
      warningDeductions += DEDUCTIONS.WARNING * mult;
    } else {
      infoDeductions += DEDUCTIONS.INFO * mult;
    }
  }

  criticalDeductions = Math.min(criticalDeductions, CAPS.CRITICAL);
  warningDeductions = Math.min(warningDeductions, CAPS.WARNING);
  infoDeductions = Math.min(infoDeductions, CAPS.INFO);

  const score = Math.max(0, Math.round(100 - criticalDeductions - warningDeductions - infoDeductions));

  return { file: filepath, score, findings, lines };
}

/**
 * Compute trust score for an entire codebase.
 */
export function computeCodebaseTrust(
  files: { path: string; content: string }[]
): CodebaseTrustResult {
  const start = Date.now();
  const results: FileTrustResult[] = [];

  for (const file of files) {
    const result = computeFileTrust(file.content, file.path);
    results.push(result);
  }

  // Weighted average by lines of code (exclude tiny files)
  const scoredFiles = results.filter((r) => r.lines >= 5);
  const totalLines = scoredFiles.reduce((s, r) => s + r.lines, 0);
  const weightedScore = totalLines > 0
    ? scoredFiles.reduce((s, r) => s + r.score * r.lines, 0) / totalLines
    : 100;

  return {
    score: Math.round(weightedScore),
    files: results.sort((a, b) => a.score - b.score),
    totalFiles: results.length,
    criticalFiles: results.filter((r) => r.score < 50).length,
    warningFiles: results.filter((r) => r.score >= 50 && r.score < 80).length,
    cleanFiles: results.filter((r) => r.score >= 80).length,
    scanTimeMs: Date.now() - start,
  };
}
