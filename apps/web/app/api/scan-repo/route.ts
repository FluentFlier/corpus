import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const GITHUB_URL_RE = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?(?:\/.*)?$/;
const MAX_FILES = 500;
const CLONE_TIMEOUT_MS = 30_000;

/** Recursively collect files up to a limit. */
function collectFiles(dir: string, limit: number): string[] {
  const results: string[] = [];
  const stack = [dir];

  while (stack.length > 0 && results.length < limit) {
    const current = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (results.length >= limit) break;
      if (entry === '.git' || entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;

      const full = path.join(current, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        stack.push(full);
      } else if (stat.isFile()) {
        const ext = path.extname(full).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.json'].includes(ext)) {
          results.push(full);
        }
      }
    }
  }

  return results;
}

export async function POST(request: Request) {
  const start = Date.now();
  let tmpDir: string | null = null;

  try {
    const body = await request.json();
    const url = typeof body?.url === 'string' ? body.url.trim() : '';

    if (!url || !GITHUB_URL_RE.test(url)) {
      return NextResponse.json(
        { error: 'Invalid GitHub URL. Use the format: https://github.com/owner/repo' },
        { status: 400 }
      );
    }

    // Normalize URL: strip trailing slashes, tree/branch paths, and ensure .git suffix absent
    const cleanUrl = url.replace(/\/+$/, '').replace(/\/tree\/.*$/, '').replace(/\.git$/, '');
    const repoName = cleanUrl.split('/').pop() ?? 'repo';

    // 1. Clone into temp directory
    tmpDir = mkdtempSync(path.join(tmpdir(), 'corpus-scan-'));
    const cloneTarget = path.join(tmpDir, repoName);

    try {
      execSync(`git clone --depth 1 ${cleanUrl}.git ${cloneTarget}`, {
        timeout: CLONE_TIMEOUT_MS,
        stdio: 'pipe',
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (cloneErr: unknown) {
      const msg = cloneErr instanceof Error ? cloneErr.message : 'Unknown clone error';
      return NextResponse.json(
        { error: `Failed to clone repository: ${msg.includes('timeout') ? 'Clone timed out (30s limit)' : 'Repository not found or inaccessible'}` },
        { status: 422 }
      );
    }

    // 2. Run graph engine
    let graph;
    try {
      const graphEngine = require(path.resolve('/Users/anirudhmanjesh/hackathons/corpus/packages/core/dist/graph-engine.js'));
      const buildGraph = graphEngine.buildGraph || graphEngine.default?.buildGraph;
      graph = buildGraph(cloneTarget);
    } catch (graphErr: unknown) {
      const msg = graphErr instanceof Error ? graphErr.message : 'Unknown error';
      return NextResponse.json(
        { error: `Graph engine error: ${msg}` },
        { status: 500 }
      );
    }

    // 3. Run security scanners on collected files
    const files = collectFiles(cloneTarget, MAX_FILES);
    const allFindings: Array<{
      severity: string;
      type: string;
      rule?: string;
      file: string;
      line: number;
      message: string;
      suggestion?: string;
    }> = [];

    let secretDetect: ((content: string, filepath: string) => unknown[]) | null = null;
    let codeSafety: ((content: string, filepath: string) => unknown[]) | null = null;

    try {
      const secretMod = require(path.resolve('/Users/anirudhmanjesh/hackathons/corpus/packages/core/dist/scanners/secret-detector.js'));
      secretDetect = secretMod.detectSecrets || secretMod.default?.detectSecrets;
    } catch { /* scanner not available */ }

    try {
      const safetyMod = require(path.resolve('/Users/anirudhmanjesh/hackathons/corpus/packages/core/dist/scanners/code-safety.js'));
      codeSafety = safetyMod.checkCodeSafety || safetyMod.default?.checkCodeSafety;
    } catch { /* scanner not available */ }

    for (const filePath of files) {
      let content: string;
      try {
        content = readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      const relPath = path.relative(cloneTarget, filePath);

      if (secretDetect) {
        try {
          const secrets = secretDetect(content, relPath) as Array<{
            severity: string; type: string; line: number; message: string;
          }>;
          for (const s of secrets) {
            allFindings.push({
              severity: s.severity,
              type: s.type,
              file: relPath,
              line: s.line,
              message: s.message,
            });
          }
        } catch { /* skip file */ }
      }

      if (codeSafety) {
        try {
          const safety = codeSafety(content, relPath) as Array<{
            severity: string; rule: string; line: number; file: string; message: string; suggestion: string;
          }>;
          for (const f of safety) {
            allFindings.push({
              severity: f.severity,
              type: f.rule,
              rule: f.rule,
              file: relPath,
              line: f.line,
              message: f.message,
              suggestion: f.suggestion,
            });
          }
        } catch { /* skip file */ }
      }
    }

    // 4. Build cluster breakdown from file paths
    const clusterMap = new Map<string, number>();
    for (const filePath of files) {
      const rel = path.relative(cloneTarget, filePath);
      const parts = rel.split(path.sep);
      const cluster = parts.length > 1 ? parts[0]! : '(root)';
      clusterMap.set(cluster, (clusterMap.get(cluster) ?? 0) + 1);
    }

    const clusters = Array.from(clusterMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, fileCount: count }));

    // Sort findings by severity
    const severityOrder: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    allFindings.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

    const scanTimeMs = Date.now() - start;

    return NextResponse.json({
      repo: cleanUrl,
      stats: {
        files: graph?.stats?.totalFiles ?? files.length,
        functions: graph?.stats?.totalFunctions ?? 0,
        nodes: graph?.nodes?.length ?? 0,
        edges: graph?.edges?.length ?? 0,
        exports: graph?.stats?.totalExports ?? 0,
        healthScore: graph?.stats?.healthScore ?? 0,
      },
      clusters,
      findings: allFindings.slice(0, 100), // Cap at 100 findings
      findingsTotal: allFindings.length,
      scanTimeMs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    // Clean up temp directory
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch { /* best effort cleanup */ }
    }
  }
}
