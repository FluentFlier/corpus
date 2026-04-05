# Corpus — From Hackathon to Real Product

## The Vision

Every vibe coder installs Corpus the way every JS developer installs ESLint. It runs in the background, costs nothing in compute, and you forget it's there — until it saves you from shipping a secret, breaking an import, or deploying a hallucinated dependency. One install, zero config, always watching.

## What's Real Today

- CLI: `corpus init`, `corpus scan`, `corpus watch`, `corpus graph`, `corpus verify`
- 15 security scanners (7 code, 8 agent)
- Graph engine: regex-based, scans 7,500 files in 2 seconds
- Pattern intelligence learned from 280 repos (45% noise reduction)
- 30 CVE-linked patterns
- Hallucinated dependency detection against 12K known packages
- MCP server with `corpus_check`, `scan_content`, `check_dependencies`
- 10 Jac policy walkers (wired via subprocess, degrades safely)
- Web dashboard with force-graph explorer
- Backboard.io persistent memory (45 memories across 5 categories)

## What Needs to Be Real

### Phase 1: Actually Usable (2 weeks)

**1. Background daemon, not a terminal hog**
`corpus watch` takes over the terminal. Real product needs:
- `corpus start` — launches a background daemon (or launchd/systemd service)
- `corpus stop` / `corpus status`
- Daemon writes to `.corpus/events.json` and a log file
- Near-zero CPU when idle — uses `fs.watch` (already does), only scans on change
- Memory budget: <50MB resident

**2. VS Code extension (the real distribution channel)**
Nobody will run a CLI watcher manually. The extension:
- Shows inline diagnostics (red squiggles on CVE matches, warnings on removed guards)
- Status bar: "Corpus: 100/100" with click to see findings
- Runs the scanner on file save — no daemon needed, VS Code IS the host
- Panel view showing recent events, trust score, graph summary
- This is how Snyk got adoption. This is how ESLint got adoption. CLI is for CI, extension is for developers.

**3. `corpus graph --open`**
- Starts a local server on an ephemeral port
- Serves the force-graph UI pointing at the current project's `.corpus/graph.json`
- Opens the browser
- Shuts down when the browser tab closes

**4. Zero-config onboarding**
Current `corpus init` asks questions. Real product:
- `npm install -g corpus-cli && corpus init` — no questions, auto-detects everything
- Auto-creates `.corpus/`, builds graph, installs pre-commit hook, configures MCP
- Prints one-line summary: "Corpus protecting 161 files, 389 functions. Run `corpus watch` or install the VS Code extension."

**5. Fix the auto-heal loop for real**
Currently demo-only. Real implementation:
- MCP `corpus_check` tool returns structured JSON with violations and fix instructions
- Claude Code / Cursor reads the tool response and regenerates
- Corpus re-verifies the regenerated file
- Log the loop: violation → fix instruction → regenerated → verified
- This is the killer feature. No other tool does this.

### Phase 2: Must-Have (1-2 months)

**6. AST-based parsing (replace regex)**
Current regex parser misses destructured params, arrow function guards, TypeScript generics. Upgrade to:
- `ts-morph` for TypeScript/JavaScript (proper AST)
- `tree-sitter` for multi-language support (Python, Go, Rust)
- Keep regex as fast-path fallback for languages without AST support
- This fixes the biggest technical criticism

**7. Pre-commit hook that actually blocks**
`corpus scan --staged` exists but:
- It needs to return exit code 2 (block) for criticals, exit code 0 (pass) for clean
- The hook script is already written, just needs testing
- Integration with husky, lint-staged, lefthook
- This is the CI gate — "Corpus blocked this commit because it contains a hardcoded Stripe key"

**8. Learn from the user's own codebase, not just OSS**
Currently pattern intelligence only comes from 280 pre-scanned repos. Real learning:
- Track which findings the user dismisses → adjust FP rates for their project
- Track which functions get flagged repeatedly → mark as "hot spots"
- Build project-specific pattern profiles that get smarter over time
- Store in Backboard for cross-session persistence

**9. npm publish (for real)**
- Publish `@corpus/core` and `corpus-cli` to npm
- `npx corpus init` works from any project
- `npx corpus-mcp` works in MCP config
- Automated releases via GitHub Actions

**10. GitHub Action**
```yaml
- uses: fluentflier/corpus-action@v1
  with:
    scan: true
    fail-on: critical
```
Runs on every PR. Comments with findings. Blocks merge on criticals.

### Phase 3: Competitive Moat (3-6 months)

**11. Real CVE feed integration**
Currently 30 static patterns. Connect to:
- NVD (National Vulnerability Database) API for new CVEs
- GitHub Advisory Database
- npm audit advisories
- Auto-generate detection patterns from new CVEs
- "Corpus detected a pattern matching CVE-2026-XXXXX published 2 hours ago"

**12. Multi-language support**
- Python (high priority — vibe coding with Claude is huge in Python)
- Go, Rust, Java
- tree-sitter makes this feasible without per-language parsers

**13. Team features**
- Shared pattern intelligence across a team's repos
- Dashboard showing org-wide trust scores
- "Your team's AI-generated code has a 94% trust score this week"
- Centralized policy management (Jac walkers as org-wide configs)

**14. Jac runtime integration (for real)**
- Install Jac as a dependency, not a subprocess
- Run walkers in-process for <1ms evaluation
- Custom walker authoring: developers write `.jac` policy files
- "Write a Jac walker that blocks any file write to `/prod/` unless the user has confirmed"

## Distribution Strategy

**The ESLint playbook:**
1. CLI tool that works out of the box (done)
2. npm package with zero config (Phase 1)
3. VS Code extension with inline diagnostics (Phase 1 — this is the growth engine)
4. Pre-commit hook (Phase 2 — the stickiness mechanism)
5. GitHub Action (Phase 2 — the enterprise entry point)
6. Team/org features (Phase 3 — the monetization layer)

**The wedge:**
Don't compete with Semgrep/Snyk on static analysis. They're better at it and have 10 years of rules. Compete on:
1. **MCP interception** — nobody else does this
2. **Hallucinated dependency detection** — AI-specific, novel
3. **Auto-heal loop** — the AI fixes its own mistakes, verified
4. **Pattern intelligence** — learns what's noise for YOUR codebase

These four things are uniquely relevant to AI-generated code and impossible for existing tools to replicate without rebuilding from scratch.

## What Makes It a Must-Have

The bar is: "I can't vibe code without this."

That happens when:
- Corpus catches a real bug the developer would have shipped (the "holy shit" moment)
- It runs silently and only interrupts when something is actually wrong (trust)
- The auto-heal means the developer literally never sees the bug (magic)
- The trust score gives confidence: "my AI-generated code is 96/100, I can ship this"

The anti-pattern is: too many false positives, too much noise, requires config, slows down the workflow. Every decision should optimize for signal-to-noise ratio and zero-friction adoption.

## Immediate Next Steps (This Week)

1. Ship `corpus graph --open`
2. Rebuild `corpus watch` as a background daemon
3. Start the VS Code extension (even if it's just status bar + diagnostics)
4. Publish to npm
5. Write a real README with a 30-second getting started
6. Record a 2-minute demo video for the GitHub repo
