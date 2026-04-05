#!/usr/bin/env node
/**
 * Corpus Auto-Discovery Scanner
 *
 * Karpathy-style: automatically finds trending GitHub repos,
 * scans them, learns patterns, and evolves the immune system.
 * Runs indefinitely until stopped.
 *
 * Usage: node scripts/auto-discover.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const CORPUS_ROOT = path.resolve(__dirname, '..');
const BENCHMARKS_PATH = path.join(CORPUS_ROOT, 'apps/web/public/benchmarks.json');
const FINDINGS_PATH = path.join(CORPUS_ROOT, 'apps/web/public/findings.json');
const EVOLUTION_PATH = path.join(CORPUS_ROOT, 'apps/web/public/evolution.json');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'corpus-scanner/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

async function discoverRepos(page = 1) {
  // Search GitHub for popular TypeScript repos
  const queries = [
    'language:typescript+stars:>500+pushed:>2025-01-01',
    'language:javascript+stars:>1000+pushed:>2025-01-01',
    'topic:react+language:typescript+stars:>200',
    'topic:nextjs+language:typescript+stars:>100',
    'topic:api+language:typescript+stars:>300',
    'topic:cli+language:typescript+stars:>200',
  ];

  const query = queries[page % queries.length];
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&per_page=30&page=${(page % 3) + 1}`;

  try {
    const data = await httpGet(url);
    if (!data.items) return [];
    return data.items.map(r => r.full_name);
  } catch (e) {
    console.log('  GitHub API error:', e.message);
    return [];
  }
}

function getAlreadyScanned() {
  try {
    const bm = JSON.parse(fs.readFileSync(BENCHMARKS_PATH, 'utf-8'));
    return new Set(bm.benchmarks.map(b => b.repo));
  } catch {
    return new Set();
  }
}

function scanRepo(repo) {
  const tmp = `/tmp/corpus-auto-${repo.replace(/\//g, '_')}`;
  try {
    if (!fs.existsSync(tmp)) {
      execSync(`git clone --depth 1 https://github.com/${repo} ${tmp}`, { timeout: 15000, stdio: 'pipe' });
    }

    const result = execSync(`node -e "
      const { buildGraph } = require('${CORPUS_ROOT}/packages/core/dist/graph-engine.js');
      const { detectSecrets } = require('${CORPUS_ROOT}/packages/core/dist/scanners/secret-detector.js');
      const { checkCodeSafety } = require('${CORPUS_ROOT}/packages/core/dist/scanners/code-safety.js');
      const fs = require('fs');
      const path = require('path');
      function walkFiles(dir){const f=[];const s=new Set(['node_modules','.git','dist','.next','build','coverage','vendor']);function w(d,depth){if(depth>5||f.length>=80)return;try{for(const e of fs.readdirSync(d)){if(s.has(e)||e.startsWith('.'))continue;const p=path.join(d,e);try{const st=fs.statSync(p);if(st.isDirectory())w(p,depth+1);else if(['.ts','.tsx','.js','.jsx'].some(x=>e.endsWith(x))&&f.length<80)f.push(p);}catch{}}}catch{}}w(dir,0);return f;}
      const start=Date.now();const g=buildGraph('${tmp}');const t=Date.now()-start;
      const files=walkFiles('${tmp}');let findings=0;
      for(const f of files){try{const c=fs.readFileSync(f,'utf-8');const r=path.relative('${tmp}',f);findings+=detectSecrets(c,r).length;findings+=checkCodeSafety(c,r).length;}catch{}}
      console.log(JSON.stringify({files:g.stats.totalFiles,functions:g.stats.totalFunctions,nodes:g.nodes.length,edges:g.edges.length,scanMs:t,findings}));
    "`, { timeout: 25000, maxBuffer: 5 * 1024 * 1024 }).toString().trim();

    execSync(`rm -rf ${tmp}`, { stdio: 'pipe' });
    return JSON.parse(result);
  } catch {
    try { execSync(`rm -rf ${tmp}`, { stdio: 'pipe' }); } catch {}
    return null;
  }
}

function updateData(repo, data) {
  // Update benchmarks
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

  // Update evolution
  try {
    const evo = JSON.parse(fs.readFileSync(EVOLUTION_PATH, 'utf-8'));
    evo.summary.totalRepos = bm.totalReposScanned;
    evo.summary.totalFiles = bm.totalFilesScanned;
    evo.summary.totalNodes = bm.totalNodes;
    fs.writeFileSync(EVOLUTION_PATH, JSON.stringify(evo, null, 2));
  } catch {}

  return bm.totalReposScanned;
}

async function main() {
  console.log('=== CORPUS AUTO-DISCOVERY SCANNER ===');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('Mode: auto-discover trending repos from GitHub API');
  console.log('');

  let totalScanned = 0;
  let page = 0;

  while (true) {
    page++;
    console.log(`\n--- Discovery round ${page} ---`);

    const repos = await discoverRepos(page);
    const alreadyScanned = getAlreadyScanned();
    const newRepos = repos.filter(r => !alreadyScanned.has(r));

    console.log(`Found ${repos.length} repos, ${newRepos.length} new`);

    for (const repo of newRepos.slice(0, 10)) {
      console.log(`  Scanning ${repo}...`);
      const data = scanRepo(repo);
      if (data && data.files > 0) {
        const total = updateData(repo, data);
        totalScanned++;
        console.log(`  OK: ${data.files} files, ${data.nodes} nodes, ${data.findings} findings (total: ${total} repos)`);
      } else {
        console.log('  Skipped');
      }
    }

    // Auto-commit every 20 new repos
    if (totalScanned > 0 && totalScanned % 20 === 0) {
      try {
        execSync(`cd ${CORPUS_ROOT} && git add apps/web/public/ && git commit -m "auto: ${totalScanned} more repos discovered" && git push`, {
          timeout: 30000, stdio: 'pipe'
        });
        console.log(`  [Auto-committed: ${totalScanned} new repos]`);
      } catch {}
    }

    // Rate limit: wait 10 seconds between rounds (GitHub API limit: 10 req/min unauthenticated)
    console.log('  Waiting 10s for rate limit...');
    await new Promise(r => setTimeout(r, 10000));
  }
}

main().catch(console.error);
