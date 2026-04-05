# How Corpus Works

## Overview

Corpus is the immune system for vibe-coded software. It scans codebases, builds structural graphs, catches security issues, learns patterns from the open-source ecosystem, and auto-fixes AI-generated code mistakes before they ship.

## New: Three Intelligence Layers

### CVE-Linked Pattern Detection
Corpus ships with 30 real-world CVE patterns. When a scan finds matching code, the finding includes the CVE ID, severity from the actual advisory, and a fix example. This transforms "eval() detected" into "This pattern matches CVE-2017-5941 (node-serialize RCE). Found in 12 scanned repos."

### Hallucinated Dependency Detection
AI coding tools sometimes invent npm packages that don't exist or are typosquats of real packages. Corpus checks every import against the npm registry and a database of 12,000+ legitimate packages. If a package doesn't exist — BLOCK before the file ships.

### Corpus Pattern Intelligence
The pattern learner evolved from simple FP-rate tracking to a full intelligence engine:
- **Context-aware**: Same pattern in different contexts gets different verdicts
- **Co-occurrence**: Patterns that appear together are flagged with elevated risk
- **Prevalence scoring**: Common production patterns are weighted higher when removed
- **CVE linkage**: Patterns matching CVEs are never suppressed

## Architecture

```
                    ┌─────────────┐
                    │  Developer  │
                    │ (vibe-codes)│
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  AI Tool    │
                    │ Claude/Cursor│
                    └──────┬──────┘
                           │ writes file
                    ┌──────▼──────┐
                    │  MCP Server │◄── corpus_check tool
                    │ (intercept) │    corpus_health tool
                    └──────┬──────┘
                           │ diffs against
                    ┌──────▼──────┐
                    │ Graph Engine│
                    │ (AST parse) │
                    └──────┬──────┘
                           │ evaluates with
              ┌────────────▼────────────┐
              │     10 Jac Walkers      │
              │ (deterministic policy)  │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │    VERIFIED / VIOLATES  │
              │    / UNCERTAIN          │
              └────────────┬────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐   ┌──────────────┐  ┌──────────┐
    │  Ship it │   │ Tell AI to   │  │  Human   │
    │ (PASS)   │   │ fix it       │  │  reviews │
    └──────────┘   │ (auto-fix)   │  │(UNCERTAIN)│
                   └──────────────┘  └──────────┘
```

## Core Components

### 1. Graph Engine (`packages/core/src/graph-engine.ts`)

Scans any TypeScript/JavaScript project and builds a structural graph:
- **Nodes**: functions, modules, classes
- **Edges**: calls, imports, exports, extends
- Uses AST-free regex parsing (no ts-morph dependency, works everywhere)
- Extracts: function signatures, parameters, return types, guard clauses, exports

Output: `.corpus/graph.json` with full structural map.

**Performance**: Scans 280 repos (216K files) to build 723K nodes. Typical project: <1 second.

### 2. Auto-Fix Engine (`packages/core/src/autofix.ts`)

Diffs incoming file changes against the saved graph:
- Detects removed functions (CRITICAL if exported)
- Detects removed guard clauses (CRITICAL -- security vulnerability)
- Detects changed parameters (WARNING -- may break callers)
- Detects changed return types (WARNING)

Returns structured fix instructions the AI can understand:
```
CORPUS VIOLATION: 3 issues found in src/auth.ts

CRITICAL (must fix):
  - Guard clause REMOVED: if (!token) throw
    FIX: Restore the token validation guard

WARNING (should fix):
  - Parameters changed: [token: string] -> [token]
    FIX: Keep the original parameter signature
```

### 3. Security Scanners (`packages/core/src/scanners/`)

12 specialized scanners:
- **secret-detector.ts**: API keys, tokens, passwords, database URLs
- **code-safety.ts**: eval(), innerHTML, wildcard CORS, disabled SSL, SQL injection
- **injection-firewall.ts**: prompt injection patterns
- **exfiltration-guard.ts**: data exfiltration patterns
- **trust-score.ts**: composite 0-100 score per file
- And 7 more (context poisoning, session hijack, cross-user firewall, etc.)

### 4. Pattern Learner (`packages/core/src/pattern-learner.ts`)

