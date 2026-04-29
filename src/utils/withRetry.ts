/**
 * Generic exponential-backoff retry helper for async operations.
 *
 * Retries on rate-limit / transient network errors up to `maxRetries` times,
 * doubling the delay each attempt.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  initialDelayMs = 1000,
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const errMsg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    const shouldRetry =
      maxRetries > 0 &&
      (errMsg.includes('rate limit') ||
        errMsg.includes('429') ||
        errMsg.includes('request failed') ||
        errMsg.includes('internal error') ||
        errMsg.includes('timeout') ||
        errMsg.includes('retry'));

    if (shouldRetry) {
      console.warn(
        `RPC call failed, retrying… (${maxRetries} left). Error: ${errMsg.slice(0, 100)}`,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, initialDelayMs));
      return withRetry(fn, maxRetries - 1, initialDelayMs * 1.5);
    }

    throw error;
  }
}
