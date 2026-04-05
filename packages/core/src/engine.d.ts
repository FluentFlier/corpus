import type { PolicyResult, CorpusInput, CorpusConfig } from './types.js';
export interface EvalResult {
    result: PolicyResult;
    durationMs: number;
}
export declare function evaluatePolicies(input: CorpusInput, config: CorpusConfig): Promise<EvalResult>;
