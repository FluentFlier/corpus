import type { PolicyFile, PolicyResult, PolicyRule, CorpusInput } from './types.js';

/**
 * Evaluates a CorpusInput against a PolicyFile.
 * Returns the first matching rule's verdict, or PASS if no rule matches.
 * Rules are evaluated in order. First match wins.
 */
export function evaluateYamlPolicies(
  input: CorpusInput,
  policyFile: PolicyFile
): PolicyResult {
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

function ruleMatches(rule: PolicyRule, input: CorpusInput): boolean {
  if (!rule.trigger) return false;
  const t = rule.trigger;
  if (!input.actionType) return false;
  const actionLower = input.actionType.toLowerCase();

  // actionType: exact match (string or array)
  if (t.actionType !== undefined) {
    const types = Array.isArray(t.actionType) ? t.actionType : [t.actionType];
    if (!types.some((a) => actionLower === a.toLowerCase())) return false;
  }

  // actionContains: substring match
  if (t.actionContains !== undefined) {
    const needles = Array.isArray(t.actionContains) ? t.actionContains : [t.actionContains];
    if (!needles.some((n) => actionLower.includes(n.toLowerCase()))) return false;
  }

  // actionStartsWith: prefix match
  if (t.actionStartsWith !== undefined) {
    const prefixes = Array.isArray(t.actionStartsWith) ? t.actionStartsWith : [t.actionStartsWith];
    if (!prefixes.some((p) => actionLower.startsWith(p.toLowerCase()))) return false;
  }

  // contextKey + contextValue* checks
  if (t.contextKey !== undefined) {
    const ctxValue = input.context?.[t.contextKey];
    if (ctxValue === undefined) return false;

    if (t.contextValueIn !== undefined) {
      // Use loose comparison to handle YAML type coercion (number vs string)
      if (!t.contextValueIn.some((v) => String(v) === String(ctxValue))) return false;
    }
    if (t.contextValueBelow !== undefined) {
      if (typeof ctxValue !== 'number' || ctxValue >= t.contextValueBelow) return false;
    }
    if (t.contextValueAbove !== undefined) {
      if (typeof ctxValue !== 'number' || ctxValue <= t.contextValueAbove) return false;
    }
  }

  // userApproved check
  if (t.userApproved !== undefined) {
    if ((input.userApproved ?? false) !== t.userApproved) return false;
  }

  return true;
}

/**
 * Loads and parses a corpus.policy.yaml file.
 * Throws if the file is missing or malformed.
 */
export async function loadPolicyFile(policyPath: string): Promise<PolicyFile> {
  const { readFile } = await import('fs/promises');
  const { parse } = await import('yaml');

  const raw = await readFile(policyPath, 'utf-8');
  const parsed = parse(raw) as PolicyFile;

  if (!parsed.agent || !Array.isArray(parsed.rules)) {
    throw new Error(
      `Invalid policy file at ${policyPath}. Must have 'agent' and 'rules' fields.`
    );
  }

  if (!parsed.version) {
    parsed.version = '1.0';
  }

  // Validate individual rules have required fields
  for (let i = 0; i < parsed.rules.length; i++) {
    const rule = parsed.rules[i];
    if (!rule.name || !rule.verdict || !rule.trigger) {
      throw new Error(
        `Invalid rule at index ${i} in ${policyPath}. Rules must have 'name', 'verdict', and 'trigger' fields.`
      );
    }
    // Normalize verdict to uppercase (PASS, BLOCK, CONFIRM)
    rule.verdict = rule.verdict.toUpperCase() as 'PASS' | 'BLOCK' | 'CONFIRM';
    if (!['PASS', 'BLOCK', 'CONFIRM'].includes(rule.verdict)) {
      throw new Error(
        `Invalid verdict '${rule.verdict}' in rule '${rule.name}' at ${policyPath}. Must be PASS, BLOCK, or CONFIRM.`
      );
    }
  }

  return parsed;
}
