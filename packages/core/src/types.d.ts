/** The outcome of evaluating an agent action against all policies. */
export type Verdict = 'PASS' | 'BLOCK' | 'CONFIRM';
/** Reason categories for BLOCK verdicts. Human-readable by design. */
export type BlockReason = 'DESTRUCTIVE_ACTION' | 'AUTO_SEND' | 'EXTERNAL_WRITE' | 'SCOPE_VIOLATION' | 'LOW_CONFIDENCE' | 'RATE_EXCEEDED' | 'UNKNOWN_ACTION' | 'CUSTOM';
/** Result returned by a single policy check. */
export interface PolicyResult {
    verdict: Verdict;
    blockReason: BlockReason | null;
    /** Human-readable message, safe to show to end users. */
    message: string;
    /** Which policy produced this result. */
    policyName: string;
    requiresConfirmation: boolean;
}
/** A single YAML policy rule. */
export interface PolicyRule {
    name: string;
    verdict: Verdict;
    message: string;
    blockReason?: BlockReason;
    trigger: {
        actionType?: string | string[];
        actionContains?: string | string[];
        actionStartsWith?: string | string[];
        contextKey?: string;
        contextValueIn?: unknown[];
        contextValueBelow?: number;
        contextValueAbove?: number;
        userApproved?: boolean;
    };
}
/** A complete corpus.policy.yaml file parsed into memory. */
export interface PolicyFile {
    agent: string;
    version: string;
    rules: PolicyRule[];
    /** Path to a .jac file for complex rules evaluated after YAML rules. */
    jacExtension?: string;
    /** Allowed action prefixes for scope guard. */
    allowedActions?: string[];
    /** Rate limits per action type. */
    rateLimits?: Record<string, {
        count: number;
        windowSeconds: number;
    }>;
}
/**
 * What the developer passes to corpus.protect().
 * actionPayload is accepted but never stored or logged.
 */
export interface CorpusInput {
    /** What the agent wants to do. Maps to policy rule triggers. */
    actionType: string;
    /** The data the action will operate on. Never stored by Corpus. */
    actionPayload?: Record<string, unknown>;
    /**
     * Arbitrary key-value context from the agent.
     * Use this to pass intent, confidence, source, etc.
     */
    context?: Record<string, unknown>;
    /** True if the user has already explicitly confirmed this action. */
    userApproved?: boolean;
}
/** What gets stored in the database. Intentionally minimal. No user content. */
export interface ActionLogEntry {
    id: string;
    projectSlug: string;
    actionType: string;
    verdict: Verdict;
    userDecision: 'CONFIRMED' | 'CANCELLED' | null;
    policyTriggered: string;
    blockReason: BlockReason | null;
    durationMs: number;
    timestamp: string;
}
export interface CorpusConfig {
    projectSlug: string;
    apiEndpoint: string;
    apiKey: string;
    /**
     * observe: records verdicts but never blocks execution. Use during beta.
     * enforce: fully enforces BLOCK and CONFIRM verdicts.
     */
    mode: 'observe' | 'enforce';
    /** Path to corpus.policy.yaml or a directory of policy files. */
    policyPath: string;
    thresholds?: {
        /** Actions with context.confidence below this are BLOCK. Default: 0.50 */
        confidenceBlock?: number;
        /** Actions with context.confidence below this are CONFIRM. Default: 0.72 */
        confidenceConfirm?: number;
    };
    timeouts?: {
        /** Max ms for Jac policy subprocess. Default: 200 */
        policyEvalMs?: number;
        /** Undo window in ms after action executes. Default: 5000 */
        undoWindowMs?: number;
    };
}
/**
 * Callbacks the developer implements to connect Corpus to their UI.
 * All hooks are optional in observe mode.
 */
export interface CorpusHooks<TResult = unknown> {
    onConfirmRequired?: (message: string, confirm: () => Promise<TResult | null>, cancel: () => void) => void;
    onBlocked?: (message: string, reason: BlockReason | null) => void;
    onUndoAvailable?: (message: string, undo: () => Promise<void>, msRemaining: number) => void;
    onPolicyEvalComplete?: (result: PolicyResult, durationMs: number) => void;
}
export declare class CorpusBlockedError extends Error {
    readonly policyName: string;
    readonly blockReason: BlockReason | null;
    constructor(policyName: string, blockReason: BlockReason | null, message: string);
}
export declare class CorpusConfigError extends Error {
    constructor(message: string);
}
