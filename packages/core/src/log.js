import { randomUUID } from 'crypto';
import { debug } from './logger.js';
import { INGEST_PATH } from './constants.js';
export function buildLogEntry(input, result, verdict, userDecision, projectSlug, durationMs) {
    return {
        id: randomUUID(),
        projectSlug,
        actionType: input.actionType,
        verdict: result.verdict,
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
export function sendLogEntry(entry, config) {
    const url = `${config.apiEndpoint}${INGEST_PATH}`;
    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-vouch-key': config.apiKey,
        },
        body: JSON.stringify(entry),
    }).catch((err) => {
        debug('Failed to send log entry', err instanceof Error ? err.message : err);
    });
}
