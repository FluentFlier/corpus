export type SafetySeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface SafetyFinding {
  severity: SafetySeverity;
  rule: string;
  line: number;
  file: string;
  message: string;
  suggestion: string;
}

interface SafetyRule {
  name: string;
  regex: RegExp;
  severity: SafetySeverity;
  message: string;
  suggestion: string;
  fileFilter?: RegExp;
}

const SAFETY_RULES: SafetyRule[] = [
  // Security
  {
    name: 'eval_usage',
    regex: /\beval\s*\(/g,
    severity: 'CRITICAL',
    message: 'eval() usage detected. This enables arbitrary code execution.',
    suggestion: 'Use JSON.parse() for data, or Function() constructor if dynamic code is unavoidable.',
  },
  {
    name: 'innerHTML_assignment',
    regex: /\.innerHTML\s*=/g,
    severity: 'WARNING',
    message: 'Direct innerHTML assignment. Risk of XSS if content is user-controlled.',
    suggestion: 'Use textContent for text, or sanitize HTML with DOMPurify before insertion.',
  },
  {
    name: 'sql_concatenation',
    regex: /(?:SELECT|INSERT|UPDATE|DELETE|DROP)\s+.*\+\s*(?:req\.|params\.|query\.|body\.)/gi,
    severity: 'CRITICAL',
    message: 'SQL query built with string concatenation. SQL injection risk.',
    suggestion: 'Use parameterized queries or an ORM.',
  },
  {
    name: 'exec_usage',
    regex: /(?:child_process\.)?exec\s*\(\s*(?:`[^`]*\$\{|['"][^'"]*\+)/g,
    severity: 'CRITICAL',
    message: 'Shell command built with dynamic input. Command injection risk.',
    suggestion: 'Use execFile() with an argument array instead of exec() with string interpolation.',
  },
  {
    name: 'disabled_auth',
    regex: /(?:auth|authentication|authorize)\s*[=:]\s*(?:false|null|undefined|'none'|"none")/gi,
    severity: 'WARNING',
    message: 'Authentication appears to be disabled.',
    suggestion: 'Ensure this is intentional and only in development/test environments.',
  },
  {
    name: 'hardcoded_ip',
    regex: /['"](?:0\.0\.0\.0|127\.0\.0\.1)(?::\d+)?['"]/g,
    severity: 'INFO',
    message: 'Hardcoded IP address. May bind to all interfaces (0.0.0.0) in production.',
    suggestion: 'Use environment variable for host binding. 0.0.0.0 exposes the service to all network interfaces.',
  },
  {
    name: 'chmod_777',
    regex: /chmod\s+777/g,
    severity: 'WARNING',
    message: 'chmod 777 gives all users read/write/execute permissions.',
    suggestion: 'Use the minimum required permissions (e.g., 755 for executables, 644 for files).',
  },
  {
    name: 'console_log_sensitive',
    regex: /console\.log\s*\([^)]*(?:password|secret|token|key|credential|auth)[^)]*\)/gi,
    severity: 'WARNING',
    message: 'console.log may be logging sensitive data.',
    suggestion: 'Remove or redact sensitive values before logging.',
  },
  {
    name: 'todo_security',
    regex: /\/\/\s*TODO:?\s*(?:fix|add|implement)\s*(?:auth|security|validation|sanitiz)/gi,
    severity: 'INFO',
    message: 'Security-related TODO found. This may indicate incomplete security implementation.',
    suggestion: 'Address security TODOs before shipping to production.',
  },
  {
    name: 'no_verify_flag',
    regex: /--no-verify|--no-check|--insecure|--skip-ssl/g,
    severity: 'WARNING',
    message: 'Security verification bypass flag detected.',
    suggestion: 'Remove bypass flags before shipping to production.',
    fileFilter: /\.(sh|bash|yml|yaml|json|toml)$/,
  },
  {
    name: 'debug_endpoint',
    regex: /(?:app|router|server)\.\s*(?:get|post|use)\s*\(\s*['"]\/(?:debug|test|admin|internal)/g,
    severity: 'WARNING',
    message: 'Debug/admin endpoint detected. May be accessible in production.',
    suggestion: 'Gate behind authentication or remove before deployment.',
  },
  {
    name: 'wildcard_permissions',
    regex: /"(?:Action|Resource)"\s*:\s*"\*"/g,
    severity: 'CRITICAL',
    message: 'Wildcard IAM permission detected. Overly permissive.',
    suggestion: 'Use least-privilege permissions. Specify exact actions and resources.',
    fileFilter: /\.(json|yaml|yml|tf)$/,
  },
];

/**
 * Scans file content for unsafe code patterns.
 */
export function checkCodeSafety(
  content: string,
  filepath: string
): SafetyFinding[] {
  const findings: SafetyFinding[] = [];

  for (const rule of SAFETY_RULES) {
    if (rule.fileFilter && !rule.fileFilter.test(filepath)) continue;

    rule.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;

      findings.push({
        severity: rule.severity,
        rule: rule.name,
        line,
        file: filepath,
        message: rule.message,
        suggestion: rule.suggestion,
      });
    }
  }

  return findings;
}
