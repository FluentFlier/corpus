const enabled = process.env.CORPUS_DEBUG === 'true';

export function debug(message: string, data?: unknown): void {
  if (!enabled) return;
  const prefix = `[corpus ${new Date().toISOString()}]`;
  if (data !== undefined) {
    process.stderr.write(`${prefix} ${message} ${JSON.stringify(data)}\n`);
  } else {
    process.stderr.write(`${prefix} ${message}\n`);
  }
}
