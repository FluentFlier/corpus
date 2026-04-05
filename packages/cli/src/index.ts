#!/usr/bin/env node

const command = process.argv[2];

async function main(): Promise<void> {
  switch (command) {
    case 'init': {
      const { runInit } = await import('./commands/init.js');
      await runInit();
      // After init completes, also build the codebase graph
      const { initGraph } = await import('./commands/init-graph.js');
      await initGraph(process.argv.slice(3));
      break;
    }
    case 'graph': {
      const { initGraph } = await import('./commands/init-graph.js');
      await initGraph(process.argv.slice(3));
      break;
    }
    case 'verify': {
      const { runVerify } = await import('./commands/verify.js');
      await runVerify();
      break;
    }
    case 'scan': {
      const { runScan } = await import('./commands/scan.js');
      await runScan();
      break;
    }
    case 'watch': {
      const { runWatch } = await import('./commands/watch.js');
      await runWatch();
      break;
    }
    case 'check': {
      const { runCheck } = await import('./commands/check.js');
      await runCheck();
      break;
    }
    case 'report': {
      const { runReport } = await import('./commands/report.js');
      await runReport();
      break;
    }
    default:
      process.stdout.write(`
  corpus - Runtime safety for AI agents and AI-generated code

  Trust Verification:
    verify    Compute trust score (0-100) per file with line-by-line findings

  Security Scanning:
    scan      Scan files for secrets, PII, injection patterns, unsafe code
    watch     Real-time file watcher with live security scanning

  Policy Management:
    init      Initialize Corpus in your project (+ pre-commit hooks + graph)
    check     Validate all policy files
    report    View your agent's behavioral report

  Graph & Analysis:
    graph     Build / rebuild the codebase graph

  Usage:
    corpus verify                Trust score for your codebase
    corpus verify --json         Machine-readable trust report
    corpus scan                  Scan current directory
    corpus scan --staged         Scan staged git changes (pre-commit)
    corpus scan --json           Machine-readable output for CI
    corpus watch                 Watch files and scan on every save
    corpus watch src/            Watch specific directory
    corpus init                  Set up Corpus in your project
    corpus graph                 Build the codebase graph
    corpus check                 Validate policy files

  MCP Server (for AI coding tools):
    npx corpus-mcp               Start the MCP server for Claude Code / Cursor

`);
      if (command && command !== '--help' && command !== '-h') {
        process.exit(1);
      }
  }
}

main().catch((e) => {
  process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
