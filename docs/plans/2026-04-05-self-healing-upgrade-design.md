# Self-Healing Code Upgrade Design

**Date:** 2026-04-05
**Status:** Approved

## Summary

Upgrade Corpus from noise-reduction to true self-healing intelligence:

1. **Hallucinated Dependency Detection** — check imports against npm registry, catch AI-invented packages
2. **CVE-Linked Pattern Database** — map code patterns to real CVEs with severity and fix guidance
3. **Corpus Intelligence Score** — prevalence, context-aware suppression, co-occurrence, repo-category weighting
4. **Overnight Scanner Upgrades** — extract package manifests, CVE cross-referencing, richer pattern analysis

## Key Files

- `packages/core/src/scanners/dependency-checker.ts` — NEW
- `packages/core/src/cve-patterns.ts` — NEW
- `packages/core/src/cve-database.json` — NEW
- `packages/core/src/pattern-learner.ts` — UPGRADED
- `scripts/overnight-scan.js` — UPGRADED
- `apps/web/app/page.tsx` — hero stats redesign
- `README.md` — updated claims to match implementation