The "learning" part of the immune system:
- Analyzes findings across ALL scanned repos
- Classifies each finding: production code, test file, or build tool
- Calculates false positive rate per pattern
- Auto-suppresses high-FP patterns (eval: 89% in tests = SUPPRESSED)
- Keeps real issues (console.log sensitive data: 59% in production = WARNING)

**Result**: 45% noise reduction compared to a static scanner.

### 5. Immune Memory (`packages/core/src/memory.ts`)

Persistent memory across sessions:
- **Local**: `.corpus/memory.json` for per-project memory
- **Cloud**: Backboard.io API for cross-session, cross-machine memory
- Records: violations, fixes, baselines, patterns
- Tracks flag counts: "This function has been flagged 3 times"
- Falls back gracefully if Backboard is unavailable

### 6. MCP Server (`packages/mcp-server/`)

7 tools for Claude Code / Cursor integration:
- `corpus_check`: Check file against graph before writing (VERIFIED/VIOLATES/UNCERTAIN)
- `corpus_health`: Get immune system status
- `scan_content`: Scan for secrets, PII, injection patterns
- `verify_file`: Compute trust score (0-100) with line-by-line findings
- `check_secret`: Check if a string looks like a credential
- `check_safety`: Check for unsafe patterns
- `check_injection`: Scan for prompt injection

### 7. CLI (`packages/cli/`)

Commands:
- `corpus init`: Initialize project + build graph + configure MCP
- `corpus graph`: Rebuild the structural graph
- `corpus scan`: Security scan with findings
- `corpus watch`: Real-time file watcher
- `corpus verify`: Trust scores per file
- `corpus check`: Validate policy files
- `corpus report`: View behavioral report

### 8. Jac Policy Walkers (`policies/builtin/`)

10 deterministic walkers written in Jac (jaseci.org):
1. action_safety -- blocks dangerous actions
2. scope_guard -- enforces action boundaries
3. rate_guard -- rate limiting
4. confidence_calibrator -- checks AI confidence
5. injection_firewall -- blocks prompt injection
6. exfiltration_guard -- prevents data exfiltration
7. session_hijack -- detects session hijack
8. cross_user_firewall -- prevents cross-user access
9. context_poisoning -- detects poisoned context
10. undo_integrity -- validates undo operations

**Why Jac?** Deterministic graph traversal. No LLM opinions. Same input = same verdict, every time.

### 9. Web Dashboard (`apps/web/`)

Pages:
- `/` -- Landing page with stats, scan CTA, Jac section
- `/scan` -- Paste any GitHub URL, scan instantly
- `/graph` -- Codebase explorer with cluster grid
- `/evolution` -- Pattern learning visualization
- `/demo` -- Auto-fix simulation (3 scenarios)
- `/policies` -- Jac walkers showcase
- `/live` -- Real-time monitoring dashboard

## Data Flow

### When you run `corpus init`:
1. Graph engine scans all .ts/.tsx/.js/.jsx files
2. Extracts function signatures, exports, guard clauses
3. Builds node/edge graph
4. Saves to `.corpus/graph.json`
5. Writes MCP config to `.mcp.json`
6. Claude Code auto-connects

### When AI writes a file (via MCP):
1. Claude Code calls `corpus_check` with the new file content
2. Auto-fix engine loads the saved graph
3. Diffs the new file against the graph
4. If functions removed, guards deleted, or signatures changed: VIOLATES
5. Returns fix instructions to Claude
6. Claude regenerates the file
7. Corpus re-checks until VERIFIED

### When the scanner runs overnight:
1. Clones repos one at a time (subprocess isolation, no OOM)
2. Builds graph + runs security scanners
3. Saves findings to benchmarks.json and findings.json
4. Pattern learner updates false positive rates
5. Auto-commits every 10 repos
6. Stats update on the landing page automatically

## Integrations

- **Jac** (jaseci.org): 10 policy walkers for deterministic evaluation
- **Backboard.io**: Persistent immune memory across sessions
- **InsForge**: Database tables (corpus_scans, corpus_violations, corpus_memory), edge function, cron job
- **Claude Code**: MCP server with 7 inline tools

## Stats (as of latest scan)

- 280 repos scanned autonomously
- 216,284 files analyzed
- 723,304 graph nodes built
- 711+ security findings
- 11 patterns learned
- 5 patterns auto-suppressed (45% noise reduction)
- <1 second scan time for typical projects

## Made at JacHacks 2026
