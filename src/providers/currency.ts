import { cacheKey, type TtlCache } from '../lib/cache.js';
import { HttpError, ToolError } from '../lib/errors.js';
import { fetchJson, type FetchLike } from '../lib/http-client.js';
import type { UsageTracker } from '../lib/usage.js';

/** Frankfurter v1: free, keyless ECB reference rates. https://frankfurter.dev/v1 */
export const FRANKFURTER_BASE_URL = 'https://api.frankfurter.dev/v1';

/** Untrusted upstream JSON: every field is checked before use. */
interface LatestResponse {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

export interface RatesTable {
  /** ECB publication date (YYYY-MM-DD). */
  date: string;
  /** Units of each currency per 1 EUR (EUR itself included as 1). */
  perEur: Record<string, number>;
}

export interface Conversion {
  amount: number;
  from: string;
  to: string;
  rate: number;
  result: number;
  date: string;
  source: string;
}

export interface CurrencyProviderDeps {
  fetch: FetchLike;
  cache: TtlCache;
  usage: UsageTracker;
  ttlMs: number;
  timeoutMs: number;
}

export class CurrencyProvider {
  constructor(private readonly deps: CurrencyProviderDeps) {}

  /** Fetches the full EUR-based table once per TTL; all pairs are derived from it. */
  async rates(): Promise<RatesTable> {
    const { cache, usage, ttlMs } = this.deps;
    const { value, cached } = await cache.getOrSet(cacheKey('frankfurter:latest', {}), ttlMs, async () => {
      usage.recordCall('frankfurter', 'latest');
      try {
        const data = await fetchJson<LatestResponse>(`${FRANKFURTER_BASE_URL}/latest`, {
          fetch: this.deps.fetch,
          timeoutMs: this.deps.timeoutMs,
        });
        if (typeof data.rates !== 'object' || typeof data.date !== 'string') {
          throw new HttpError('Unexpected response from Frankfurter', 200, 'parse');
        }
        const table: RatesTable = { date: data.date, perEur: { ...data.rates, [data.base ?? 'EUR']: 1 } };
        return table;
      } catch (err) {
        usage.recordError('frankfurter');
        throw toCurrencyError(err);
      }
    });
    if (cached) usage.recordCacheHit('frankfurter');
    return value;
  }

  async supported(): Promise<string[]> {
    return Object.keys((await this.rates()).perEur).sort();
  }

  async convert(amount: number, from: string, to: string): Promise<Conversion> {
    const table = await this.rates();
    const fromRate = table.perEur[from];
    const toRate = table.perEur[to];
    if (fromRate === undefined || toRate === undefined) {
      const unsupported = [from, to].filter((c) => table.perEur[c] === undefined);
      throw new ToolError(
        'VALIDATION',
        `${unsupported.join(' and ')} ${unsupported.length > 1 ? 'are' : 'is'} not covered by the European Central Bank reference rates.`,
        `Supported currencies: ${Object.keys(table.perEur).sort().join(', ')}.`,
      );
    }
    const rate = toRate / fromRate;
    return {
      amount,
      from,
      to,
      rate: round(rate, 6),
      result: round(amount * rate, 2),
      date: table.date,
      source: 'European Central Bank reference rates via Frankfurter (frankfurter.dev)',
    };
  }
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function toCurrencyError(err: unknown): Error {
  if (err instanceof ToolError) return err;
  if (err instanceof HttpError) {
    if (err.kind === 'timeout')
      return new ToolError('TIMEOUT', 'The exchange-rate service timed out.', 'Try again shortly.');
    if (err.kind === 'network')
      return new ToolError(
        'NETWORK',
        'Could not reach the exchange-rate service (frankfurter.dev).',
        'Check your internet connection.',
      );
    return new ToolError(
      'UPSTREAM_ERROR',
      `The exchange-rate service returned an error (${err.status ?? 'unknown'}).`,
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}
