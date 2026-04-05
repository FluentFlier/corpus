import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the subprocess and yaml-evaluator modules
vi.mock('../src/subprocess.js', () => ({
  runJacWalker: vi.fn(),
}));

vi.mock('../src/yaml-evaluator.js', () => ({
  loadPolicyFile: vi.fn(),
  evaluateYamlPolicies: vi.fn(),
}));

import { evaluatePolicies } from '../src/engine.js';
import { runJacWalker } from '../src/subprocess.js';
import { loadPolicyFile, evaluateYamlPolicies } from '../src/yaml-evaluator.js';
import type { PolicyResult, CorpusConfig, PolicyFile } from '../src/types.js';

const mockConfig: CorpusConfig = {
  projectSlug: 'test',
  apiEndpoint: 'https://corpus.run',
  apiKey: 'corpus_test',
  mode: 'enforce',
  policyPath: './test.yaml',
};

const passResult: PolicyResult = {
  verdict: 'PASS',
  blockReason: null,
  message: '',
  policyName: '__pass__',
  requiresConfirmation: false,
};

const blockResult: PolicyResult = {
  verdict: 'BLOCK',
  blockReason: 'DESTRUCTIVE_ACTION',
  message: 'Blocked',
  policyName: 'test_policy',
  requiresConfirmation: false,
};

const confirmResult: PolicyResult = {
  verdict: 'CONFIRM',
  blockReason: null,
  message: 'Confirm this',
  policyName: 'action_safety',
  requiresConfirmation: true,
};

const basePolicyFile: PolicyFile = {
  agent: 'test',
  version: '1.0',
  rules: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  (loadPolicyFile as ReturnType<typeof vi.fn>).mockResolvedValue(basePolicyFile);
  (evaluateYamlPolicies as ReturnType<typeof vi.fn>).mockReturnValue(passResult);
  (runJacWalker as ReturnType<typeof vi.fn>).mockResolvedValue(passResult);
});

describe('evaluatePolicies', () => {
  it('returns PASS when all checks pass', async () => {
    const result = await evaluatePolicies({ actionType: 'read_file' }, mockConfig);
    expect(result.result.verdict).toBe('PASS');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('stops at YAML BLOCK without running Jac walkers', async () => {
    (evaluateYamlPolicies as ReturnType<typeof vi.fn>).mockReturnValue(blockResult);

    const result = await evaluatePolicies({ actionType: 'dangerous' }, mockConfig);
    expect(result.result.verdict).toBe('BLOCK');
    expect(result.result.policyName).toBe('test_policy');
    expect(runJacWalker).not.toHaveBeenCalled();
  });

  it('stops at YAML CONFIRM without running Jac walkers', async () => {
    (evaluateYamlPolicies as ReturnType<typeof vi.fn>).mockReturnValue(confirmResult);

    const result = await evaluatePolicies({ actionType: 'send_email' }, mockConfig);
    expect(result.result.verdict).toBe('CONFIRM');
    expect(runJacWalker).not.toHaveBeenCalled();
  });

  it('calls action_safety Jac walker after YAML PASS', async () => {
    await evaluatePolicies({ actionType: 'read_file' }, mockConfig);
    expect(runJacWalker).toHaveBeenCalledWith(
      expect.stringContaining('action_safety.jac'),
      'CheckActionSafety',
      expect.objectContaining({ action_type: 'read_file' }),
      expect.any(Number)
    );
  });

  it('stops when action_safety returns BLOCK', async () => {
    (runJacWalker as ReturnType<typeof vi.fn>).mockResolvedValueOnce(blockResult);

    const result = await evaluatePolicies({ actionType: 'delete_file' }, mockConfig);
    expect(result.result.verdict).toBe('BLOCK');
  });

  it('includes durationMs in result', async () => {
    const result = await evaluatePolicies({ actionType: 'read_file' }, mockConfig);
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
