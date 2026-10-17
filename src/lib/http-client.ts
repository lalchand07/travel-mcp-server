import { HttpError } from './errors.js';
import { redact } from './redact.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchJsonOptions {
  fetch: FetchLike;
  /** Per-attempt timeout. Default 10 s. */
  timeoutMs?: number;
  /** Extra attempts after a network error or timeout. Default 1. 4xx/5xx responses are never retried. */
  retries?: number;
  /** Base backoff delay; attempt n waits base * 2^n plus jitter. Default 500 ms. */
  backoffMs?: number;
  headers?: Record<string, string>;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * GETs a URL and parses JSON with a timeout and a conservative retry policy:
 *  - network errors and timeouts: retried (once by default) with exponential backoff
 *  - any HTTP error status: not retried. 4xx means the request is wrong, and a 5xx
 *    may already have been billed by the provider.
 * Error messages are redacted so API keys in URLs never leak.
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchJsonOptions): Promise<T> {
  const { timeoutMs = 10_000, retries = 1, backoffMs = 500, sleep = defaultSleep } = opts;
  let lastError: HttpError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100));
    let res: Response;
    try {
      res = await opts.fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json', 'user-agent': 'mcp-server-travel', ...opts.headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
    } catch (err) {
      const e = err as Error;
      const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError';
      lastError = new HttpError(
        isTimeout ? `Request timed out after ${timeoutMs / 1000}s` : `Network error: ${redact(e.message)}`,
        undefined,
        isTimeout ? 'timeout' : 'network',
      );
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      throw new HttpError(`Upstream returned HTTP ${res.status}`, res.status, 'http', redact(text.slice(0, 500)));
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new HttpError('Upstream returned invalid JSON', res.status, 'parse', redact(text.slice(0, 200)));
    }
  }
  throw lastError ?? new HttpError('Request failed', undefined, 'network');
}
