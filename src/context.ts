import type { Config } from './config.js';
import { TtlCache } from './lib/cache.js';
import type { FetchLike } from './lib/http-client.js';
import { RateLimiter } from './lib/rate-limiter.js';
import { UsageTracker } from './lib/usage.js';
import { AirlineDirectory } from './providers/airlines.js';
import { AirportDirectory } from './providers/airports.js';
import { CurrencyProvider } from './providers/currency.js';
import { FlightApiClient } from './providers/flightapi.js';

/**
 * Process-wide state shared by every MCP session (important in HTTP mode, where each
 * request gets a fresh McpServer): one cache, one limiter and one usage counter.
 */
export interface AppContext {
  config: Config;
  cache: TtlCache;
  limiter: RateLimiter;
  usage: UsageTracker;
  airports: AirportDirectory;
  airlines: AirlineDirectory;
  currency: CurrencyProvider;
  flightApi: FlightApiClient;
  now: () => Date;
}

export interface ContextOverrides {
  fetch?: FetchLike;
  now?: () => Date;
  airports?: AirportDirectory;
  airlines?: AirlineDirectory;
}

let bundled: { airports: AirportDirectory; airlines: AirlineDirectory } | undefined;

export function createContext(config: Config, overrides: ContextOverrides = {}): AppContext {
  const fetchImpl: FetchLike = overrides.fetch ?? ((input, init) => fetch(input, init));
  const now = overrides.now ?? (() => new Date());
  const clock = () => now().getTime();
  bundled ??= { airports: AirportDirectory.fromBundledData(), airlines: AirlineDirectory.fromBundledData() };

  const cache = new TtlCache({ filePath: config.cacheFile, now: clock });
  const limiter = new RateLimiter({ ...config.limits, now: clock });
  const usage = new UsageTracker();

  return {
    config,
    cache,
    limiter,
    usage,
    airports: overrides.airports ?? bundled.airports,
    airlines: overrides.airlines ?? bundled.airlines,
    currency: new CurrencyProvider({
      fetch: fetchImpl,
      cache,
      usage,
      ttlMs: config.ttl.fxMs,
      timeoutMs: config.requestTimeoutMs,
    }),
    flightApi: new FlightApiClient({
      apiKey: config.flightApiKey,
      fetch: fetchImpl,
      cache,
      limiter,
      usage,
      ttl: { pricesMs: config.ttl.pricesMs, statusMs: config.ttl.statusMs },
      timeoutMs: config.requestTimeoutMs,
    }),
    now,
  };
}
