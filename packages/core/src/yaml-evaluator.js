/**
 * Evaluates a VouchInput against a PolicyFile.
 * Returns the first matching rule's verdict, or PASS if no rule matches.
 * Rules are evaluated in order. First match wins.
 */
export function evaluateYamlPolicies(input, policyFile) {
    for (const rule of policyFile.rules) {
        if (ruleMatches(rule, input)) {
            return {
                verdict: rule.verdict,
                blockReason: rule.blockReason ?? null,
                message: rule.message,
                policyName: rule.name,
                requiresConfirmation: rule.verdict === 'CONFIRM',
            };
        }
    }
    return {
        verdict: 'PASS',
        blockReason: null,
        message: '',
        policyName: '__no_match__',
        requiresConfirmation: false,
    };
}
function ruleMatches(rule, input) {
    const t = rule.trigger;
    const actionLower = input.actionType.toLowerCase();
    // actionType: exact match (string or array)
    if (t.actionType !== undefined) {
        const types = Array.isArray(t.actionType) ? t.actionType : [t.actionType];
        if (!types.some((a) => actionLower === a.toLowerCase()))
            return false;
    }
    // actionContains: substring match
    if (t.actionContains !== undefined) {
        const needles = Array.isArray(t.actionContains) ? t.actionContains : [t.actionContains];
        if (!needles.some((n) => actionLower.includes(n.toLowerCase())))
            return false;
    }
    // actionStartsWith: prefix match
    if (t.actionStartsWith !== undefined) {
        const prefixes = Array.isArray(t.actionStartsWith) ? t.actionStartsWith : [t.actionStartsWith];
        if (!prefixes.some((p) => actionLower.startsWith(p.toLowerCase())))
            return false;
    }
    // contextKey + contextValue* checks
    if (t.contextKey !== undefined) {
        const ctxValue = input.context?.[t.contextKey];
        if (ctxValue === undefined)
            return false;
        if (t.contextValueIn !== undefined) {
            if (!t.contextValueIn.includes(ctxValue))
                return false;
        }
        if (t.contextValueBelow !== undefined) {
            if (typeof ctxValue !== 'number' || ctxValue >= t.contextValueBelow)
                return false;
        }
        if (t.contextValueAbove !== undefined) {
            if (typeof ctxValue !== 'number' || ctxValue <= t.contextValueAbove)
                return false;
        }
    }
    // userApproved check
    if (t.userApproved !== undefined) {
        if ((input.userApproved ?? false) !== t.userApproved)
            return false;
    }
    return true;
}
/**
 * Loads and parses a vouch.policy.yaml file.
 * Throws if the file is missing or malformed.
 */
export async function loadPolicyFile(policyPath) {
    const { readFile } = await import('fs/promises');
    const { parse } = await import('yaml');
    const raw = await readFile(policyPath, 'utf-8');
    const parsed = parse(raw);
    if (!parsed.agent || !Array.isArray(parsed.rules)) {
        throw new Error(`Invalid policy file at ${policyPath}. Must have 'agent' and 'rules' fields.`);
    }
    return parsed;
}
