import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../src/lib/errors.js';
import { fetchJson } from '../src/lib/http-client.js';
import { clearSecrets, registerSecret } from '../src/lib/redact.js';

const noSleep = () => Promise.resolve();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  clearSecrets();
});

describe('fetchJson', () => {
  it('returns parsed JSON', async () => {
    const f = vi.fn(() => Promise.resolve(json({ ok: 1 })));
    await expect(fetchJson('https://x.test/a', { fetch: f, sleep: noSleep })).resolves.toEqual({ ok: 1 });
  });

  it('retries once on a network error, then succeeds', async () => {
    const f = vi
      .fn<(u: string) => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json({ ok: 2 }));
    const sleep = vi.fn(noSleep);
    await expect(fetchJson('https://x.test/a', { fetch: f, sleep })).resolves.toEqual({ ok: 2 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('gives up after one retry', async () => {
    const f = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    await expect(fetchJson('https://x.test/a', { fetch: f, sleep: noSleep })).rejects.toMatchObject({
      kind: 'network',
    });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('reports timeouts', async () => {
    const err = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const f = vi.fn(() => Promise.reject(err));
    await expect(fetchJson('https://x.test/a', { fetch: f, sleep: noSleep })).rejects.toMatchObject({
      kind: 'timeout',
    });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('really aborts slow requests after timeoutMs', async () => {
    const f = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          rej(init.signal?.reason as Error);
        });
      });
    await expect(
      fetchJson('https://x.test/a', { fetch: f, timeoutMs: 20, retries: 0 }),
    ).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it.each([400, 401, 404, 410, 429, 500, 503])('never retries HTTP %i', async (status) => {
    const f = vi.fn(() => Promise.resolve(json({ message: 'nope' }, status)));
    const err = await fetchJson('https://x.test/a', { fetch: f, sleep: noSleep }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(status);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('redacts secrets from error messages and bodies', async () => {
    registerSecret('supersecretkey123');
    const f = vi.fn(() =>
      Promise.reject(new TypeError('connect failed for https://api/x/supersecretkey123/y')),
    );
    const err = (await fetchJson('https://api/x/supersecretkey123/y', { fetch: f, sleep: noSleep }).catch(
      (e: unknown) => e,
    )) as HttpError;
    expect(err.message).not.toContain('supersecretkey123');
    expect(err.message).toContain('[REDACTED]');
  });

  it('rejects invalid JSON without retrying', async () => {
    const f = vi.fn(() => Promise.resolve(new Response('<html>', { status: 200 })));
    await expect(fetchJson('https://x.test/a', { fetch: f, sleep: noSleep })).rejects.toMatchObject({
      kind: 'parse',
    });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
