export { evaluatePolicies } from './engine.js';
export type { EvalResult } from './engine.js';
export { evaluateYamlPolicies, loadPolicyFile } from './yaml-evaluator.js';
export { runJacWalker } from './subprocess.js';
export { buildLogEntry, sendLogEntry } from './log.js';
export * from './types.js';
export * from './constants.js';
export * from './scanners/index.js';

// Corpus Graph Engine (immune system)
export { buildGraph, diffFile, saveGraph, loadGraph } from './graph-engine.js';
export type { CodebaseGraph, GraphNode, GraphEdge, GraphDiff } from './graph-engine.js';

// Corpus Auto-Fix Engine
export { checkFile, getHealthSummary } from './autofix.js';
export type { FixInstruction, ViolationDetail } from './autofix.js';

// Corpus Immune Memory (Backboard.io + local fallback)
export { recordMemory, getFlagCount, getRecentViolations, getMemoryStats, getAllMemories, syncToBackboard, getBackboardMemories } from './memory.js';
export type { MemoryEntry, ImmuneMemory } from './memory.js';
