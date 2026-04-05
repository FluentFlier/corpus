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
      system_prompt: 'You are the memory layer for Corpus, tracking codebase health patterns.',
    }
  );
  return created.assistant_id;
}

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

/**
 * POST /api/memory/sync
 *
 * Syncs local .corpus/memory.json entries to Backboard.io.
 * Body: { root?: string }
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

  const memoryPath = findMemoryFile(projectRoot);
  if (!memoryPath) {
    return NextResponse.json(
      { error: 'No .corpus/memory.json found', synced: 0, errors: 0 },
      { status: 404 }
    );
  }

  try {
    const raw: LocalMemory = JSON.parse(readFileSync(memoryPath, 'utf-8'));
    const entries: MemoryEntry[] = raw.entries || [];

    if (entries.length === 0) {
      return NextResponse.json({ synced: 0, errors: 0, message: 'No entries to sync' });
    }

    const assistantName = `corpus-${path.basename(path.resolve(projectRoot))}`;
    const assistantId = await ensureAssistant(apiKey, assistantName);

    let synced = 0;
    let errors = 0;

    for (const entry of entries) {
      try {
        await backboardRequest('POST', `/assistants/${assistantId}/memories`, apiKey, {
          content: entry.content,
          metadata: {
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

    return NextResponse.json({
      synced,
      errors,
      total: entries.length,
      assistantId,
      assistantName,
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

    return NextResponse.json({
      source: 'backboard',
      assistantId,
      assistantName,
      totalCount: result.total_count,
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
