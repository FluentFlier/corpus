import type { PolicyResult } from './types.js';
/**
 * Runs a Jac walker as a subprocess and returns its PolicyResult.
 *
 * If the subprocess times out, errors, or returns invalid JSON:
 *   Returns CONFIRM verdict (safe default -- never silently execute).
 *
 * This function NEVER throws. All errors become CONFIRM verdicts.
 */
export declare function runJacWalker(jacFilePath: string, walkerName: string, args: Record<string, unknown>, timeoutMs: number): Promise<PolicyResult>;
