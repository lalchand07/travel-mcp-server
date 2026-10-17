import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cacheKey, TtlCache } from '../src/lib/cache.js';

describe('TtlCache', () => {
  it('expires entries after their TTL', () => {
    let t = 0;
    const c = new TtlCache({ now: () => t });
    c.set('a', 1, 1000);
    expect(c.get('a')).toBe(1);
    t = 999;
    expect(c.get('a')).toBe(1);
    t = 1000;
    expect(c.get('a')).toBeUndefined();
  });

  it('evicts the oldest entry beyond maxEntries', () => {
    const c = new TtlCache({ maxEntries: 2 });
    c.set('a', 1, 1000);
    c.set('b', 2, 1000);
    c.set('c', 3, 1000);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('c')).toBe(3);
  });

  it('shares one computation between concurrent identical requests', async () => {
    const c = new TtlCache();
    const compute = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 42;
    });
    const [a, b] = await Promise.all([c.getOrSet('k', 1000, compute), c.getOrSet('k', 1000, compute)]);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ value: 42, cached: false });
    expect(b).toEqual({ value: 42, cached: true });
    expect(await c.getOrSet('k', 1000, compute)).toEqual({ value: 42, cached: true });
  });

  it('does not cache failures', async () => {
    const c = new TtlCache();
    await expect(c.getOrSet('k', 1000, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(c.get('k')).toBeUndefined();
  });

  it('persists to and reloads from a file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'travel-mcp-'));
    const file = join(dir, 'cache.json');
    const c1 = new TtlCache({ filePath: file });
    c1.set('x', { price: 10 }, 60_000);
    c1.flush();
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveProperty('x');
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    const c2 = new TtlCache({ filePath: file });
    expect(c2.get('x')).toEqual({ price: 10 });
  });
});

describe('cacheKey', () => {
  it('is independent of property order and skips undefined', () => {
    expect(cacheKey('n', { b: 2, a: 1, c: undefined })).toBe(cacheKey('n', { a: 1, b: 2 }));
  });
});
