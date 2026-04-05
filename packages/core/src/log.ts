import { randomUUID } from 'crypto';
import { debug } from './logger.js';
import { INGEST_PATH } from './constants.js';
import type { ActionLogEntry, PolicyResult, CorpusConfig, CorpusInput } from './types.js';

export function buildLogEntry(
  input: CorpusInput,
  result: PolicyResult,
  verdict: string,
  userDecision: 'CONFIRMED' | 'CANCELLED' | null,
  projectSlug: string,
  durationMs: number
): ActionLogEntry {
  return {
    id: randomUUID(),
    projectSlug,
    actionType: input.actionType,
    verdict: verdict as ActionLogEntry['verdict'],
    userDecision,
    policyTriggered: result.policyName,
    blockReason: result.blockReason,
    durationMs,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fire-and-forget log sender. Never awaited. Never throws.
 * Sends only behavioral metadata, never actionPayload.
 */
export function sendLogEntry(entry: ActionLogEntry, config: CorpusConfig): void {
  const url = `${config.apiEndpoint}${INGEST_PATH}`;

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-corpus-key': config.apiKey,
    },
    body: JSON.stringify(entry),
  }).catch((err) => {
    debug('Failed to send log entry', err instanceof Error ? err.message : err);
  });
}
