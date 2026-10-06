/** HTTP statuses that mean "try again shortly": rate limit or temporary overload. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  /** Injected in tests so they do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Abort each attempt after this long. */
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** fetch with exponential backoff on transient provider errors. */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { attempts = 3, baseDelayMs = 1500, sleep = defaultSleep, timeoutMs }: RetryOptions = {},
): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    last = await fetch(url, timeoutMs ? { ...init, signal: AbortSignal.timeout(timeoutMs) } : init);
    if (last.ok || !RETRYABLE.has(last.status) || attempt === attempts) return last;
    await sleep(baseDelayMs * 2 ** (attempt - 1));
  }
  return last!;
}

/** Extracts a readable message from a provider's JSON error body. */
export async function providerError(provider: string, res: Response): Promise<Error> {
  let detail = res.statusText;
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    const message = typeof body.error === "string" ? body.error : body.error?.message;
    if (message) detail = message;
  } catch {
    // keep the status text
  }
  return new Error(`${provider} request failed (${res.status}): ${detail}`);
}
