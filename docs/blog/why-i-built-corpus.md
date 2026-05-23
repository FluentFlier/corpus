# Corpus: An Immune System for Vibe-Coded Software

*Why I built a layer between the AI that writes your code and the moment it ships.*

---

## The moment that started it

A few months ago I watched a friend ship a feature he had never read.

He described what he wanted to an AI coding tool, accepted the diff, ran it once, and pushed. It worked. It also quietly imported a package that didn't exist on npm — the AI had invented a plausible-sounding name — and deleted a `if (!token) throw` guard at the top of an auth handler because it "simplified" the function. None of that showed up in the demo. It would have shown up in production.

This is not a story about a careless developer. It's a story about a new way of building software. We have a name for it now: **vibe coding.** You don't write the code line by line — you describe intent, the model generates, and you skim for vibes. It is genuinely faster. It is also a different risk profile than anything our tooling was built for.

Roughly 42% of new code is now AI-generated, and only about 3% of developers say they fully trust it. That gap — *we ship it but we don't trust it* — is the whole problem. The code review step that used to catch these mistakes assumes a human read the code first. In vibe coding, nobody did.

There is no layer between an AI generating code and that code reaching review. **Corpus is that layer.**

---

## What Corpus is

Corpus is an immune system for AI-generated code. It watches the files an AI writes, verifies them against the shape of your codebase and a catalog of known threats, and either lets them through or hands the AI exact instructions to fix what's wrong — before a human ever sees the diff.

The mental model is deliberately biological. A real immune system doesn't ask you to read every cell. It runs constantly, knows what "self" looks like, recognizes known pathogens on sight, and learns from every infection it survives. Corpus is built the same way:

- It **intercepts** every file change in real time.
- It **analyzes** that change across several independent layers of defense.
- It **heals** violations by sending the AI structured fix instructions.
- It **shows** the whole thing on a live dashboard — green for healthy, red for broken.

The promise is that you never have to read the code to know it's safe. The system reads it for you, every time, in milliseconds.

---

## Why existing tools weren't enough

My first instinct was the honest one: *surely this is solved.* Semgrep, Snyk, and CodeQL are excellent static analyzers with a decade of rules between them. So why build something new?

Because they were all designed for code a human wrote and a human will review. They answer "is this code insecure?" Corpus answers a different, AI-native set of questions:

1. **Did the AI hallucinate a dependency?** Models confidently import packages that don't exist, or that are one character away from a real one (`lodahs` for `lodash`). No traditional scanner checks imports against the live npm registry, because a human typing `import` rarely invents a package wholesale. An AI does it constantly.

2. **Did the AI quietly break a contract?** When you ask a model to "clean up" a function, it sometimes removes a guard clause, changes a parameter list, or drops an exported function other modules depend on. The code still parses. It still runs in the happy path. Static analysis sees nothing wrong — because nothing is *syntactically* wrong. What changed is the function's relationship to the rest of the codebase.

3. **Can the AI fix its own mistake without a human?** This is the one that matters most. Every existing tool produces a *report* for a human to read. But in vibe coding the human isn't reading. The fix has to go back to the AI, not to a person.

I didn't want to compete with Semgrep on the count of static rules — they'll win that for years. I wanted to own the four things that are uniquely about *AI-generated* code: interception, hallucinated-dependency detection, the self-healing loop, and learning what's actually noise for your codebase.

---

## How it works

When you run `corpus init`, the first thing it does is learn what your codebase looks like.

### 1. The graph — Corpus's memory of "self"

The graph engine walks every `.ts`, `.tsx`, `.js`, and `.jsx` file in your project and builds a structural map: **nodes** for functions, classes, and modules; **edges** for calls, imports, exports, and inheritance. For each function it records the signature, the parameters, the return type, whether it's exported, and — crucially — its **guard clauses** (`if (!token) throw`, `value ?? return`, and friends).

It does this with regex and structural analysis rather than a heavyweight AST library. That's a deliberate hackathon-era tradeoff: it has no dependencies, runs anywhere, and scans a typical project in under a second. (It's also the part I most want to upgrade to a real AST parser via `ts-morph` and `tree-sitter` — more on that below.) The result lands in `.corpus/graph.json`: a complete fingerprint of your codebase's structure.

This graph is the immune system's sense of *self*. Everything downstream is a comparison against it.

### 2. Interception and the verdict system

Once the graph exists, Corpus watches. In `corpus watch` it monitors the filesystem; through MCP it sits inline with Claude Code or Cursor and gets called the moment the AI proposes a file. Either way, every incoming change gets diffed against the graph and assigned one of three verdicts:

- **VERIFIED** — every contract holds. Ship it. No human needed.
- **VIOLATES** — a contract broke. The AI gets exact fix instructions and regenerates.
- **UNCERTAIN** — Corpus genuinely can't tell. This is the *only* case where a human should look.

That three-state design is intentional. A binary pass/fail forces every ambiguous case into a false alarm, and false alarms are how security tools train you to ignore them. By carving out UNCERTAIN, Corpus can be loud about the things it's sure about and humble about the things it isn't.

### 3. The analysis layers

A change runs through several independent layers, any of which can flag it:

- **Graph contracts.** Did a function get removed? Was an exported symbol deleted that other modules import? Did a guard clause vanish? Removing `if (!token) throw` from an auth function is flagged CRITICAL — it's a textbook way to introduce a vulnerability while "simplifying."

