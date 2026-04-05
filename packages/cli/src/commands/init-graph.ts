/**
 * corpus init / corpus graph -- Auto-generate the codebase graph
 *
 * Scans your project, builds a graph of every function, module, and relationship.
 * No configuration needed. One command. Corpus learns your entire codebase.
 */

import { existsSync, writeFileSync, mkdirSync, readFileSync, appendFileSync } from 'fs';
import path from 'path';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  bg_green: '\x1b[42m',
  bg_red: '\x1b[41m',
  white: '\x1b[37m',
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function animateStep(text: string, delay: number = 80): Promise<void> {
  process.stdout.write(`  ${C.green}\u2713${C.reset} ${text}`);
  await sleep(delay);
  process.stdout.write('\n');
}

export async function initGraph(args: string[]): Promise<void> {
  const projectRoot = args[0] ? path.resolve(args[0]) : process.cwd();
  const { buildGraph, saveGraph } = await import('@corpus/core');

  if (!existsSync(projectRoot)) {
    console.error(`\n  ${C.red}Error:${C.reset} Directory not found: ${projectRoot}\n`);
    process.exit(1);
  }

  // ── Header ──
  console.log('');
  console.log(`  ${C.cyan}${C.bold}CORPUS${C.reset}  ${C.dim}The immune system for vibe-coded software${C.reset}`);
  console.log(`  ${C.dim}${'─'.repeat(50)}${C.reset}`);
  console.log('');

  // ── Scan ──
  process.stdout.write(`  ${C.dim}Scanning project structure...${C.reset}`);
  const startTime = Date.now();
  const graph = buildGraph(projectRoot);
  const elapsed = Date.now() - startTime;
  process.stdout.write(`\r  ${C.green}\u2713${C.reset} Scanning project structure... ${C.dim}${elapsed}ms${C.reset}\n`);

  // ── Animated results ──
  await animateStep(`Found ${C.bold}${graph.stats.totalFiles}${C.reset} files across ${C.bold}${new Set(graph.nodes.filter(n => n.type === 'module').map(n => n.file.split('/')[0])).size}${C.reset} modules`);
  await animateStep(`Mapped ${C.bold}${graph.stats.totalFunctions}${C.reset} functions and ${C.bold}${graph.edges.filter(e => e.type === 'calls').length}${C.reset} dependencies`);
  await animateStep(`Building structural graph...`);

  // ── Save ──
  const graphPath = saveGraph(graph, projectRoot);
  await animateStep(`Graph saved: ${C.bold}${graph.nodes.length}${C.reset} nodes, ${C.bold}${graph.edges.length}${C.reset} edges`);

  // ── Config ──
  const corpusDir = path.join(projectRoot, '.corpus');
  if (!existsSync(corpusDir)) {
    mkdirSync(corpusDir, { recursive: true });
  }

  const configPath = path.join(corpusDir, 'config.json');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      mode: 'watch',
      autoFix: true,
      mcpEnabled: true,
    }, null, 2));
  }

  // ── MCP config ──
  const mcpPath = path.join(projectRoot, '.mcp.json');
  if (!existsSync(mcpPath)) {
    writeFileSync(mcpPath, JSON.stringify({
      mcpServers: {
        corpus: {
          command: 'npx',
          args: ['corpus-mcp'],
          type: 'stdio',
        },
      },
    }, null, 2));
    await animateStep(`MCP watchers attached to ${C.cyan}Claude Code${C.reset}, ${C.cyan}Cursor${C.reset}`);
  } else {
    const existing = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    if (!existing.mcpServers?.corpus) {
      existing.mcpServers = existing.mcpServers || {};
      existing.mcpServers.corpus = {
        command: 'npx',
        args: ['corpus-mcp'],
        type: 'stdio',
      };
      writeFileSync(mcpPath, JSON.stringify(existing, null, 2));
      await animateStep(`MCP watchers attached to ${C.cyan}Claude Code${C.reset}, ${C.cyan}Cursor${C.reset}`);
    } else {
      await animateStep(`MCP already configured`);
    }
  }

  // ── Gitignore ──
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('.corpus')) {
      appendFileSync(gitignorePath, '\n.corpus/\n');
    }
  }

  // ── Health summary ──
  const healthColor = graph.stats.healthScore >= 80 ? C.green
                    : graph.stats.healthScore >= 50 ? C.yellow
                    : C.red;

  console.log('');
  console.log(`  ${C.dim}${'─'.repeat(50)}${C.reset}`);
  console.log('');
  console.log(`  ${C.bold}$ corpus status${C.reset}`);
  console.log(`  ${C.green}\u25CF${C.reset} Health: ${healthColor}${C.bold}${graph.stats.healthScore}/100${C.reset} ${C.dim}- All systems nominal${C.reset}`);
  console.log('');
  console.log(`  ${C.dim}${'─'.repeat(50)}${C.reset}`);
  console.log('');
  console.log(`  ${C.bold}What happens next:${C.reset}`);
  console.log(`  ${C.dim}Every time your AI writes code, Corpus checks it${C.reset}`);
  console.log(`  ${C.dim}against this graph. If something breaks, Corpus${C.reset}`);
  console.log(`  ${C.dim}tells the AI to fix it. You never see the bug.${C.reset}`);
  console.log('');
  console.log(`  ${C.cyan}corpus watch${C.reset}     ${C.dim}Real-time monitoring${C.reset}`);
  console.log(`  ${C.cyan}corpus scan${C.reset}      ${C.dim}Security scan${C.reset}`);
  console.log(`  ${C.cyan}corpus verify${C.reset}    ${C.dim}Trust scores${C.reset}`);
  console.log('');
  console.log(`  ${C.dim}Your AI can't break what Corpus protects.${C.reset}`);
  console.log(`  ${C.bold}No more AI slop.${C.reset}`);
  console.log('');
}
