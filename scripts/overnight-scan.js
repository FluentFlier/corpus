#!/usr/bin/env node
/**
 * Corpus Overnight Scanner
 *
 * Scans GitHub repos one at a time, learns patterns, saves progress.
 * Run: node scripts/overnight-scan.js
 *
 * Designed to run for hours without OOM by:
 * - Processing one repo at a time
 * - Cleaning up after each scan
 * - Saving progress after every repo
 */

const { execSync, fork } = require('child_process');
const fs = require('fs');
const path = require('path');

const CORPUS_ROOT = path.resolve(__dirname, '..');
const BENCHMARKS_PATH = path.join(CORPUS_ROOT, 'apps/web/public/benchmarks.json');
const FINDINGS_PATH = path.join(CORPUS_ROOT, 'apps/web/public/findings.json');
const EVOLUTION_PATH = path.join(CORPUS_ROOT, 'apps/web/public/evolution.json');
const SCAN_LOG_PATH = path.join(CORPUS_ROOT, '.corpus/scan-log.json');

// Load repos from batch files + hardcoded list
const batchFile = path.join(__dirname, 'repos-batch2.txt');
const batchRepos = fs.existsSync(batchFile)
  ? fs.readFileSync(batchFile, 'utf-8').split('\n').filter(Boolean)
  : [];

// Popular TS/JS repos to scan (organized by category)
const REPOS = [
  ...batchRepos,
  // Already scanned (skip)
  // Web frameworks
  'koajs/koa', 'hapijs/hapi', 'total-js/framework', 'feathersjs/feathers',
  // React ecosystem
  'facebook/react', 'pmndrs/react-three-fiber', 'pmndrs/drei',
  'react-hook-form/react-hook-form', 'TanStack/router', 'TanStack/table',
  // Vue ecosystem
  'vuejs/pinia', 'vuejs/router', 'nuxt/nuxt',
  // Svelte
  'sveltejs/svelte',
  // Build tools
  'turbopack/turbopack', 'biomejs/biome', 'oxc-project/oxc',
  // Testing
  'cypress-io/cypress', 'testing-library/react-testing-library',
  // Auth
  'panva/jose', 'auth0/node-auth0',
  // Database
  'kysely-org/kysely', 'mikro-orm/mikro-orm',
  // API
  'honojs/node-server', 'elysiajs/elysia',
  // Monorepo tools
  'changesets/changesets', 'lerna/lerna',
  // AI/ML
  'vercel/ai', 'huggingface/transformers.js',
  // Validation
  'sinclairzx81/typebox', 'Effect-TS/effect',
  // CSS
  'tailwindlabs/tailwindcss', 'styled-components/styled-components',
  // Animation
  'framer/motion', 'greensock/GSAP',
  // i18n
  'i18next/i18next', 'formatjs/formatjs',
  // Misc popular
  'inversify/InversifyJS', 'immerjs/immer', 'colinhacks/zod',
  'davidkpiano/xstate', 'pmndrs/valtio', 'nanostores/nanostores',
  'ai/size-limit', 'sindresorhus/got', 'node-fetch/node-fetch',
  'cheeriojs/cheerio', 'puppeteer/puppeteer',
  'microsoft/TypeScript', 'denoland/deno_std',
  'oven-sh/bun', 'pnpm/pnpm',
];

function getAlreadyScanned() {
  try {
    const bm = JSON.parse(fs.readFileSync(BENCHMARKS_PATH, 'utf-8'));
    return new Set(bm.benchmarks.map(b => b.repo));
  } catch {
    return new Set();
  }
}

