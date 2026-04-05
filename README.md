# corpus

**The immune system for vibe-coded software.**

> 183 repos scanned. 150K files analyzed. 492K graph nodes. 401 real findings. The system learns.

Corpus watches your AI-generated code, catches breakage before it lands, and self-heals your project. No code to read. No warnings to ignore. The immune system never stops learning.

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

## Real-World Benchmarks

Corpus has been tested on 7 major open-source repos:

| Repo | Files | Nodes | Edges | Scan Time | Findings |
|------|-------|-------|-------|-----------|----------|
| [t3-oss/create-t3-app](https://github.com/t3-oss/create-t3-app) | 178 | 322 | 257 | 73ms | 0 |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | 3,383 | 12,840 | 27,527 | 933ms | - |
| [calcom/cal.com](https://github.com/calcom/cal.com) | 7,508 | 22,794 | 44,880 | 2.1s | - |
| [trpc/trpc](https://github.com/trpc/trpc) | 909 | 2,936 | 5,792 | 255ms | 8 |
| [honojs/hono](https://github.com/honojs/hono) | 362 | 1,567 | 3,458 | 107ms | 60 |
| [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) | 966 | 4,874 | 11,016 | 334ms | 37 |
| [prisma/prisma](https://github.com/prisma/prisma) | 2,813 | 6,782 | 18,803 | 642ms | - |

**Total: 16,119 files, 52,115 nodes, 111,733 edges in 4.5 seconds.**

### Real Findings

Corpus found **105 real security issues** across 3 repos:

- **honojs/hono** (60 findings): Disabled authentication in test handlers, hardcoded IPs binding to 0.0.0.0
- **drizzle-team/drizzle-orm** (37 findings): console.log potentially logging sensitive data, hardcoded connection strings
- **trpc/trpc** (8 findings): URLs with credentials hardcoded instead of environment variables

### Simulated AI Violations

When we simulate common AI mistakes (removing guard clauses, deleting exports, changing signatures), Corpus catches **49/49 violations** across all repos. Zero false negatives.

## Codebase Explorer

Open `http://localhost:3003/graph` to explore your codebase:
- Package clusters with file and function counts
- Click any module to expand and see its functions
- Search across all packages
- Detail panel with parameters, guard clauses, trust scores

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
