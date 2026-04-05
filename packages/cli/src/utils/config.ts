import { readFileSync, writeFileSync, existsSync } from 'fs';

export function readPolicyFile(path: string = './corpus.policy.yaml'): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  // Simple YAML key extraction for CLI (no dependency).
  // NOTE: This parser only handles top-level scalar key:value pairs.
  // Nested objects, arrays, multi-line strings, and anchors are NOT supported.
  // This is sufficient for reading `agent` and `version` fields used by report.ts,
  // but should be replaced with a proper YAML parser if deeper parsing is needed.
  const lines = raw.split('\n');
  const result: Record<string, unknown> = {};
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)/);
    if (match) {
      result[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  return result;
}

export function readEnvFile(path: string = './.env.corpus'): Record<string, string> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf-8');
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)/);
    if (match) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

export function writeEnvFile(path: string, vars: Record<string, string>): void {
  const content = Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';
  writeFileSync(path, content);
}
