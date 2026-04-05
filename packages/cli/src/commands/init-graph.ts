/**
 * corpus init -- Auto-generate the codebase graph
 *
 * Scans your project, builds a graph of every function, module, and relationship.
 * No configuration needed. One command. Corpus learns your entire codebase.
 *
 * Usage: corpus init [path]
 */

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

export async function initGraph(args: string[]): Promise<void> {
  const projectRoot = args[0] ? path.resolve(args[0]) : process.cwd();

  // Dynamic import to avoid circular deps at load time
  const { buildGraph, saveGraph } = await import('@corpus/core');

  console.log('');
  console.log('  \x1b[36m\x1b[1mCORPUS\x1b[0m  Initializing immune system...');
  console.log('');

  if (!existsSync(projectRoot)) {
    console.error(`  \x1b[31mError:\x1b[0m Directory not found: ${projectRoot}`);
    process.exit(1);
  }

  const startTime = Date.now();

  // Build the graph
  console.log(`  \x1b[2mScanning ${projectRoot}...\x1b[0m`);
  const graph = buildGraph(projectRoot);
  const elapsed = Date.now() - startTime;

  // Save it
  const graphPath = saveGraph(graph, projectRoot);

  // Create .corpus directory with config
  const corpusDir = path.join(projectRoot, '.corpus');
  if (!existsSync(corpusDir)) {
    mkdirSync(corpusDir, { recursive: true });
  }

  // Write config
  const configPath = path.join(corpusDir, 'config.json');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      mode: 'watch',
      autoFix: true,
      mcpEnabled: true,
    }, null, 2));
  }

  // Add .corpus to .gitignore if not already there
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (existsSync(gitignorePath)) {
    const gitignore = require('fs').readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.corpus')) {
      require('fs').appendFileSync(gitignorePath, '\n.corpus/\n');
    }
  }

  // Print results
  console.log('');
  console.log('  \x1b[32m\x1b[1m\u2713 Graph built\x1b[0m');
  console.log('');
  console.log(`    Files scanned:   \x1b[1m${graph.stats.totalFiles}\x1b[0m`);
  console.log(`    Functions found:  \x1b[1m${graph.stats.totalFunctions}\x1b[0m`);
  console.log(`    Exports mapped:  \x1b[1m${graph.stats.totalExports}\x1b[0m`);
  console.log(`    Graph nodes:     \x1b[1m${graph.nodes.length}\x1b[0m`);
  console.log(`    Graph edges:     \x1b[1m${graph.edges.length}\x1b[0m`);
  console.log(`    Health score:    \x1b[1m${graph.stats.healthScore}/100\x1b[0m`);
  console.log(`    Time:            \x1b[2m${elapsed}ms\x1b[0m`);
  console.log('');
  console.log(`  Saved to: \x1b[2m${graphPath}\x1b[0m`);
  console.log('');
  console.log('  \x1b[36mNext steps:\x1b[0m');
  console.log('    corpus watch      Start the immune system');
  console.log('    corpus dashboard   Open the visual graph');
  console.log('');
  console.log('  \x1b[2mCorpus is now watching your codebase.\x1b[0m');
  console.log('  \x1b[2mYour AI can\'t break what Corpus protects.\x1b[0m');
  console.log('');
}
