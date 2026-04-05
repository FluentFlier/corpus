export type InjectionSeverity = 'CLEAN' | 'SUSPICIOUS' | 'BLOCK';

export interface InjectionScanResult {
  severity: InjectionSeverity;
  pattern: string | null;
  category: 'instruction_override' | 'role_escalation' | 'exfiltration' | 'encoded_payload' | null;
  message: string;
}

const INSTRUCTION_OVERRIDE = [
  'ignore previous instructions', 'ignore all previous', 'disregard above',
  'forget everything', 'new task:', 'new instructions:', 'you are now',
  'your new role', 'override:', 'ignore the above', 'do not follow',
  'stop following', 'from now on', 'reset your instructions',
  'pretend you are', 'act as if',
];

const ROLE_ESCALATION = [
  'you are an admin', 'you are root', 'you have full access',
  'system prompt', 'developer mode', 'sudo mode', 'unrestricted mode',
  'jailbreak', 'god mode', 'bypass safety', 'bypass filters',
  'no restrictions', 'without limitations', 'act as an unrestricted',
  'dan mode',
];

const EXFILTRATION = [
  'send to', 'forward to', 'email to', 'post to', 'upload to',
  'exfiltrate', 'send all data', 'forward all emails', 'share with',
  'transmit to', 'copy to external', 'leak the',
];

/**
 * Scans content for prompt injection patterns.
 * Returns immediately on first match (fast path).
 */
export function scanForInjection(content: string, source?: string): InjectionScanResult {
  const lower = content.toLowerCase();
  const src = source ?? 'unknown';

  for (const pattern of INSTRUCTION_OVERRIDE) {
    if (lower.includes(pattern)) {
      return {
        severity: 'BLOCK',
        pattern,
        category: 'instruction_override',
        message: `Injection detected: instruction override '${pattern}' in content from '${src}'`,
      };
    }
  }

  for (const pattern of ROLE_ESCALATION) {
    if (lower.includes(pattern)) {
      return {
        severity: 'BLOCK',
        pattern,
        category: 'role_escalation',
        message: `Injection detected: role escalation '${pattern}' in content from '${src}'`,
      };
    }
  }

  for (const pattern of EXFILTRATION) {
    if (lower.includes(pattern)) {
      return {
        severity: 'SUSPICIOUS',
        pattern,
        category: 'exfiltration',
        message: `Suspicious: possible exfiltration pattern '${pattern}' in content from '${src}'`,
      };
    }
  }

  // Check for encoded payloads (high density of alphanumeric chars)
  if (content.length > 200) {
    const alphaCount = [...content].filter(
      (c) => /[a-zA-Z0-9/+=]/.test(c)
    ).length;
    const ratio = alphaCount / content.length;
    if (ratio > 0.95) {
      return {
        severity: 'SUSPICIOUS',
        pattern: `encoded_payload (density: ${ratio.toFixed(2)})`,
        category: 'encoded_payload',
        message: `Suspicious: possible encoded payload from '${src}'`,
      };
    }
  }

  return { severity: 'CLEAN', pattern: null, category: null, message: '' };
}
