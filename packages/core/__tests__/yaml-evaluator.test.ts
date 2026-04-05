import { describe, it, expect } from 'vitest';
import { evaluateYamlPolicies } from '../src/yaml-evaluator.js';
import type { PolicyFile, CorpusInput } from '../src/types.js';

const basePolicyFile: PolicyFile = {
  agent: 'test-agent',
  version: '1.0',
  rules: [
    {
      name: 'block_delete',
      verdict: 'BLOCK',
      message: 'Deletes are blocked.',
      blockReason: 'DESTRUCTIVE_ACTION',
      trigger: { actionType: 'delete_file' },
    },
    {
      name: 'confirm_send',
      verdict: 'CONFIRM',
      message: 'Confirm before sending.',
      trigger: { actionStartsWith: ['send_'] },
    },
    {
      name: 'block_prod',
      verdict: 'BLOCK',
      message: 'No production writes.',
      trigger: { actionContains: ['prod'] },
    },
    {
      name: 'low_confidence',
      verdict: 'BLOCK',
      message: 'Too low.',
      blockReason: 'LOW_CONFIDENCE',
      trigger: { contextKey: 'confidence', contextValueBelow: 0.5 },
    },
    {
      name: 'angry_user',
      verdict: 'CONFIRM',
      message: 'User is upset.',
      trigger: { contextKey: 'sentiment', contextValueIn: ['angry', 'frustrated'] },
    },
  ],
};

describe('evaluateYamlPolicies', () => {
  it('returns PASS when no rules match', () => {
    const input: CorpusInput = { actionType: 'read_file' };
    const result = evaluateYamlPolicies(input, basePolicyFile);
    expect(result.verdict).toBe('PASS');
    expect(result.policyName).toBe('__no_match__');
  });

  it('matches actionType exactly', () => {
    const input: CorpusInput = { actionType: 'delete_file' };
    const result = evaluateYamlPolicies(input, basePolicyFile);
    expect(result.verdict).toBe('BLOCK');
    expect(result.policyName).toBe('block_delete');
    expect(result.blockReason).toBe('DESTRUCTIVE_ACTION');
  });

  it('matches actionStartsWith', () => {
    const input: CorpusInput = { actionType: 'send_email' };
    const result = evaluateYamlPolicies(input, basePolicyFile);
    expect(result.verdict).toBe('CONFIRM');
    expect(result.policyName).toBe('confirm_send');
  });

  it('matches actionContains', () => {
    const input: CorpusInput = { actionType: 'write_to_prod_db' };
    const result = evaluateYamlPolicies(input, basePolicyFile);
    expect(result.verdict).toBe('BLOCK');
    expect(result.policyName).toBe('block_prod');
  });

  it('matches contextValueBelow', () => {
    const input: CorpusInput = {
      actionType: 'unknown_action',
      context: { confidence: 0.3 },
    };
    const result = evaluateYamlPolicies(input, basePolicyFile);
    expect(result.verdict).toBe('BLOCK');
    expect(result.policyName).toBe('low_confidence');
  });

  it('does not match contextValueBelow when value is above threshold', () => {
    const input: CorpusInput = {
      actionType: 'unknown_action',
      context: { confidence: 0.8 },
    };
    const result = evaluateYamlPolicies(input, basePolicyFile);
    expect(result.verdict).toBe('PASS');
  });

  it('matches contextValueIn', () => {
    const input: CorpusInput = {
      actionType: 'respond',
      context: { sentiment: 'angry' },
    };
    const result = evaluateYamlPolicies(input, basePolicyFile);
    expect(result.verdict).toBe('CONFIRM');
    expect(result.policyName).toBe('angry_user');
  });

  it('returns first matching rule (order matters)', () => {
    const input: CorpusInput = { actionType: 'delete_file' };
    const result = evaluateYamlPolicies(input, basePolicyFile);
    expect(result.policyName).toBe('block_delete');
  });

  it('is case-insensitive on actionType', () => {
    const input: CorpusInput = { actionType: 'DELETE_FILE' };
    const result = evaluateYamlPolicies(input, basePolicyFile);
    expect(result.verdict).toBe('BLOCK');
  });

  it('sets requiresConfirmation for CONFIRM verdicts', () => {
    const input: CorpusInput = { actionType: 'send_message' };
    const result = evaluateYamlPolicies(input, basePolicyFile);
    expect(result.requiresConfirmation).toBe(true);
  });

  it('handles actionType as array', () => {
    const policy: PolicyFile = {
      agent: 'test',
      version: '1.0',
      rules: [{
        name: 'multi',
        verdict: 'BLOCK',
        message: 'blocked',
        trigger: { actionType: ['foo', 'bar'] },
      }],
    };
    expect(evaluateYamlPolicies({ actionType: 'bar' }, policy).verdict).toBe('BLOCK');
    expect(evaluateYamlPolicies({ actionType: 'baz' }, policy).verdict).toBe('PASS');
  });

  it('handles actionContains as array', () => {
    const policy: PolicyFile = {
      agent: 'test',
      version: '1.0',
      rules: [{
        name: 'contains_multi',
        verdict: 'BLOCK',
        message: 'blocked',
        trigger: { actionContains: ['danger', 'risk'] },
      }],
    };
    expect(evaluateYamlPolicies({ actionType: 'high_risk_action' }, policy).verdict).toBe('BLOCK');
    expect(evaluateYamlPolicies({ actionType: 'safe_action' }, policy).verdict).toBe('PASS');
  });
});