- **CVE pattern detection.** Corpus ships with 30 vulnerability patterns mapped to real CVE IDs — prototype pollution (`CVE-2019-10744`), `node-serialize` RCE (`CVE-2017-5941`), SSRF, path traversal, template injection, ReDoS, and more. When a match is found, the finding isn't a vague "eval detected" — it's "this matches CVE-2017-5941, here's the advisory, here's the fix."

- **Hallucinated dependency detection.** Every imported package is checked against the npm registry (with a 24-hour local cache) and against a list of the ecosystem's most-depended-on packages. Nonexistent packages are blocked as CRITICAL. Packages within a Levenshtein distance of 2 of a popular one get a typosquat warning. This is the layer that would have caught my friend's invented import.

- **Security scanners.** A dozen specialized scanners cover secrets (AWS, GitHub, OpenAI, Stripe, Slack keys, private keys, database URLs), unsafe code (`eval`, `innerHTML`, wildcard CORS, disabled SSL), prompt injection, data exfiltration, and a per-file trust score from 0 to 100.

- **Pattern intelligence.** The layer that makes the rest usable. More below.

### 4. The self-healing loop

This is the part I'm proudest of, and the reason "immune system" isn't just a metaphor.

When a change VIOLATES, Corpus doesn't write a report for a human. It generates structured, machine-readable fix instructions and sends them back to the AI:

```
CORPUS VIOLATION: 2 issues found in src/auth.ts

CRITICAL (must fix):
  - Guard clause REMOVED: if (!token) throw
    FIX: Restore the token validation guard in 'verifySession'

WARNING (should fix):
  - Parameters changed: [token: string] -> [token]
    FIX: Keep the original parameter signature
```

The AI reads that, regenerates the file, and Corpus re-verifies — looping until the verdict is VERIFIED. Through MCP, the `corpus_check` tool returns exactly this payload, so a coding agent can act on it without a human in the loop at all. Corpus even remembers across sessions: if the same function gets flagged repeatedly, the instruction notes *"this function has been flagged 3 times — this is a recurring issue."*

The human never sees the bug. That's the magic, and it's only possible because the consumer of the fix is a machine that can act on it instantly.

### 5. Pattern intelligence — learning what's noise

A scanner that cries wolf gets uninstalled. The hard problem isn't *finding* issues; it's not drowning the real ones in noise.

So Corpus learns. The pattern learner has analyzed tens of thousands of findings across **280 open-source repositories** (216,000+ files, 723,000+ graph nodes), and it does something static scanners can't: it figures out, statistically, which patterns are real and which are noise — and it's context-aware about it.

- **Context matters.** `eval()` in a webpack config is fine and gets suppressed. The same `eval()` in a route handler is critical. Corpus classifies the *kind* of file before it judges the pattern.
- **Co-occurrence raises risk.** A disabled-auth pattern alone might be a test fixture. Disabled auth *plus* a debug endpoint in the same file is ELEVATED risk.
- **Prevalence weights severity.** An auth-guard pattern that appears in 73% of production repos is clearly load-bearing, so its removal is treated as critical.
- **CVE-linked patterns are never suppressed,** regardless of how often they look like false positives. Known threats don't get the benefit of the doubt.

The net effect is roughly a **45% reduction in noise** versus a plain static scanner — which is the difference between a tool you trust and a tool you mute.

### Why Jac for the policies

The deterministic policy layer — ten walkers covering action safety, scope, rate limits, injection, exfiltration, session hijacking, and more — is written in [Jac](https://jaseci.org). I chose Jac specifically because the verdicts must be **deterministic**: graph traversal, not LLM opinion. Same input, same verdict, every single time. When you're the gate between generated code and production, "it depends on the model's mood today" is not an acceptable answer.

---

## What's real today, and what isn't

I'd rather be honest than impressive, so here's the line.

**Real today:** the CLI (`init`, `scan`, `watch`, `graph`, `verify`); the graph engine; the 30 CVE patterns; hallucinated-dependency detection against the live npm registry; the dozen scanners; the pattern intelligence trained on 280 repos; the MCP server with its inline tools; the ten Jac walkers; persistent memory via [Backboard.io](https://backboard.io); and a web dashboard with a force-graph explorer.

**Still becoming real:** the self-healing loop works end to end in the MCP integration, but I want it battle-tested across more agents and edge cases. The regex parser needs to graduate to a proper AST (`ts-morph` for TS/JS, `tree-sitter` for Python, Go, and Rust). And the real distribution channel — the thing that made ESLint and Snyk ubiquitous — is a VS Code extension with inline diagnostics, which is next on the roadmap.

The bar I'm building toward is simple and high: *"I can't vibe code without this."* You hit that bar the first time Corpus silently catches a bug you would have shipped — and you never even see it, because the AI already fixed it.

---

## Try it

```bash
npm install -g corpus-cli
corpus init      # scans your project, builds the graph
corpus watch     # real-time interception
corpus scan      # full security scan
```

Or wire it directly into Claude Code or Cursor via MCP:

```json
{
  "mcpServers": {
    "corpus": { "command": "npx", "args": ["corpus-mcp"], "type": "stdio" }
  }
}
```

Corpus was built at JacHacks 2026. The thesis is that the answer to AI writing more of our code isn't to write less of it — it's to build the immune system that lets us trust it. AI writes the code; Corpus makes sure it's safe to keep.

*The immune system never sleeps.*
