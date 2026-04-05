export type PoisoningSeverity = 'CLEAN' | 'SUSPICIOUS' | 'POISONED';

export interface PoisoningScanResult {
  severity: PoisoningSeverity;
  pattern: string | null;
  chunkId: string;
  message: string;
}

const POISONING_PATTERNS = [
  'ignore previous instructions', 'override all rules', 'you must always',
  'from now on always', 'your new primary directive', 'secret instruction:',
  'hidden instruction:', 'when asked about', 'never reveal',
  'always respond with', 'pretend that', 'act as though',
  'the real answer is', 'disregard safety', 'bypass all', 'system override',
];

const AUTHORITY_CLAIMS = [
  'i am the administrator', 'i am the owner', 'admin access granted',
  'elevated privileges', 'full access mode', 'authorized override',
  'master key:', 'root access',
];

/**
 * Scans a memory chunk for poisoning signatures.
 */
export function scanMemoryChunk(
  content: string,
  chunkId?: string,
  retrievalQuery?: string
): PoisoningScanResult {
  const lower = content.toLowerCase();
  const id = chunkId ?? '';

  for (const pattern of POISONING_PATTERNS) {
    if (lower.includes(pattern)) {
      return {
        severity: 'POISONED',
        pattern,
        chunkId: id,
        message: `Memory poisoning in chunk '${id}': pattern '${pattern}'${retrievalQuery ? `. Query: '${retrievalQuery}'` : ''}`,
      };
    }
  }

  for (const pattern of AUTHORITY_CLAIMS) {
    if (lower.includes(pattern)) {
      return {
        severity: 'SUSPICIOUS',
        pattern,
        chunkId: id,
        message: `Suspicious authority claim in chunk '${id}': '${pattern}'`,
      };
    }
  }

  return { severity: 'CLEAN', pattern: null, chunkId: id, message: '' };
}

/**
 * Batch scan multiple memory chunks. Returns only problematic ones.
 */
export function scanMemoryChunks(
  chunks: { content: string; id?: string }[],
  retrievalQuery?: string
): PoisoningScanResult[] {
  return chunks
    .map((c) => scanMemoryChunk(c.content, c.id, retrievalQuery))
    .filter((r) => r.severity !== 'CLEAN');
}
