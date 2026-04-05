import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

/**
 * POST /api/auto-scan
 *
 * Automatically discovers and scans a random popular GitHub repo.
 * Called by InsForge cron job every hour.
 * Each call scans 1 repo to keep execution time under 30s.
 */

const POPULAR_REPOS = [
  'withastro/astro', 'clerk/javascript', 'upstash/redis',
  'stripe/stripe-node', 'resend/resend-node', 'triggerdotdev/trigger.dev',
  'inngest/inngest-js', 'refinedev/refine', 'medusajs/medusa',
  'keystonejs/keystone', 'directus/directus', 'payloadcms/payload',
  'tiptap/tiptap', 'yjs/yjs', 'mapbox/mapbox-gl-js',
  'chartjs/Chart.js', 'excalidraw/excalidraw', 'tldraw/tldraw',
  'posthog/posthog-js', 'umami-software/umami',
  'sentry-javascript/sentry-javascript', 'pinojs/pino',
  'winstonjs/winston', 'commander-js/commander', 'yargs/yargs',
  'sindresorhus/execa', 'nodejs/undici', 'prettier/prettier',
  'eslint/eslint', 'typicode/husky', 'semantic-release/semantic-release',
  'uuidjs/uuid', 'cheeriojs/cheerio', 'docusaurus/docusaurus',
];

function collectFiles(dir: string, limit: number): string[] {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage', 'vendor']);
  function walk(d: string, depth: number) {
    if (depth > 5 || results.length >= limit) return;
    try {
      for (const e of readdirSync(d)) {
        if (skip.has(e) || e.startsWith('.')) continue;
        const full = path.join(d, e);
        try {
          const s = statSync(full);
          if (s.isDirectory()) walk(full, depth + 1);
          else if (['.ts', '.tsx', '.js', '.jsx'].some(x => e.endsWith(x)) && results.length < limit) results.push(full);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
  walk(dir, 0);
  return results;
}

export async function POST(): Promise<Response> {
  try {
    // Pick a random repo not yet scanned
    const bmPath = path.resolve(process.cwd(), '../../apps/web/public/benchmarks.json');
    let alreadyScanned = new Set<string>();

    // Try to find benchmarks.json
    const possiblePaths = [
      path.resolve(process.cwd(), 'public/benchmarks.json'),
      path.resolve(process.cwd(), '../../apps/web/public/benchmarks.json'),
    ];

    let bmData: any = { benchmarks: [] };
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        bmData = JSON.parse(readFileSync(p, 'utf-8'));
        break;
      }
    }
    alreadyScanned = new Set(bmData.benchmarks.map((b: any) => b.repo));

    const candidates = POPULAR_REPOS.filter(r => !alreadyScanned.has(r));
    if (candidates.length === 0) {
      return NextResponse.json({ message: 'All repos already scanned', total: alreadyScanned.size });
    }

    const repo = candidates[Math.floor(Math.random() * candidates.length)];
    const tmp = mkdtempSync(path.join(tmpdir(), 'corpus-auto-'));

    try {
      // Clone
      execSync(`git clone --depth 1 https://github.com/${repo} ${tmp}`, { timeout: 15000, stdio: 'pipe' });

      // Scan
      const graphEngine = await import('/Users/anirudhmanjesh/hackathons/corpus/packages/core/dist/graph-engine.js');
      const start = Date.now();
      const graph = graphEngine.buildGraph(tmp);
      const scanMs = Date.now() - start;

      // Security scan
      let findings = 0;
      try {
        const secretMod = await import('/Users/anirudhmanjesh/hackathons/corpus/packages/core/dist/scanners/secret-detector.js');
        const safetyMod = await import('/Users/anirudhmanjesh/hackathons/corpus/packages/core/dist/scanners/code-safety.js');
        const files = collectFiles(tmp, 80);
        for (const file of files) {
          try {
            const content = readFileSync(file, 'utf-8');
            const rel = path.relative(tmp, file);
            findings += (secretMod.detectSecrets(content, rel) as any[]).length;
            findings += (safetyMod.checkCodeSafety(content, rel) as any[]).length;
          } catch { /* skip */ }
        }
      } catch { /* scanners not available */ }

      return NextResponse.json({
        repo,
        files: graph.stats.totalFiles,
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        findings,
        scanMs,
        totalRepos: alreadyScanned.size + 1,
        message: `Scanned ${repo}: ${graph.stats.totalFiles} files, ${graph.nodes.length} nodes, ${findings} findings`,
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
