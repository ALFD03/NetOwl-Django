/** Ejecuta una llamada a la API llevando su estado, su mensaje y su log. */

import { useCallback, useState } from 'react';

import { extractApiError } from '@/shared/lib/http/errors';
import type { StatusTone } from '@/shared/ui/feedback/StatusMessage';

export interface ActionStatus {
  type: StatusTone;
  text: string;
}

export interface UseAsyncActionOptions<TResult> {
  /** Message shown when the action resolves. Receives the resolved value. */
  successMessage: (result: TResult) => string;
  /** Message shown when the action rejects and the server sent nothing usable. */
  errorMessage: string;
  /** Pulls a server-side execution log out of the resolved value, if any. */
  readLog?: (result: TResult) => string | undefined;
  /** Text written to the log as soon as the action starts. */
  pendingLog?: string;
}

export interface UseAsyncActionResult<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  isPending: boolean;
  status: ActionStatus | null;
  log: string | null;
  setStatus: (status: ActionStatus | null) => void;
  reset: () => void;
}

/**
 * Runs an async API call while tracking its pending flag, its user-facing
 * status message and any execution log the server returned.
 *
 * This replaces the `isLoading` / `message` / `consoleLog` triple plus the
 * copy-pasted axios error narrowing that every import page repeated.
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: UseAsyncActionOptions<TResult>,
): UseAsyncActionResult<TArgs, TResult> {
  const { successMessage, errorMessage, readLog, pendingLog } = options;

  const [isPending, setIsPending] = useState(false);
  const [status, setStatus] = useState<ActionStatus | null>(null);
  const [log, setLog] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus(null);
    setLog(null);
  }, []);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      setIsPending(true);
      setStatus(null);
      setLog(pendingLog ?? null);

      try {
        const result = await action(...args);
        setStatus({ type: 'success', text: successMessage(result) });
        setLog(readLog?.(result) ?? null);
        return result;
      } catch (error) {
        const apiError = extractApiError(error, errorMessage);
        setStatus({ type: 'error', text: apiError.message });
        setLog(apiError.logOutput ?? apiError.message);
        return undefined;
      } finally {
        setIsPending(false);
      }
    },
    [action, successMessage, errorMessage, readLog, pendingLog],
  );

  return { run, isPending, status, log, setStatus, reset };
}
