import { spawn } from 'child_process';
import path from 'path';
import { debug } from './logger.js';
import type { PolicyResult } from './types.js';

const MAX_OUTPUT_BYTES = 1024 * 1024; // 1MB max stdout/stderr

/**
 * Runs a Jac walker as a subprocess and returns its PolicyResult.
 *
 * If the subprocess times out, errors, or returns invalid JSON:
 *   Returns CONFIRM verdict (safe default -- never silently execute).
 *
 * This function NEVER throws. All errors become CONFIRM verdicts.
 */
export async function runJacWalker(
  jacFilePath: string,
  walkerName: string,
  args: Record<string, unknown>,
  timeoutMs: number
): Promise<PolicyResult> {
  return new Promise((resolve) => {
    const safeDefault: PolicyResult = {
      verdict: 'CONFIRM',
      blockReason: null,
      message: 'Policy check could not complete. Confirm to proceed.',
      policyName: `${walkerName}:error`,
      requiresConfirmation: true,
    };

    // Validate inputs
    const resolvedPath = path.resolve(jacFilePath);
    if (!resolvedPath.endsWith('.jac')) {
      debug(`Invalid jac file path: ${jacFilePath}`);
      resolve(safeDefault);
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(walkerName)) {
      debug(`Invalid walker name: ${walkerName}`);
      resolve(safeDefault);
      return;
    }

    let timedOut = false;
    let resolved = false;
    let stdout = '';
    let stderr = '';
    let outputExceeded = false;

    function resolveOnce(result: PolicyResult): void {
      if (resolved) return;
      resolved = true;
      resolve(result);
    }

    const proc = spawn('jac', ['run', resolvedPath, '--entrypoint', walkerName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      debug(`Jac walker ${walkerName} timed out after ${timeoutMs}ms`);
      resolveOnce(safeDefault);
    }, timeoutMs);

    proc.stdin.write(JSON.stringify(args));
    proc.stdin.end();

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_OUTPUT_BYTES && !outputExceeded) {
        outputExceeded = true;
        proc.kill('SIGTERM');
        debug(`Jac walker ${walkerName} output exceeded ${MAX_OUTPUT_BYTES} bytes`);
        resolveOnce(safeDefault);
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > MAX_OUTPUT_BYTES && !outputExceeded) {
        outputExceeded = true;
        proc.kill('SIGTERM');
        debug(`Jac walker ${walkerName} stderr exceeded ${MAX_OUTPUT_BYTES} bytes`);
        resolveOnce(safeDefault);
      }
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);

      if (timedOut) return;

      if (stderr) {
        debug(`Jac walker ${walkerName} stderr:`, stderr);
      }

      if (code !== 0) {
        debug(`Jac walker ${walkerName} exited with code ${code}`);
        resolveOnce(safeDefault);
        return;
      }

      try {
        const result = JSON.parse(stdout.trim()) as PolicyResult;
        resolveOnce(result);
      } catch {
        debug(`Jac walker ${walkerName} returned invalid JSON:`, stdout);
        resolveOnce(safeDefault);
      }
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      if (!timedOut) {
        debug(`Jac walker ${walkerName} process error:`, err.message);
        resolveOnce(safeDefault);
      }
    });
  });
}
