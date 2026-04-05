import { spawn } from 'child_process';
import { debug } from './logger.js';
/**
 * Runs a Jac walker as a subprocess and returns its PolicyResult.
 *
 * If the subprocess times out, errors, or returns invalid JSON:
 *   Returns CONFIRM verdict (safe default -- never silently execute).
 *
 * This function NEVER throws. All errors become CONFIRM verdicts.
 */
export async function runJacWalker(jacFilePath, walkerName, args, timeoutMs) {
    return new Promise((resolve) => {
        const safeDefault = {
            verdict: 'CONFIRM',
            blockReason: null,
            message: 'Policy check could not complete. Confirm to proceed.',
            policyName: `${walkerName}:error`,
            requiresConfirmation: true,
        };
        let timedOut = false;
        let stdout = '';
        let stderr = '';
        const proc = spawn('jac', ['run', jacFilePath, '--entrypoint', walkerName], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill('SIGTERM');
            debug(`Jac walker ${walkerName} timed out after ${timeoutMs}ms`);
            resolve(safeDefault);
        }, timeoutMs);
        proc.stdin.write(JSON.stringify(args));
        proc.stdin.end();
        proc.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        proc.on('close', (code) => {
            clearTimeout(timer);
            if (timedOut)
                return;
            if (stderr) {
                debug(`Jac walker ${walkerName} stderr:`, stderr);
            }
            if (code !== 0) {
                debug(`Jac walker ${walkerName} exited with code ${code}`);
                resolve(safeDefault);
                return;
            }
            try {
                const result = JSON.parse(stdout.trim());
                resolve(result);
            }
            catch {
                debug(`Jac walker ${walkerName} returned invalid JSON:`, stdout);
                resolve(safeDefault);
            }
        });
        proc.on('error', (err) => {
            clearTimeout(timer);
            if (!timedOut) {
                debug(`Jac walker ${walkerName} process error:`, err.message);
                resolve(safeDefault);
            }
        });
    });
}
