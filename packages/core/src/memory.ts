/**
 * Corpus Immune Memory -- Backboard.io Integration
 *
 * Stores behavioral baselines and health snapshots persistently across sessions.
 * The longer you use Corpus, the smarter it gets. Memory powers:
 * - "This function was flagged 3 times before"
 * - Cross-session pattern recognition
 * - Behavioral drift detection over time
 *
 * Falls back to local .corpus/memory.json when Backboard is unavailable.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  type: 'baseline' | 'violation' | 'fix' | 'pattern';
  timestamp: string;
  file: string;
  functionName?: string;
  content: string;
  metadata: Record<string, unknown>;
  flagCount?: number;
}

export interface ImmuneMemory {
  entries: MemoryEntry[];
  stats: {
    totalEntries: number;
    totalViolations: number;
    totalFixes: number;
    sessionsTracked: number;
    lastUpdated: string;
  };
}

// ── Backboard.io Client ──────────────────────────────────────────────────────

const BACKBOARD_BASE_URL = 'https://app.backboard.io/api';

class BackboardClient {
  private apiKey: string;
  private assistantId: string | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T = any>(
    method: string,
    endpoint: string,
    options?: { json?: Record<string, unknown>; params?: Record<string, string | number> }
  ): Promise<T> {
    const url = new URL(`${BACKBOARD_BASE_URL}/${endpoint.replace(/^\//, '')}`);
    if (options?.params) {
      for (const [key, val] of Object.entries(options.params)) {
        url.searchParams.set(key, String(val));
      }
    }

    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'User-Agent': 'corpus/1.0',
    };

    let body: string | undefined;
    if (options?.json) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '<no body>');
        throw new Error(`Backboard API ${res.status}: ${text}`);
      }

      // DELETE responses may have no body
      if (res.status === 204 || res.headers.get('content-length') === '0') {
        return undefined as T;
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async ensureAssistant(name: string): Promise<string> {
    if (this.assistantId) return this.assistantId;

    try {
      // Try to find existing assistant
      const list = await this.request<Array<{ assistant_id: string; name: string }>>(
        'GET', '/assistants', { params: { skip: 0, limit: 100 } }
      );
      const existing = (Array.isArray(list) ? list : []).find((a) => a.name === name);
      if (existing) {
        this.assistantId = existing.assistant_id;
        return existing.assistant_id;
      }

      // Create new
      const created = await this.request<{ assistant_id: string }>(
        'POST', '/assistants', {
          json: {
            name,
            description: 'Corpus immune memory for codebase health tracking',
            system_prompt: 'You are the memory layer for Corpus, tracking codebase health patterns.',
          },
        }
      );
      this.assistantId = created.assistant_id;
      return created.assistant_id;
    } catch (e) {
      throw new Error(`Failed to initialize Backboard assistant: ${e}`);
    }
  }

  async addMemory(assistantId: string, content: string, metadata?: Record<string, unknown>): Promise<any> {
    return this.request('POST', `/assistants/${assistantId}/memories`, {
      json: { content, metadata },
    });
  }

  async getMemories(assistantId: string): Promise<{ memories: any[]; total_count: number }> {
    return this.request('GET', `/assistants/${assistantId}/memories`);
  }

  async deleteMemory(assistantId: string, memoryId: string): Promise<void> {
    await this.request('DELETE', `/assistants/${assistantId}/memories/${memoryId}`);
  }
}

// ── Local Memory Fallback ────────────────────────────────────────────────────

function getLocalMemoryPath(projectRoot: string): string {
  return path.join(projectRoot, '.corpus', 'memory.json');
}

function loadLocalMemory(projectRoot: string): ImmuneMemory {
  const memPath = getLocalMemoryPath(projectRoot);
  if (existsSync(memPath)) {
    try {
      return JSON.parse(readFileSync(memPath, 'utf-8'));
    } catch {
      // Corrupted, start fresh
    }
  }
  return {
    entries: [],
    stats: {
      totalEntries: 0,
      totalViolations: 0,
      totalFixes: 0,
      sessionsTracked: 0,
      lastUpdated: new Date().toISOString(),
    },
  };
}

function saveLocalMemory(projectRoot: string, memory: ImmuneMemory): void {
  const corpusDir = path.join(projectRoot, '.corpus');
  if (!existsSync(corpusDir)) mkdirSync(corpusDir, { recursive: true });
  writeFileSync(getLocalMemoryPath(projectRoot), JSON.stringify(memory, null, 2));
}

// ── Public API ───────────────────────────────────────────────────────────────

let backboardClient: BackboardClient | null = null;
let backboardAssistantId: string | null = null;

function getBackboardClient(): BackboardClient | null {
  if (backboardClient) return backboardClient;

  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) return null;

  backboardClient = new BackboardClient(apiKey);
  return backboardClient;
}

/**
 * Record a memory entry (violation, fix, baseline, pattern).
 * Stores in Backboard.io if available, always stores locally.
 */