function scanRepo(repo) {
  const tmp = `/tmp/corpus-overnight-${repo.replace(/\//g, '_')}`;

  try {
    // Clone
    if (!fs.existsSync(tmp)) {
      console.log(`  Cloning ${repo}...`);
      execSync(`git clone --depth 1 https://github.com/${repo} ${tmp}`, {
        timeout: 20000, stdio: 'pipe'
      });
    }

    // Scan in a subprocess to isolate memory
    const result = execSync(`node -e "
      const { buildGraph } = require('${CORPUS_ROOT}/packages/core/dist/graph-engine.js');
      const { detectSecrets } = require('${CORPUS_ROOT}/packages/core/dist/scanners/secret-detector.js');
      const { checkCodeSafety } = require('${CORPUS_ROOT}/packages/core/dist/scanners/code-safety.js');
      const fs = require('fs');
      const path = require('path');

      function walkFiles(dir) {
        const files = [];
        const skip = new Set(['node_modules','.git','dist','.next','build','coverage','vendor','.turbo','out']);
        function walk(d, depth) {
          if (depth > 5 || files.length >= 100) return;
          try { for (const e of fs.readdirSync(d)) {
            if (skip.has(e)||e.startsWith('.')) continue;
            const f=path.join(d,e);
            try { const s=fs.statSync(f); if(s.isDirectory())walk(f,depth+1); else if(['.ts','.tsx','.js','.jsx'].some(x=>e.endsWith(x))&&files.length<100)files.push(f); }catch{}
          }}catch{}
        }
        walk(dir, 0);
        return files;
      }

      const start = Date.now();
      const graph = buildGraph('${tmp}');
      const elapsed = Date.now() - start;

      const files = walkFiles('${tmp}');
      const findings = [];
      for (const file of files) {
        try {
          const content = fs.readFileSync(file,'utf-8');
          const rel = path.relative('${tmp}',file);
          for (const s of detectSecrets(content,rel)) findings.push({type:s.type,severity:s.severity,file:rel,message:s.message.slice(0,100)});
          for (const s of checkCodeSafety(content,rel)) findings.push({type:s.rule,severity:s.severity,file:rel,message:s.message.slice(0,100)});
        } catch{}
      }

      console.log(JSON.stringify({
        files: graph.stats.totalFiles,
        functions: graph.stats.totalFunctions,
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        scanMs: elapsed,
        findings: findings.length,
        critical: findings.filter(f=>f.severity==='CRITICAL').length,
        details: findings.slice(0,10),
      }));
    "`, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }).toString().trim();

    // Clean up cloned repo to save disk
    execSync(`rm -rf ${tmp}`, { stdio: 'pipe' });

    return JSON.parse(result);
  } catch (e) {
    // Clean up on error too
    try { execSync(`rm -rf ${tmp}`, { stdio: 'pipe' }); } catch {}
    return null;
  }
}

function updateBenchmarks(repo, data) {
  const bm = JSON.parse(fs.readFileSync(BENCHMARKS_PATH, 'utf-8'));
  if (!bm.benchmarks.find(b => b.repo === repo)) {
    bm.benchmarks.push({
      repo, files: data.files, functions: data.functions, exports: 0, classes: 0,
      nodes: data.nodes, edges: data.edges, scanTimeMs: data.scanMs, healthScore: 100
    });
    bm.totalReposScanned = bm.benchmarks.length;
    bm.totalFilesScanned = bm.benchmarks.reduce((s, b) => s + b.files, 0);
    bm.totalNodes = bm.benchmarks.reduce((s, b) => s + b.nodes, 0);
    bm.totalEdges = bm.benchmarks.reduce((s, b) => s + b.edges, 0);
    bm.totalScanTimeMs = bm.benchmarks.reduce((s, b) => s + b.scanTimeMs, 0);
    fs.writeFileSync(BENCHMARKS_PATH, JSON.stringify(bm, null, 2));
  }
  return bm;
}

function updateFindings(repo, data) {
  const findings = JSON.parse(fs.readFileSync(FINDINGS_PATH, 'utf-8'));
  if (data.findings > 0 && !findings.find(f => f.repo === repo)) {
    findings.push({
      repo, url: `https://github.com/${repo}`, totalFindings: data.findings,
      critical: data.critical, warning: data.findings - data.critical,
      info: 0,
      findings: data.details.map(d => ({
        severity: d.severity, type: d.type, file: d.file, line: 0, message: d.message
      }))
    });
    fs.writeFileSync(FINDINGS_PATH, JSON.stringify(findings, null, 2));
  }
}

