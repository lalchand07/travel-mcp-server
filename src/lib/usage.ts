export interface ProviderUsage {
  upstreamCalls: number;
  cacheHits: number;
  errors: number;
  byEndpoint: Record<string, number>;
}

/** Counts API activity since the server process started. Never stores keys or request URLs. */
export class UsageTracker {
  readonly startedAt = new Date();
  private readonly providers = new Map<string, ProviderUsage>();

  private get(provider: string): ProviderUsage {
    let u = this.providers.get(provider);
    if (!u) {
      u = { upstreamCalls: 0, cacheHits: 0, errors: 0, byEndpoint: {} };
      this.providers.set(provider, u);
    }
    return u;
  }

  recordCall(provider: string, endpoint: string): void {
    const u = this.get(provider);
    u.upstreamCalls++;
    u.byEndpoint[endpoint] = (u.byEndpoint[endpoint] ?? 0) + 1;
  }

  recordCacheHit(provider: string): void {
    this.get(provider).cacheHits++;
  }

  recordError(provider: string): void {
    this.get(provider).errors++;
  }

  snapshot(): Record<string, ProviderUsage> {
    return Object.fromEntries(
      [...this.providers].map(([k, v]) => [k, { ...v, byEndpoint: { ...v.byEndpoint } }]),
    );
  }
}
