export interface CalibrationEntry {
  intent: string;
  confidence: number;
  verdict: string;
  userDecision: 'CONFIRMED' | 'CANCELLED' | null;
}

export interface CalibrationResult {
  intent: string;
  totalActions: number;
  meanConfidence: number;
  overconfidentCount: number;
  underconfidentCount: number;
  recommendedThreshold: number;
  isMiscalibrated: boolean;
}

export interface CalibrationReport {
  results: CalibrationResult[];
  miscalibratedIntents: string[];
  summary: string;
}

/**
 * Analyzes action logs for per-intent confidence calibration.
 * Requires at least `minSampleSize` entries per intent to produce results.
 */
export function auditCalibration(
  actionLog: CalibrationEntry[],
  minSampleSize: number = 20
): CalibrationReport {
  const byIntent = new Map<string, CalibrationEntry[]>();

  for (const entry of actionLog) {
    const intent = entry.intent || 'unknown';
    if (!byIntent.has(intent)) byIntent.set(intent, []);
    byIntent.get(intent)!.push(entry);
  }

  const results: CalibrationResult[] = [];
  const miscalibrated: string[] = [];

  for (const [intent, entries] of byIntent) {
    if (entries.length < minSampleSize) continue;

    const total = entries.length;
    const meanConf = entries.reduce((s, e) => s + e.confidence, 0) / total;

    const overconfident = entries.filter(
      (e) => e.confidence > 0.72 && e.userDecision === 'CANCELLED'
    );
    const underconfident = entries.filter(
      (e) => e.confidence < 0.72 && e.userDecision === 'CONFIRMED'
    );

    const ocRate = overconfident.length / total;
    const ucRate = underconfident.length / total;
    const isMiscalibrated = ocRate > 0.15 || ucRate > 0.15;

    const cancelled = entries
      .filter((e) => e.userDecision === 'CANCELLED')
      .map((e) => e.confidence);
    const confirmed = entries
      .filter((e) => e.userDecision === 'CONFIRMED')
      .map((e) => e.confidence);

    let recommended = 0.72;
    if (cancelled.length > 0) {
      recommended = Math.max(...cancelled) + 0.05;
    } else if (confirmed.length > 0) {
      recommended = Math.min(...confirmed) - 0.05;
    }
    recommended = Math.max(0.3, Math.min(0.95, recommended));

    if (isMiscalibrated) miscalibrated.push(intent);

    results.push({
      intent,
      totalActions: total,
      meanConfidence: Math.round(meanConf * 1000) / 1000,
      overconfidentCount: overconfident.length,
      underconfidentCount: underconfident.length,
      recommendedThreshold: Math.round(recommended * 100) / 100,
      isMiscalibrated,
    });
  }

  return {
    results,
    miscalibratedIntents: miscalibrated,
    summary: miscalibrated.length > 0
      ? `${miscalibrated.length} intent(s) miscalibrated: ${miscalibrated.join(', ')}`
      : 'All intents well-calibrated',
  };
}
