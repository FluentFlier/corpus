import {
  evaluatePolicies,
  buildLogEntry,
  sendLogEntry,
  CorpusBlockedError,
  CorpusConfigError,
  DEFAULT_UNDO_WINDOW_MS,
} from '@corpus/core';
import type { CorpusConfig, CorpusInput, CorpusHooks, PolicyResult } from '@corpus/core';

export class CorpusClient {
  private readonly config: CorpusConfig;

  constructor(config: CorpusConfig) {
    if (!config.projectSlug) throw new CorpusConfigError('projectSlug is required');
    if (!config.policyPath) throw new CorpusConfigError('policyPath is required');
    this.config = config;
  }

  /**
   * Wrap any agent action with Corpus policy enforcement.
   */
  async protect<TResult = unknown>(
    input: CorpusInput,
    executeFn: () => Promise<TResult>,
    undoFn: (() => Promise<void>) | undefined,
    hooks: CorpusHooks<TResult> = {}
  ): Promise<TResult | null> {
    if (!input || !input.actionType) {
      throw new CorpusConfigError('input.actionType is required');
    }

    const { result, durationMs } = await evaluatePolicies(input, this.config);

    hooks.onPolicyEvalComplete?.(result, durationMs);

    if (result.verdict === 'BLOCK') {
      sendLogEntry(
        buildLogEntry(input, result, 'BLOCK', null, this.config.projectSlug, durationMs),
        this.config
      );

      if (this.config.mode === 'enforce') {
        hooks.onBlocked?.(result.message, result.blockReason);
        throw new CorpusBlockedError(result.policyName, result.blockReason, result.message);
      }

      // Observe mode: log but execute anyway
      return executeFn();
    }

    if (result.verdict === 'CONFIRM') {
      if (this.config.mode === 'enforce' && hooks.onConfirmRequired) {
        return new Promise<TResult | null>((resolve, reject) => {
          hooks.onConfirmRequired!(
            result.message,
            async () => {
              sendLogEntry(
                buildLogEntry(input, result, 'CONFIRM', 'CONFIRMED', this.config.projectSlug, durationMs),
                this.config
              );
              try {
                const actionResult = await this.executeWithUndo(executeFn, undoFn, hooks);
                resolve(actionResult);
              } catch (e) {
                reject(e);
              }
              return null;
            },
            () => {
              sendLogEntry(
                buildLogEntry(input, result, 'CONFIRM', 'CANCELLED', this.config.projectSlug, durationMs),
                this.config
              );
              resolve(null);
            }
          );
        });
      }

      // Observe mode or no confirm hook: log and execute
      sendLogEntry(
        buildLogEntry(input, result, 'CONFIRM', 'CONFIRMED', this.config.projectSlug, durationMs),
        this.config
      );
      return this.executeWithUndo(executeFn, undoFn, hooks);
    }

    // PASS
    sendLogEntry(
      buildLogEntry(input, result, 'PASS', null, this.config.projectSlug, durationMs),
      this.config
    );
    return this.executeWithUndo(executeFn, undoFn, hooks);
  }

  private async executeWithUndo<TResult>(
    executeFn: () => Promise<TResult>,
    undoFn: (() => Promise<void>) | undefined,
    hooks: CorpusHooks<TResult>
  ): Promise<TResult> {
    const result = await executeFn();

    if (undoFn && hooks.onUndoAvailable) {
      const windowMs = this.config.timeouts?.undoWindowMs ?? DEFAULT_UNDO_WINDOW_MS;
      let cancelled = false;

      // Notify at start, 40%, and 80% through the window
      const notifyDelays = [0, Math.floor(windowMs * 0.4), Math.floor(windowMs * 0.8)];
      for (const delay of notifyDelays) {
        if (cancelled) break;
        if (delay > 0) {
          await new Promise<void>((res) => setTimeout(res, delay - (notifyDelays[notifyDelays.indexOf(delay) - 1] ?? 0)));
        }
        const msRemaining = windowMs - delay;
        hooks.onUndoAvailable('Action complete.', async () => {
          cancelled = true;
          await undoFn();
        }, msRemaining);
      }

      // Wait for remaining window time
      if (!cancelled) {
        const elapsed = notifyDelays[notifyDelays.length - 1] ?? 0;
        if (elapsed < windowMs) {
          await new Promise<void>((res) => setTimeout(res, windowMs - elapsed));
        }
      }
    }

    return result;
  }
}

export function createCorpus(config: CorpusConfig): CorpusClient {
  return new CorpusClient(config);
}
