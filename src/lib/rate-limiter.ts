import { ToolError } from './errors.js';

export interface RateLimiterOptions {
  perMinute: number;
  perDay: number;
  now?: () => number;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * Sliding-window limiter for outbound calls that cost the user credits.
 * Limits of 0 mean "unlimited". Only real upstream calls are counted (cache hits are free).
 */
export class RateLimiter {
  private readonly stamps: number[] = [];
  private readonly now: () => number;

  constructor(private readonly opts: RateLimiterOptions) {
    this.now = opts.now ?? Date.now;
  }

  private prune(now: number): void {
    while (this.stamps.length > 0 && (this.stamps[0] ?? Infinity) <= now - DAY) this.stamps.shift();
  }

  private countSince(since: number): number {
    let n = 0;
    for (let i = this.stamps.length - 1; i >= 0 && (this.stamps[i] ?? 0) > since; i--) n++;
    return n;
  }

  /** Throws a friendly RATE_LIMITED ToolError if a call is not allowed right now; otherwise records it. */
  consume(provider: string): void {
    const now = this.now();
    this.prune(now);
    const { perMinute, perDay } = this.opts;

    if (perDay > 0 && this.stamps.length >= perDay) {
      const retryIn = Math.ceil(((this.stamps[0] ?? now) + DAY - now) / 60_000);
      throw new ToolError(
        'RATE_LIMITED',
        `Daily safety limit reached: ${perDay} ${provider} requests in the last 24 hours. This protects your API credits.`,
        `Try again in about ${formatMinutes(retryIn)}, or raise FLIGHTAPI_MAX_PER_DAY in the server configuration. Cached results are still available.`,
      );
    }
    if (perMinute > 0 && this.countSince(now - MINUTE) >= perMinute) {
      const firstInWindow = this.stamps[this.stamps.length - perMinute] ?? now;
      const retrySec = Math.max(1, Math.ceil((firstInWindow + MINUTE - now) / 1000));
      throw new ToolError(
        'RATE_LIMITED',
        `Per-minute safety limit reached: ${perMinute} ${provider} requests per minute. This protects your API credits.`,
        `Wait about ${retrySec} seconds and try again, or raise FLIGHTAPI_MAX_PER_MINUTE.`,
      );
    }
    this.stamps.push(now);
  }

  snapshot(): { perMinute: number; perDay: number; usedLastMinute: number; usedLast24h: number } {
    const now = this.now();
    this.prune(now);
    return {
      perMinute: this.opts.perMinute,
      perDay: this.opts.perDay,
      usedLastMinute: this.countSince(now - MINUTE),
      usedLast24h: this.stamps.length,
    };
  }
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.round(min / 60);
  return `${h} hour${h === 1 ? '' : 's'}`;
}
