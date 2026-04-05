export class VouchBlockedError extends Error {
    policyName;
    blockReason;
    constructor(policyName, blockReason, message) {
        super(`[vouch] Policy '${policyName}' blocked this action: ${message}`);
        this.name = 'VouchBlockedError';
        this.policyName = policyName;
        this.blockReason = blockReason;
    }
}
export class VouchConfigError extends Error {
    constructor(message) {
        super(`[vouch] Config error: ${message}`);
        this.name = 'VouchConfigError';
    }
}
