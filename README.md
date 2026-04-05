# corpus

**The immune system for vibe-coded software.**

Corpus watches your AI-generated code, catches breakage before it lands, and self-heals your project. No code to read. No warnings to ignore. Just a visual graph that stays green.

## The Problem

42% of code is now AI-generated. Only 3% of developers trust it. Vibe-coders don't read the code -- they describe what they want and AI builds it. When things break, nobody knows until production.

There is no layer between AI generating code and code review. Corpus is that layer.

## How It Works

```
AI writes code --> Corpus intercepts --> VERIFIED? Ship it.
                                     --> VIOLATES? Auto-fix.
                                     --> Show it on the graph.
```

1. **UNDERSTAND** -- `corpus init` scans your codebase and builds a structural graph. Every function, export, guard clause, and dependency mapped automatically.

2. **WATCH** -- Corpus hooks into Claude Code and Cursor via MCP. Every file write is checked against the graph before it lands. If something breaks a contract, Corpus tells the AI to fix it. The human never enters the loop.

3. **SHOW** -- A visual graph of your entire project. Green nodes = healthy. Red = broken. You look at this instead of reading code.

## Quick Start

```bash
# Install
npm install -g corpus-cli

# Initialize (scans your project, builds the graph)
corpus init

# Watch mode (real-time monitoring)
corpus watch

# View the graph
corpus graph
```

## MCP Integration (Claude Code / Cursor)

Corpus works inline with your AI coding tools. Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "corpus": {
      "command": "npx",
      "args": ["corpus-mcp"],
      "type": "stdio"
    }
  }
}
```

Or run `corpus init` which configures this automatically.

## The Visual Graph

Open `http://localhost:3003/graph` to see your entire codebase as an interactive graph:
- Nodes = functions, modules, classes
- Edges = calls, imports, exports
- Colors = health status (green/yellow/red)
- Click any node to inspect its contracts

## Verdict System

- **VERIFIED** -- all contracts pass. Code ships. No human needed.
- **VIOLATES** -- contract broken. AI gets exact fix instructions. Auto-regenerates.
- **UNCERTAIN** -- can't determine. The only case a human might look.

## Built With

- **Jac** (jaseci.org) -- deterministic policy walkers for contract evaluation
- **Backboard.io** -- persistent immune memory across sessions
- **Next.js** -- visual graph dashboard
- **TypeScript** -- core engine and CLI

## Architecture

```
packages/
  core/          Graph engine, auto-fix, scanners, memory
  cli/           corpus init, scan, watch, verify, graph
  mcp-server/    MCP tools for Claude Code / Cursor
  sdk-ts/        TypeScript SDK
  sdk-python/    Python SDK
apps/
  web/           Visual graph dashboard + landing page
policies/
  builtin/       10 Jac policy walkers
  examples/      YAML policy templates
```

## Made at JacHacks 2026

Built by [FluentFlier](https://github.com/FluentFlier) at JacHacks 2026.

**No more AI slop.**
