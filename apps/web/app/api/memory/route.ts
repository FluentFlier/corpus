import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

/**
 * GET /api/memory
 *
 * Returns immune memory stats, recent violations, and flag counts.
 * Reads from .corpus/memory.json in the project root.
 */
function findMemoryFile(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, '.corpus', 'memory.json');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

interface Violation {
  file: string;
  rule: string;
  severity: string;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

interface MemoryData {
  stats?: Record<string, unknown>;
  violations?: Violation[];
  flagCounts?: Record<string, number>;
  [key: string]: unknown;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const projectRoot = searchParams.get('root') || process.cwd();

  const memoryPath = findMemoryFile(projectRoot);

  if (!memoryPath) {
    return NextResponse.json({
      stats: {
        totalViolations: 0,
        totalScans: 0,
        lastScan: null,
      },
      recentViolations: [],
      flagCounts: {},
    }, { status: 404 });
  }

  try {
    const raw: MemoryData = JSON.parse(readFileSync(memoryPath, 'utf-8'));

    const violations: Violation[] = Array.isArray(raw.violations) ? raw.violations : [];

    // Compute flag counts by severity
    const flagCounts: Record<string, number> = raw.flagCounts ?? {};
    if (Object.keys(flagCounts).length === 0) {
      for (const v of violations) {
        const key = v.severity || 'unknown';
        flagCounts[key] = (flagCounts[key] || 0) + 1;
      }
    }

    // Get the most recent violations (last 50)
    const recentViolations = violations.slice(-50).reverse();

    const stats = raw.stats ?? {
      totalViolations: violations.length,
      totalScans: raw.totalScans ?? 0,
      lastScan: raw.lastScan ?? null,
    };

    return NextResponse.json({
      stats,
      recentViolations,
      flagCounts,
    });
  } catch (e) {
    return NextResponse.json({
      error: 'Failed to parse memory file',
      stats: { totalViolations: 0, totalScans: 0, lastScan: null },
      recentViolations: [],
      flagCounts: {},
    }, { status: 500 });
  }
}
