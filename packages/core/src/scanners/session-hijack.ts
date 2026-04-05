export interface SessionEvent {
  /** Timestamp in seconds since epoch (NOT milliseconds). Use Date.now() / 1000. */
  timestampEpoch: number;
  sourceApp: string;
  contentType?: string;
  contentLength?: number;
}

export interface SessionCheckResult {
  valid: boolean;
  severity: 'OK' | 'SUSPICIOUS' | 'BLOCKED';
  message: string;
}

/**
 * Validates session event patterns to detect automated injection attempts.
 */
export function checkSessionIntegrity(
  events: SessionEvent[],
  maxEventsPerSecond: number = 3,
  minIntervalMs: number = 200
): SessionCheckResult {
  if (events.length < 2) {
    return { valid: true, severity: 'OK', message: '' };
  }

  const sorted = [...events].sort((a, b) => a.timestampEpoch - b.timestampEpoch);

  // Check rapid-fire events
  let rapidCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const intervalMs = (sorted[i].timestampEpoch - sorted[i - 1].timestampEpoch) * 1000;
    if (intervalMs < minIntervalMs) {
      rapidCount++;
    }
  }

  if (rapidCount > 2) {
    return {
      valid: false,
      severity: 'BLOCKED',
      message: `Automated session detected: ${rapidCount} events with <${minIntervalMs}ms intervals.`,
    };
  }

  // Check event rate
  const timeSpan = sorted[sorted.length - 1].timestampEpoch - sorted[0].timestampEpoch;
  if (timeSpan > 0) {
    const rate = sorted.length / timeSpan;
    if (rate > maxEventsPerSecond) {
      return {
        valid: false,
        severity: 'BLOCKED',
        message: `Event rate ${rate.toFixed(1)}/s exceeds max of ${maxEventsPerSecond}/s.`,
      };
    }
  }

  // Check for suspiciously uniform content
  const sources = new Set(sorted.map((e) => e.sourceApp));
  if (sources.size === 1 && sorted.length > 3) {
    const lengths = sorted.map((e) => e.contentLength ?? 0).filter((l) => l > 0);
    if (lengths.length > 3) {
      const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((a, l) => a + (l - avg) ** 2, 0) / lengths.length;
      if (variance < 10) {
        return {
          valid: false,
          severity: 'SUSPICIOUS',
          message: `Suspicious: ${sorted.length} events from '${[...sources][0]}' with near-identical content lengths.`,
        };
      }
    }
  }

  return { valid: true, severity: 'OK', message: '' };
}