export async function recordMemory(
  projectRoot: string,
  entry: Omit<MemoryEntry, 'id' | 'timestamp'>
): Promise<void> {
  const memory = loadLocalMemory(projectRoot);
  const fullEntry: MemoryEntry = {
    ...entry,
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };

  memory.entries.push(fullEntry);
  if (entry.type === 'violation') memory.stats.totalViolations++;
  if (entry.type === 'fix') memory.stats.totalFixes++;
  memory.stats.totalEntries++;
  memory.stats.lastUpdated = fullEntry.timestamp;

  saveLocalMemory(projectRoot, memory);

  // Also store in Backboard.io if available
  const client = getBackboardClient();
  if (client) {
    try {
      if (!backboardAssistantId) {
        const projectName = path.basename(projectRoot);
        backboardAssistantId = await client.ensureAssistant(`corpus-${projectName}`);
      }
      await client.addMemory(backboardAssistantId, fullEntry.content, {
        type: fullEntry.type,
        file: fullEntry.file,
        functionName: fullEntry.functionName,
        ...fullEntry.metadata,
      });
    } catch {
      // Backboard unavailable, local memory is the fallback
    }
  }
}

/**
 * Get the flag count for a specific function across all sessions.
 * "This function was flagged 3 times before."
 */
export function getFlagCount(projectRoot: string, file: string, functionName: string): number {
  const memory = loadLocalMemory(projectRoot);
  return memory.entries.filter(
    e => e.type === 'violation' && e.file === file && e.functionName === functionName
  ).length;
}

/**
 * Get recent violations for the dashboard.
 */
export function getRecentViolations(projectRoot: string, limit: number = 20): MemoryEntry[] {
  const memory = loadLocalMemory(projectRoot);
  return memory.entries
    .filter(e => e.type === 'violation')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

/**
 * Get immune memory stats for display.
 */
export function getMemoryStats(projectRoot: string): ImmuneMemory['stats'] {
  const memory = loadLocalMemory(projectRoot);
  return memory.stats;
}

/**
 * Get all memories (for syncing to Backboard.io or display).
 */
export function getAllMemories(projectRoot: string): ImmuneMemory {
  return loadLocalMemory(projectRoot);
}

/**
 * Get memories stored in Backboard.io for this project.
 */
export async function getBackboardMemories(projectRoot: string): Promise<{ memories: any[]; total_count: number } | null> {
  const client = getBackboardClient();
  if (!client) return null;

  const projectName = path.basename(projectRoot);
  try {
    const assistantId = await client.ensureAssistant(`corpus-${projectName}`);
    return await client.getMemories(assistantId);
  } catch {
    return null;
  }
}

/**
 * Sync local memory to Backboard.io (for initial setup or recovery).
 */
export async function syncToBackboard(projectRoot: string): Promise<{ synced: number; errors: number }> {
  const client = getBackboardClient();
  if (!client) return { synced: 0, errors: 0 };

  const memory = loadLocalMemory(projectRoot);
  const projectName = path.basename(projectRoot);

  try {
    const assistantId = await client.ensureAssistant(`corpus-${projectName}`);
    let synced = 0;
    let errors = 0;

    for (const entry of memory.entries) {
      try {
        await client.addMemory(assistantId, entry.content, {
          type: entry.type,
          file: entry.file,
          functionName: entry.functionName,
          originalTimestamp: entry.timestamp,
          ...entry.metadata,
        });
        synced++;
      } catch {
        errors++;
      }
    }

    return { synced, errors };
  } catch {
    return { synced: 0, errors: memory.entries.length };
  }
}
