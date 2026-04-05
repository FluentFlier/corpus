import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const BACKBOARD_BASE_URL = 'https://app.backboard.io/api';

interface BackboardMemory {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

interface MemoryEntry {
  id: string;
  type: string;
  timestamp: string;
  file: string;
  functionName?: string;
  content: string;
  metadata: Record<string, unknown>;
  flagCount?: number;
}

interface LocalMemory {
  entries: MemoryEntry[];
  stats: Record<string, unknown>;
}

interface PatternSignature {
  type: string;
  totalOccurrences: number;
  inTestFiles: number;
  inProductionFiles: number;
  inBuildTools: number;
  falsePositiveRate: number;
  severity: string;
  adjustedSeverity: string;
  description: string;
  repoCount?: number;
  repoPrevalence?: number;
  linkedCVEs?: string[];
  coOccursWith?: Array<{ pattern: string; correlation: number; combinedRisk: string }>;
}

interface LearnedPatterns {
  version: number;
  learnedFrom: number;
  totalFindings: number;
  patterns: PatternSignature[];
  lastUpdated: string;
  knownPackages?: string[];
  repoCategories?: Record<string, string>;
}

interface EvolutionTimeline {
  reposScanned: number;
  totalFindings: number;
  patternsLearned: number;
  suppressed: number;
  note: string;
}

interface EvolutionData {
  timeline: EvolutionTimeline[];
  insights: Array<{ pattern: string; insight: string; repos: string }>;
  summary: {
    totalRepos: number;
    totalFiles: number;
    totalNodes: number;
    totalFindings: number;
    patternsLearned: number;
    patternsSuppressed: number;
    falsePositiveReduction: string;
    note: string;
  };
}

interface RepoFinding {
  repo: string;
  url?: string;
  totalFindings: number;
  critical: number;
  warning: number;
  info: number;
}

async function backboardRequest<T = unknown>(
  method: string,
  endpoint: string,
  apiKey: string,
  json?: Record<string, unknown>
): Promise<T> {
  const url = `${BACKBOARD_BASE_URL}/${endpoint.replace(/^\//, '')}`;
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'User-Agent': 'corpus/1.0',
  };

  let body: string | undefined;
  if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal });

    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new Error(`Backboard API ${res.status}: ${text}`);
    }

    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return undefined as T;
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureAssistant(apiKey: string, name: string): Promise<string> {
  const list = await backboardRequest<Array<{ assistant_id: string; name: string }>>(
    'GET', `/assistants?skip=0&limit=100`, apiKey
  );

  const existing = (Array.isArray(list) ? list : []).find(a => a.name === name);
  if (existing) return existing.assistant_id;

  const created = await backboardRequest<{ assistant_id: string }>(
    'POST', '/assistants', apiKey, {
      name,
      description: 'Corpus immune memory for codebase health tracking',
      system_prompt: 'You are the memory layer for Corpus, tracking codebase health patterns, learned security intelligence from open-source scanning, and evolution data across sessions.',
    }
  );
  return created.assistant_id;
}

