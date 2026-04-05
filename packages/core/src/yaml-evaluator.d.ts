import type { PolicyFile, PolicyResult, CorpusInput } from './types.js';
/**
 * Evaluates a CorpusInput against a PolicyFile.
 * Returns the first matching rule's verdict, or PASS if no rule matches.
 * Rules are evaluated in order. First match wins.
 */
export declare function evaluateYamlPolicies(input: CorpusInput, policyFile: PolicyFile): PolicyResult;
/**
 * Loads and parses a corpus.policy.yaml file.
 * Throws if the file is missing or malformed.
 */
export declare function loadPolicyFile(policyPath: string): Promise<PolicyFile>;
