import axios from 'axios';

const RETRY_DELAYS_MS = [1_000, 2_000] as const;

/**
 * Wraps an HTTP call with up to 3 attempts.
 * 404 and 403 are non-retryable and rethrown immediately.
 * 429 / 5xx get up to 2 retries with exponential backoff.
 * Non-Axios errors (programming bugs, cancelled signals) propagate instantly.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!axios.isAxiosError(err)) throw err;

      const status = err.response?.status;
      if (status === 404 || status === 403) throw err;

      if (attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt];
        await new Promise<void>((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
