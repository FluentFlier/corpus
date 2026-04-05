export interface PiiMatch {
  type: 'EMAIL' | 'PHONE' | 'SSN' | 'CREDIT_CARD' | 'IP_ADDRESS' | 'CONTEXT_PII';
  value: string;
  redacted: string;
}

export interface ExfiltrationScanResult {
  hasPii: boolean;
  matches: PiiMatch[];
  redactedPayload: string;
}

const PATTERNS: { type: PiiMatch['type']; regex: RegExp; redacted: string }[] = [
  { type: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, redacted: '[EMAIL_REDACTED]' },
  { type: 'PHONE', regex: /(\+?1?\s?)?(\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/g, redacted: '[PHONE_REDACTED]' },
  { type: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g, redacted: '[SSN_REDACTED]' },
  { type: 'CREDIT_CARD', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, redacted: '[CARD_REDACTED]' },
  { type: 'IP_ADDRESS', regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, redacted: '[IP_REDACTED]' },
];

/**
 * Scans a payload string for PII and returns matches + a redacted version.
 * Optionally checks for custom context fields (user names, etc.).
 */
export function scanPayload(
  payload: string,
  contextFields?: string[]
): ExfiltrationScanResult {
  const matches: PiiMatch[] = [];
  let redacted = payload;

  for (const { type, regex, redacted: redactedStr } of PATTERNS) {
    // Reset regex state
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(payload)) !== null) {
      const value = match[0];
      if (type === 'PHONE' && value.trim().length < 10) continue;
      matches.push({ type, value, redacted: redactedStr });
      redacted = redacted.replace(value, redactedStr);
    }
  }

  if (contextFields) {
    for (const field of contextFields) {
      if (field.length > 2 && payload.toLowerCase().includes(field.toLowerCase())) {
        matches.push({ type: 'CONTEXT_PII', value: field, redacted: '[PII_REDACTED]' });
        redacted = redacted.replace(new RegExp(escapeRegex(field), 'gi'), '[PII_REDACTED]');
      }
    }
  }

  return {
    hasPii: matches.length > 0,
    matches,
    redactedPayload: redacted,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convenience: redact a payload in-place and return just the cleaned string.
 */
export function redactPayload(payload: string, contextFields?: string[]): string {
  return scanPayload(payload, contextFields).redactedPayload;
}