function findCorpusDir(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, '.corpus');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findPublicDir(startDir: string): string | null {
  // Look for apps/web/public relative to project root
  const candidates = [
    path.join(startDir, 'apps', 'web', 'public'),
    path.join(startDir, 'public'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Walk up
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const c1 = path.join(dir, 'apps', 'web', 'public');
    if (existsSync(c1)) return c1;
    const c2 = path.join(dir, 'public');
    if (existsSync(c2)) return c2;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function safeReadJSON<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * POST /api/memory/sync
 *
 * Full sync: pushes ALL corpus learnings to Backboard.io:
 * 1. memory.json entries (violations, fixes, baselines)
 * 2. patterns.json (learned pattern intelligence from 280+ repos)
 * 3. evolution.json (timeline of how the immune system evolved)
 * 4. findings.json (per-repo scan summaries)
 * 5. benchmarks.json (performance benchmarks)
 */
export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'BACKBOARD_API_KEY not configured' },
      { status: 500 }
    );
  }

  let projectRoot: string;
  try {
    const body = await request.json().catch(() => ({}));
    projectRoot = (body as { root?: string }).root || process.cwd();
  } catch {
    projectRoot = process.cwd();
  }

  const corpusDir = findCorpusDir(projectRoot);
  const publicDir = findPublicDir(projectRoot);

  const assistantName = `corpus-${path.basename(path.resolve(projectRoot))}`;

  try {
    const assistantId = await ensureAssistant(apiKey, assistantName);

    let synced = 0;
    let errors = 0;

    // ── 1. Sync memory.json entries ──────────────────────────────────────
    if (corpusDir) {
      const memoryPath = path.join(corpusDir, 'memory.json');
      const raw = safeReadJSON<LocalMemory>(memoryPath);
      if (raw?.entries?.length) {
        for (const entry of raw.entries) {
          try {
            await backboardRequest('POST', `/assistants/${assistantId}/memories`, apiKey, {
              content: entry.content,
              metadata: {
                category: 'memory',
                type: entry.type,
                file: entry.file,
                functionName: entry.functionName,
                originalId: entry.id,
                originalTimestamp: entry.timestamp,
                ...entry.metadata,
              },
            });
            synced++;
          } catch {
            errors++;
          }
        }
      }
    }

    // ── 2. Sync learned patterns ─────────────────────────────────────────
    if (corpusDir) {
      const patternsPath = path.join(corpusDir, 'patterns.json');
      const patterns = safeReadJSON<LearnedPatterns>(patternsPath);
      if (patterns?.patterns?.length) {
        // Push a summary of the entire pattern intelligence
        try {
          const suppressedPatterns = patterns.patterns.filter(p => p.adjustedSeverity === 'SUPPRESSED');
          const criticalPatterns = patterns.patterns.filter(p => p.adjustedSeverity === 'CRITICAL');

          await backboardRequest('POST', `/assistants/${assistantId}/memories`, apiKey, {
            content: `Pattern Intelligence Summary: Learned from ${patterns.learnedFrom} repos with ${patterns.totalFindings} total findings. ${patterns.patterns.length} unique patterns identified. ${suppressedPatterns.length} patterns suppressed as false positives. ${criticalPatterns.length} patterns flagged as critical. Last updated: ${patterns.lastUpdated}`,
            metadata: {
              category: 'pattern-intelligence',
              type: 'summary',
              learnedFrom: patterns.learnedFrom,
              totalFindings: patterns.totalFindings,
              patternCount: patterns.patterns.length,
              suppressedCount: suppressedPatterns.length,
              criticalCount: criticalPatterns.length,
              timestamp: patterns.lastUpdated,
            },
          });
          synced++;
        } catch {
          errors++;
        }

        // Push each learned pattern individually for granular memory
        for (const pattern of patterns.patterns) {
          try {
            const testPct = pattern.totalOccurrences > 0
              ? Math.round((pattern.inTestFiles / pattern.totalOccurrences) * 100)
              : 0;
            const prodPct = pattern.totalOccurrences > 0
              ? Math.round((pattern.inProductionFiles / pattern.totalOccurrences) * 100)
              : 0;

            await backboardRequest('POST', `/assistants/${assistantId}/memories`, apiKey, {
              content: `Pattern: ${pattern.type} — ${pattern.description} Occurs ${pattern.totalOccurrences} times across repos. ${testPct}% in test files, ${prodPct}% in production. False positive rate: ${pattern.falsePositiveRate}%. Severity: ${pattern.severity} → Adjusted: ${pattern.adjustedSeverity}.${pattern.linkedCVEs?.length ? ` Linked to CVEs: ${pattern.linkedCVEs.join(', ')}.` : ''}${pattern.coOccursWith?.length ? ` Co-occurs with: ${pattern.coOccursWith.map(c => `${c.pattern} (${c.combinedRisk})`).join(', ')}.` : ''}`,
              metadata: {
                category: 'pattern-intelligence',
                type: 'learned-pattern',
                patternType: pattern.type,
                totalOccurrences: pattern.totalOccurrences,
                inTestFiles: pattern.inTestFiles,
                inProductionFiles: pattern.inProductionFiles,
                inBuildTools: pattern.inBuildTools,
                falsePositiveRate: pattern.falsePositiveRate,
                severity: pattern.severity,
                adjustedSeverity: pattern.adjustedSeverity,
                repoCount: pattern.repoCount,
                repoPrevalence: pattern.repoPrevalence,
                linkedCVEs: pattern.linkedCVEs,
                timestamp: patterns.lastUpdated,
              },
            });
            synced++;
          } catch {
            errors++;
          }
        }

        // Push known legitimate packages list
        if (patterns.knownPackages?.length) {
          try {
            await backboardRequest('POST', `/assistants/${assistantId}/memories`, apiKey, {
              content: `Known legitimate npm packages (${patterns.knownPackages.length} total): Used for hallucinated dependency detection. These packages were observed across ${patterns.learnedFrom} real open-source repos.`,
              metadata: {
                category: 'pattern-intelligence',
                type: 'known-packages',
                packageCount: patterns.knownPackages.length,
                // Send first 500 packages as sample
                samplePackages: patterns.knownPackages.slice(0, 500),
                timestamp: patterns.lastUpdated,
              },
            });
            synced++;
          } catch {
            errors++;
          }
        }
      }
    }

    // ── 3. Sync evolution timeline ───────────────────────────────────────
    if (publicDir) {
      const evolutionPath = path.join(publicDir, 'evolution.json');
      const evolution = safeReadJSON<EvolutionData>(evolutionPath);
      if (evolution) {
        // Push the summary
        try {
          await backboardRequest('POST', `/assistants/${assistantId}/memories`, apiKey, {
            content: `Evolution Summary: Scanned ${evolution.summary.totalRepos} repos, ${evolution.summary.totalFiles} files, ${evolution.summary.totalNodes} AST nodes. ${evolution.summary.patternsLearned} patterns learned, ${evolution.summary.patternsSuppressed} suppressed. ${evolution.summary.falsePositiveReduction} false positive reduction. ${evolution.summary.note}`,
            metadata: {
              category: 'evolution',
              type: 'summary',
              totalRepos: evolution.summary.totalRepos,
              totalFiles: evolution.summary.totalFiles,
              totalNodes: evolution.summary.totalNodes,
              patternsLearned: evolution.summary.patternsLearned,
              patternsSuppressed: evolution.summary.patternsSuppressed,
              falsePositiveReduction: evolution.summary.falsePositiveReduction,
              timestamp: new Date().toISOString(),
            },
          });
          synced++;
        } catch {
          errors++;
        }

        // Push each insight
        for (const insight of evolution.insights) {
          try {
            await backboardRequest('POST', `/assistants/${assistantId}/memories`, apiKey, {
              content: `Pattern Insight: ${insight.pattern} — ${insight.insight} Found in: ${insight.repos}`,
              metadata: {
                category: 'evolution',
                type: 'insight',
                pattern: insight.pattern,
                repos: insight.repos,
                timestamp: new Date().toISOString(),
              },
            });
            synced++;
          } catch {
            errors++;
          }
        }

        // Push key milestones from timeline (every 50 repos)
        const milestones = evolution.timeline.filter((_, i) =>
          i === 0 || i === evolution.timeline.length - 1 ||
          evolution.timeline[i]!.reposScanned % 50 < 5
        );
        for (const point of milestones) {
          try {
            await backboardRequest('POST', `/assistants/${assistantId}/memories`, apiKey, {
              content: `Evolution Milestone: At ${point.reposScanned} repos scanned — ${point.patternsLearned} patterns learned, ${point.suppressed} suppressed, ${point.totalFindings} findings in batch. ${point.note}`,
              metadata: {
                category: 'evolution',
                type: 'milestone',
                reposScanned: point.reposScanned,
                patternsLearned: point.patternsLearned,
                suppressed: point.suppressed,
                totalFindings: point.totalFindings,
                timestamp: new Date().toISOString(),
              },
            });
            synced++;
          } catch {
            errors++;
          }
        }
      }
    }

    // ── 4. Sync per-repo findings summaries ──────────────────────────────
    if (publicDir) {
      const findingsPath = path.join(publicDir, 'findings.json');
      try {
        if (existsSync(findingsPath)) {
          const findingsRaw = readFileSync(findingsPath, 'utf-8');
          if (findingsRaw.length > 2) {
            const findings: RepoFinding[] = JSON.parse(findingsRaw);
            // Push a summary of all repo findings
            const totalCritical = findings.reduce((s, f) => s + (f.critical || 0), 0);
            const totalWarning = findings.reduce((s, f) => s + (f.warning || 0), 0);
            const totalInfo = findings.reduce((s, f) => s + (f.info || 0), 0);
            const totalFound = findings.reduce((s, f) => s + (f.totalFindings || 0), 0);

            await backboardRequest('POST', `/assistants/${assistantId}/memories`, apiKey, {
              content: `Scan Results Summary: ${findings.length} repos scanned. ${totalFound} total findings — ${totalCritical} critical, ${totalWarning} warnings, ${totalInfo} info. Top repos by findings: ${findings.sort((a, b) => b.totalFindings - a.totalFindings).slice(0, 10).map(f => `${f.repo} (${f.totalFindings})`).join(', ')}.`,
              metadata: {
                category: 'scan-results',
                type: 'summary',
                repoCount: findings.length,
                totalFindings: totalFound,
                critical: totalCritical,
                warning: totalWarning,
                info: totalInfo,
                timestamp: new Date().toISOString(),
              },
            });
            synced++;

            // Push top 20 repos individually
            const topRepos = findings
              .sort((a, b) => b.totalFindings - a.totalFindings)
              .slice(0, 20);
            for (const repo of topRepos) {
              try {
                await backboardRequest('POST', `/assistants/${assistantId}/memories`, apiKey, {
                  content: `Repo Scan: ${repo.repo} — ${repo.totalFindings} findings (${repo.critical} critical, ${repo.warning} warnings, ${repo.info} info).`,
                  metadata: {
                    category: 'scan-results',
                    type: 'repo-scan',
                    repo: repo.repo,
                    totalFindings: repo.totalFindings,
                    critical: repo.critical,
                    warning: repo.warning,
                    info: repo.info,
                    timestamp: new Date().toISOString(),
                  },
                });
                synced++;
              } catch {
                errors++;
              }
            }
          }
        }
      } catch {
        errors++;
      }
    }

    // ── 5. Sync benchmark data ───────────────────────────────────────────
    if (publicDir) {
      const benchPath = path.join(publicDir, 'benchmarks.json');
      try {
        if (existsSync(benchPath)) {
          const benchRaw = readFileSync(benchPath, 'utf-8');
          if (benchRaw.length > 2) {
            const benchData = JSON.parse(benchRaw);
            const benchmarks = benchData.benchmarks || benchData;
            if (Array.isArray(benchmarks) && benchmarks.length > 0) {
              const totalFiles = benchmarks.reduce((s: number, b: { files?: number }) => s + (b.files || 0), 0);
              const totalNodes = benchmarks.reduce((s: number, b: { nodes?: number }) => s + (b.nodes || 0), 0);
              const avgTime = Math.round(benchmarks.reduce((s: number, b: { scanTimeMs?: number }) => s + (b.scanTimeMs || 0), 0) / benchmarks.length);

              await backboardRequest('POST', `/assistants/${assistantId}/memories`, apiKey, {
                content: `Performance Benchmarks: ${benchmarks.length} repos benchmarked. ${totalFiles} total files, ${totalNodes} AST nodes parsed. Average scan time: ${avgTime}ms. Fastest: ${Math.min(...benchmarks.map((b: { scanTimeMs?: number }) => b.scanTimeMs || 0))}ms. Slowest: ${Math.max(...benchmarks.map((b: { scanTimeMs?: number }) => b.scanTimeMs || 0))}ms.`,
                metadata: {
                  category: 'benchmarks',
                  type: 'summary',
                  repoCount: benchmarks.length,
                  totalFiles,
                  totalNodes,
                  avgScanTimeMs: avgTime,
                  timestamp: new Date().toISOString(),
                },
              });
              synced++;
            }
          }
        }
      } catch {
        errors++;
      }
    }

    return NextResponse.json({
      synced,
      errors,
      assistantId,
      assistantName,
      categories: {
        memory: corpusDir ? 'synced' : 'not found',
        patterns: corpusDir ? 'synced' : 'not found',
        evolution: publicDir ? 'synced' : 'not found',
        findings: publicDir ? 'synced' : 'not found',
        benchmarks: publicDir ? 'synced' : 'not found',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Sync failed: ${e instanceof Error ? e.message : String(e)}`, synced: 0, errors: 0 },
      { status: 500 }
    );
  }
}

/**
 * GET /api/memory/sync
 *
 * Pulls memories from Backboard.io and returns them.
 * Query: ?root=<projectRoot>
 */
export async function GET(request: Request): Promise<Response> {
  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'BACKBOARD_API_KEY not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const projectRoot = searchParams.get('root') || process.cwd();

  try {
    const assistantName = `corpus-${path.basename(path.resolve(projectRoot))}`;
    const assistantId = await ensureAssistant(apiKey, assistantName);

    const result = await backboardRequest<{ memories: BackboardMemory[]; total_count: number }>(
      'GET', `/assistants/${assistantId}/memories`, apiKey
    );

    const memories = result.memories || [];

    // Group memories by category
    const byCategory: Record<string, number> = {};
    for (const m of memories) {
      const cat = (m.metadata as Record<string, unknown>)?.category as string || 'uncategorized';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    return NextResponse.json({
      source: 'backboard',
      assistantId,
      assistantName,
      totalCount: result.total_count,
      byCategory,
      memories: memories.map(m => ({
        id: m.id,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to fetch from Backboard: ${e instanceof Error ? e.message : String(e)}`, memories: [] },
      { status: 500 }
    );
  }
}