function updateEvolution(totalRepos, totalFindings) {
  const evo = JSON.parse(fs.readFileSync(EVOLUTION_PATH, 'utf-8'));

  // Learn patterns
  try {
    const { learnFromFindings } = require(path.join(CORPUS_ROOT, 'packages/core/dist/pattern-learner.js'));
    const findingsData = JSON.parse(fs.readFileSync(FINDINGS_PATH, 'utf-8'));
    const allFindings = [];
    for (const repo of findingsData) {
      for (const f of repo.findings) {
        allFindings.push({ repo: repo.repo, type: f.type || 'unknown', severity: f.severity, file: f.file, message: f.message || '' });
      }
    }
    const patterns = learnFromFindings(CORPUS_ROOT, allFindings);

    evo.timeline.push({
      reposScanned: totalRepos,
      totalFindings,
      patternsLearned: patterns.patterns.length,
      suppressed: patterns.patterns.filter(p => p.adjustedSeverity === 'SUPPRESSED').length,
      note: `Auto-scan batch at ${new Date().toLocaleTimeString()}`,
    });

    evo.summary.totalRepos = totalRepos;
    evo.summary.totalFindings = totalFindings;
    evo.summary.patternsLearned = patterns.patterns.length;
    evo.summary.patternsSuppressed = patterns.patterns.filter(p => p.adjustedSeverity === 'SUPPRESSED').length;
  } catch (e) {
    console.log('  Pattern learning error:', e.message);
  }

  fs.writeFileSync(EVOLUTION_PATH, JSON.stringify(evo, null, 2));
}

// ── Main ──

async function main() {
  console.log('=== CORPUS OVERNIGHT SCANNER ===');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Repos to scan: ${REPOS.length}`);
  console.log('');

  const alreadyScanned = getAlreadyScanned();
  const toScan = REPOS.filter(r => !alreadyScanned.has(r));
  console.log(`Already scanned: ${alreadyScanned.size}`);
  console.log(`Remaining: ${toScan.length}`);
  console.log('');

  let scanned = 0;
  let totalFindings = 0;

  for (const repo of toScan) {
    console.log(`[${scanned + 1}/${toScan.length}] ${repo}`);

    const data = scanRepo(repo);
    if (!data || data.files === 0) {
      console.log('  Skipped (no files or error)');
      continue;
    }

    console.log(`  ${data.files} files, ${data.nodes} nodes, ${data.findings} findings, ${data.scanMs}ms`);

    updateBenchmarks(repo, data);
    updateFindings(repo, data);
    totalFindings += data.findings;
    scanned++;

    // Update evolution every 5 repos
    if (scanned % 5 === 0) {
      const bm = JSON.parse(fs.readFileSync(BENCHMARKS_PATH, 'utf-8'));
      updateEvolution(bm.totalReposScanned, totalFindings);
      console.log(`  [Evolution updated: ${bm.totalReposScanned} repos]`);
    }

    // Git commit every 10 repos
    if (scanned % 10 === 0) {
      try {
        execSync(`cd ${CORPUS_ROOT} && git add apps/web/public/ .corpus/ && git commit -m "auto: scanned ${scanned} more repos" && git push`, {
          timeout: 30000, stdio: 'pipe'
        });
        console.log('  [Committed and pushed]');
      } catch {}
    }
  }

  // Final update
  const bm = JSON.parse(fs.readFileSync(BENCHMARKS_PATH, 'utf-8'));
  updateEvolution(bm.totalReposScanned, totalFindings);

  console.log('');
  console.log('=== COMPLETE ===');
  console.log(`Scanned: ${scanned} new repos`);
  console.log(`Total repos: ${bm.totalReposScanned}`);
  console.log(`Total files: ${bm.totalFilesScanned}`);
  console.log(`Total nodes: ${bm.totalNodes}`);
  console.log(`New findings: ${totalFindings}`);

  // Final commit
  try {
    execSync(`cd ${CORPUS_ROOT} && git add -A && git commit -m "auto: overnight scan complete - ${bm.totalReposScanned} repos" && git push`, {
      timeout: 30000, stdio: 'pipe'
    });
    console.log('Final commit pushed.');
  } catch {}
}

main().catch(console.error);
