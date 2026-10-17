import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { log } from './logger.js';

interface Entry {
  value: unknown;
  expiresAt: number;
}

export interface TtlCacheOptions {
  /** Maximum number of entries kept in memory (oldest evicted first). */
  maxEntries?: number;
  /** Optional JSON file used to persist the cache across restarts. */
  filePath?: string | undefined;
  now?: () => number;
}

/**
 * Small TTL cache. In-memory by default; optionally persisted to a JSON file
 * (debounced writes, atomic rename). Insertion order doubles as LRU-ish eviction order.
 */
export class TtlCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly maxEntries: number;
  private readonly filePath: string | undefined;
  private readonly now: () => number;
  private flushTimer: NodeJS.Timeout | undefined;

  constructor(opts: TtlCacheOptions = {}) {
    this.maxEntries = opts.maxEntries ?? 500;
    this.filePath = opts.filePath;
    this.now = opts.now ?? Date.now;
    if (this.filePath) this.loadFromDisk();
  }

  get<T>(key: string): T | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.scheduleFlush();
  }

  /**
   * Returns the cached value or computes it. Concurrent identical requests share one
   * upstream call, so two parallel tool calls never spend two credits.
   */
  async getOrSet<T>(
    key: string,
    ttlMs: number,
    compute: () => Promise<T>,
  ): Promise<{ value: T; cached: boolean }> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return { value: hit, cached: true };
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return { value: await pending, cached: true };
    const p = compute();
    this.inflight.set(key, p);
    try {
      const value = await p;
      this.set(key, value, ttlMs);
      return { value, cached: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
    this.scheduleFlush();
  }

  private loadFromDisk(): void {
    if (!this.filePath) return;
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Record<string, Entry>;
      const now = this.now();
      for (const [k, e] of Object.entries(raw)) {
        if (typeof e.expiresAt === 'number' && e.expiresAt > now) this.entries.set(k, e);
      }
      log.debug('Loaded file cache', { entries: this.entries.size });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log.warn('Ignoring unreadable cache file');
    }
  }

  private scheduleFlush(): void {
    if (!this.filePath || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flush();
    }, 1000);
    this.flushTimer.unref();
  }

  /** Writes the cache file now (no-op without a file path). */
  flush(): void {
    if (!this.filePath) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.entries)), { mode: 0o600 });
      renameSync(tmp, this.filePath);
    } catch (err) {
      log.warn('Could not write cache file', { error: (err as Error).message });
    }
  }
}

/** Builds a stable cache key from a namespace and a flat params object. */
export function cacheKey(namespace: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .filter((k) => params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join('&');
  return `${namespace}?${sorted}`;
}
