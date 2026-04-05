# corpus

**The immune system for vibe-coded software.**

> Self-healing code. Zero human intervention. AI writes code — Corpus intercepts, verifies, and heals.

Corpus watches your AI-generated code in real-time, catches CVE-linked vulnerabilities, hallucinated dependencies, and broken contracts — then auto-fixes them before they ship. No code to read. No warnings to ignore. The immune system learns from every repo it scans.

## The Problem

42% of code is now AI-generated. Only 3% of developers trust it. Vibe-coders don't read the code — they describe what they want and AI builds it. When things break, nobody knows until production.

There is no layer between AI generating code and code review. Corpus is that layer.

## How It Works

```
AI writes code --> Corpus intercepts --> VERIFIED? Ship it.
                                     --> VIOLATES? Auto-heal.
                                     --> CVE match? Block + fix.
                                     --> Hallucinated dep? Block.
```

### The Immune System

1. **INTERCEPT** — `corpus watch` monitors every file change in real-time. When Claude or Cursor writes a file, Corpus catches it instantly.

2. **ANALYZE** — Five layers of defense run in milliseconds:
   - **Graph Contracts** — Structural verification against the codebase graph. Removed functions, deleted guard clauses, changed signatures = BLOCK.
   - **CVE Pattern Detection** — 30 real-world vulnerability patterns (SQL injection, prototype pollution, SSRF, path traversal) mapped to actual CVE IDs.
   - **Hallucinated Dependency Detection** — Checks every import against npm. AI invents package names that don't exist or are typosquats of real packages. Corpus catches them.
   - **Security Scanners** — Secrets, PII, prompt injection, disabled SSL, wildcard CORS, eval(), and more.
   - **Pattern Intelligence** — Learned from 280+ open-source repos. Context-aware: eval() in a webpack config is fine, eval() in a route handler is not.

3. **HEAL** — Violations get auto-fixed. The AI receives structured fix instructions and regenerates. The human never enters the loop.

4. **SHOW** — Everything appears on the visual dashboard. Green nodes = healthy. Red = broken. CVE alerts. Dependency warnings. The immune system's nervous system.

## Quick Start

```bash
# Install
npm install -g corpus-cli

# Initialize (scans your project, builds the graph)
corpus init

# Watch mode (real-time interception)
corpus watch

# Full security scan
corpus scan

# Scan for specific threats
corpus scan --cve          # CVE-linked patterns only
corpus scan --deps         # Hallucinated dependency check
corpus scan --staged       # Pre-commit hook
corpus scan --fix          # Auto-fix what can be fixed
```

## MCP Integration (Claude Code / Cursor)

Corpus also works inline with AI coding tools via MCP. Add to `.mcp.json`:

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

MCP tools: `scan_content`, `check_dependencies`, `verify_file`, `corpus_check`, `corpus_health`

## What Makes This Different

| Feature | Semgrep | Snyk | CodeQL | **Corpus** |
|---------|---------|------|--------|------------|
| Static analysis | Yes | Yes | Yes | Yes |
| AI-specific patterns | No | No | No | **Yes** |
| Hallucinated dep detection | No | No | No | **Yes** |
| Real-time file interception | No | No | No | **Yes** |
| Auto-heal (AI fixes its own bugs) | No | No | No | **Yes** |
| Learns from OSS ecosystem | No | Partial | Yes | **Yes** |
| MCP integration | No | No | No | **Yes** |

## CVE Pattern Detection

Corpus ships with 30 real-world CVE patterns:

- **Prototype Pollution** — lodash merge/defaultsDeep, jQuery extend (CVE-2018-3721, CVE-2019-10744, CVE-2019-11358)
- **SQL Injection** — String concatenation in queries, Sequelize raw queries (CVE-2023-22578)
- **Remote Code Execution** — node-serialize unserialize, serialize-javascript eval (CVE-2017-5941, CVE-2020-7660)
- **SSRF** — User-controlled URLs in fetch/axios (CVE-2021-3749)
- **Path Traversal** — `../` in file operations (CVE-2021-32804)
- **Template Injection** — EJS/lodash template with user input (CVE-2022-29078, CVE-2021-23337)
- **ReDoS** — Catastrophic backtracking in regex (CVE-2022-25883)
- Plus 15+ generic patterns: open redirects, insecure cookies, timing attacks, mass assignment, hardcoded JWT secrets

## Hallucinated Dependency Detection

AI coding tools sometimes invent npm packages:
- `react-auth-secure` — doesn't exist
- `express-validator-plus` — typosquat of `express-validator`
- `lodahs` — typo of `lodash`

Corpus checks every import against the npm registry and a database of 12,000+ legitimate packages learned from scanning 280 real repos. If a package doesn't exist or is suspiciously close to a popular one — **BLOCK**.

## Pattern Intelligence

Not just rules — an evolving immune system:

- **Context-aware**: eval() in webpack config = suppress. eval() in route handler = critical.
- **Co-occurrence**: disabled_auth + debug_endpoint in same file = ELEVATED risk.
- **Prevalence**: Auth guard pattern appears in 73% of production repos — its removal is critical.
- **CVE-linked**: Patterns that match real CVEs are never suppressed, regardless of false positive rate.

Learned from 28,000+ findings across 280 repos. 45% noise reduction vs. static scanners.

## Verdict System

- **VERIFIED** — all contracts pass. Code ships. No human needed.
- **VIOLATES** — contract broken. AI gets exact fix instructions. Auto-heals.
- **UNCERTAIN** — can't determine. The only case a human might look.

## Architecture

```
packages/
  core/          Graph engine, auto-fix, scanners, CVE database, pattern learner
  cli/           corpus init, scan, watch, verify, graph
  mcp-server/    MCP tools for Claude Code / Cursor
  sdk-ts/        TypeScript SDK
  sdk-python/    Python SDK
apps/
  web/           Visual dashboard + landing page
policies/
  builtin/       10 Jac policy walkers
  examples/      YAML policy templates
```

## Built With

- **Jac** (jaseci.org) — deterministic policy walkers for contract evaluation
- **Backboard.io** — persistent immune memory across sessions
- **Next.js** — visual dashboard
- **TypeScript** — core engine and CLI

## Made at JacHacks 2026

Built by [FluentFlier](https://github.com/FluentFlier) at JacHacks 2026.

**Self-healing code. The immune system never sleeps.**
