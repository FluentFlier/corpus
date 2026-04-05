import type { ActionLogEntry, PolicyResult, CorpusConfig, CorpusInput } from './types.js';
export declare function buildLogEntry(input: CorpusInput, result: PolicyResult, verdict: string, userDecision: 'CONFIRMED' | 'CANCELLED' | null, projectSlug: string, durationMs: number): ActionLogEntry;
/**
 * Fire-and-forget log sender. Never awaited. Never throws.
 * Sends only behavioral metadata, never actionPayload.
 */
export declare function sendLogEntry(entry: ActionLogEntry, config: CorpusConfig): void;
