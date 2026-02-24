const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 2000;

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("429") ||
    msg.includes("RATELIMIT_EXCEEDED") ||
    msg.toLowerCase().includes("rate limit") ||
    msg.toLowerCase().includes("quota")
  );
}

export async function withRetry<T>(fn: () => Promise<T>, label?: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isRateLimitError(error) && attempt < MAX_RETRIES) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.log(`[AI Retry] ${label || "request"} hit rate limit, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}
