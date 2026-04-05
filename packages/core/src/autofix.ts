/**
 * Corpus Auto-Fix Engine
 *
 * When AI generates code that violates the graph contracts,
 * this module generates structured fix instructions that the AI
 * can understand and act on. The human never enters the loop.
 *
 * Flow: AI writes file -> Corpus diffs against graph -> VIOLATES ->
 *       Corpus returns fix instructions -> AI regenerates -> VERIFIED
 */

import { diffFile, loadGraph, type CodebaseGraph, type GraphDiff } from './graph-engine.js';
import path from 'path';

export interface FixInstruction {
  verdict: 'VERIFIED' | 'VIOLATES' | 'UNCERTAIN';
  file: string;
  violations: ViolationDetail[];
  instructions: string;
  autoFixable: boolean;
}

export interface ViolationDetail {
  type: 'guard_removed' | 'export_removed' | 'params_changed' | 'return_changed' | 'function_removed';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  functionName: string;
  message: string;
  fix: string;
}

/**
 * Check a file against the graph and return fix instructions if needed.
 * This is the core MCP integration point.
 */
export function checkFile(
  projectRoot: string,
  filePath: string,
  content: string
): FixInstruction {
  const graph = loadGraph(projectRoot);

  if (!graph) {
    return {
      verdict: 'UNCERTAIN',
      file: filePath,
      violations: [],
      instructions: 'No Corpus graph found. Run `corpus init` to build the immune system.',
      autoFixable: false,
    };
  }

  const diff = diffFile(graph, filePath, content);
  const relPath = path.relative(projectRoot, filePath);

  if (diff.verdict === 'VERIFIED') {
    return {
      verdict: 'VERIFIED',
      file: relPath,
      violations: [],
      instructions: 'All contracts satisfied. Code is safe to write.',
      autoFixable: false,
    };
  }

  // Build violation details
  const violations: ViolationDetail[] = [];

  for (const removed of diff.removed) {
    violations.push({
      type: 'function_removed',
      severity: removed.exported ? 'CRITICAL' : 'WARNING',
      functionName: removed.name,
      message: `Function '${removed.name}' was removed. ${removed.exported ? 'This is an exported function used by other modules.' : ''}`,
      fix: `Restore the function '${removed.name}' with its original signature: ${removed.name}(${removed.params.join(', ')})${removed.returnType ? ': ' + removed.returnType : ''}`,
    });
  }

  for (const mod of diff.modified) {
    for (const change of mod.changes) {
      if (change.includes('Guard clause REMOVED')) {
        violations.push({
          type: 'guard_removed',
          severity: 'CRITICAL',
          functionName: mod.before.name,
          message: change,
          fix: `Restore the guard clause in '${mod.before.name}'. The original guards were: ${mod.before.guards.join('; ')}`,
        });
      } else if (change.includes('Parameters changed')) {
        violations.push({
          type: 'params_changed',
          severity: 'WARNING',
          functionName: mod.before.name,
          message: change,
          fix: `Keep the original parameter signature for '${mod.before.name}': (${mod.before.params.join(', ')})`,
        });
      } else if (change.includes('Return type changed')) {
        violations.push({
          type: 'return_changed',
          severity: 'WARNING',
          functionName: mod.before.name,
          message: change,
          fix: `Maintain the return type of '${mod.before.name}' as ${mod.before.returnType || 'its original type'}`,
        });
      }
    }
  }

  // Build human-readable (and AI-readable) instructions
  const criticals = violations.filter(v => v.severity === 'CRITICAL');
  const warnings = violations.filter(v => v.severity === 'WARNING');

  let instructions = `CORPUS VIOLATION: ${violations.length} issue${violations.length !== 1 ? 's' : ''} found in ${relPath}.\n\n`;

  if (criticals.length > 0) {
    instructions += `CRITICAL (must fix):\n`;
    for (const v of criticals) {
      instructions += `  - ${v.message}\n    FIX: ${v.fix}\n`;
    }
    instructions += '\n';
  }

  if (warnings.length > 0) {
    instructions += `WARNING (should fix):\n`;
    for (const v of warnings) {
      instructions += `  - ${v.message}\n    FIX: ${v.fix}\n`;
    }
    instructions += '\n';
  }

  instructions += `Please regenerate this file with these fixes applied. The Corpus immune system will re-verify after your changes.`;

  return {
    verdict: diff.verdict,
    file: relPath,
    violations,
    instructions,
    autoFixable: criticals.length === 0,
  };
}

/**
 * Get a summary of the current graph health for the dashboard.
 */
export function getHealthSummary(projectRoot: string): {
  healthy: boolean;
  score: number;
  totalNodes: number;
  verified: number;
  violating: number;
  uncertain: number;
  recentChanges: string[];
} {
  const graph = loadGraph(projectRoot);

  if (!graph) {
    return {
      healthy: false,
      score: 0,
      totalNodes: 0,
      verified: 0,
      violating: 0,
      uncertain: 0,
      recentChanges: ['No graph found. Run corpus init.'],
    };
  }

  const verified = graph.nodes.filter(n => n.health === 'verified').length;
  const violating = graph.nodes.filter(n => n.health === 'violates').length;
  const uncertain = graph.nodes.filter(n => n.health === 'uncertain').length;

  return {
    healthy: violating === 0,
    score: graph.stats.healthScore,
    totalNodes: graph.nodes.length,
    verified,
    violating,
    uncertain,
    recentChanges: [],
  };
}
