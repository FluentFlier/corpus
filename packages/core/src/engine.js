import path from 'path';
import { fileURLToPath } from 'url';
import { evaluateYamlPolicies, loadPolicyFile } from './yaml-evaluator.js';
import { runJacWalker } from './subprocess.js';
import { DEFAULT_POLICY_EVAL_TIMEOUT_MS } from './constants.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_POLICY_DIR = path.resolve(__dirname, '../../../policies/builtin');
export async function evaluatePolicies(input, config) {
    const start = Date.now();
    const timeout = config.timeouts?.policyEvalMs ?? DEFAULT_POLICY_EVAL_TIMEOUT_MS;
    // Load the developer's policy file
    const policyFile = await loadPolicyFile(config.policyPath);
    // Step 1: Evaluate YAML rules (developer-defined, fast, synchronous)
    const yamlResult = evaluateYamlPolicies(input, policyFile);
    if (yamlResult.verdict !== 'PASS') {
        return { result: yamlResult, durationMs: Date.now() - start };
    }
    // Step 2: Built-in action safety walker (hard rules, always runs)
    const safetyResult = await runJacWalker(path.join(BUILTIN_POLICY_DIR, 'action_safety.jac'), 'CheckActionSafety', {
        action_type: input.actionType,
        user_approved: input.userApproved ?? false,
    }, timeout);
    if (safetyResult.verdict !== 'PASS') {
        return { result: safetyResult, durationMs: Date.now() - start };
    }
    // Step 3: Scope guard (only if policy declares allowed_actions)
    if (policyFile.allowedActions && policyFile.allowedActions.length > 0) {
        const scopeResult = await runJacWalker(path.join(BUILTIN_POLICY_DIR, 'scope_guard.jac'), 'CheckScope', {
            action_type: input.actionType,
            allowed_actions: policyFile.allowedActions,
            intent_context: String(input.context?.intent ?? ''),
        }, timeout);
        if (scopeResult.verdict !== 'PASS') {
            return { result: scopeResult, durationMs: Date.now() - start };
        }
    }
    // Step 4: Rate guard (only if policy declares rate limits)
    if (policyFile.rateLimits) {
        const limit = policyFile.rateLimits[input.actionType] ?? policyFile.rateLimits['*'];
        if (limit) {
            const rateResult = await runJacWalker(path.join(BUILTIN_POLICY_DIR, 'rate_guard.jac'), 'CheckRateLimit', {
                action_type: input.actionType,
                limit: limit.count,
                window_seconds: limit.windowSeconds,
                current_epoch: Math.floor(Date.now() / 1000),
            }, timeout);
            if (rateResult.verdict !== 'PASS') {
                return { result: rateResult, durationMs: Date.now() - start };
            }
        }
    }
    // Step 5: Custom Jac extension (if declared in policy file)
    if (policyFile.jacExtension) {
        const customResult = await runJacWalker(policyFile.jacExtension, 'CheckCustom', { action_type: input.actionType, context: input.context ?? {} }, timeout);
        if (customResult.verdict !== 'PASS') {
            return { result: customResult, durationMs: Date.now() - start };
        }
    }
    return {
        result: {
            verdict: 'PASS',
            blockReason: null,
            message: '',
            policyName: '__pass__',
            requiresConfirmation: false,
        },
        durationMs: Date.now() - start,
    };
}
