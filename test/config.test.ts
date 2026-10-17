import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('has safe defaults', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({
      flightApiKey: undefined,
      transport: 'stdio',
      limits: { perMinute: 10, perDay: 100 },
      defaultCurrency: 'USD',
      ttl: { pricesMs: 30 * 60_000, statusMs: 2 * 60_000, fxMs: 12 * 3_600_000 },
      requestTimeoutMs: 10_000,
      http: { host: '127.0.0.1', port: 3000, allowPathToken: false },
    });
  });

  it('reads env vars and lets CLI flags win', () => {
    const c = loadConfig(
      { MCP_TRANSPORT: 'stdio', MCP_HTTP_PORT: '8080', FLIGHTAPI_MAX_PER_DAY: '20', DEFAULT_CURRENCY: 'gbp' },
      { http: true, port: 9000 },
    );
    expect(c.transport).toBe('http');
    expect(c.http.port).toBe(9000);
    expect(c.limits.perDay).toBe(20);
    expect(c.defaultCurrency).toBe('GBP');
  });

  it('rejects invalid values with a clear error', () => {
    expect(() => loadConfig({ FLIGHTAPI_MAX_PER_MINUTE: 'lots' })).toThrow(ConfigError);
    expect(() => loadConfig({ MCP_TRANSPORT: 'sse' })).toThrow(/MCP_TRANSPORT/);
  });

  it('treats an empty key as missing', () => {
    expect(loadConfig({ FLIGHTAPI_KEY: '  ' }).flightApiKey).toBeUndefined();
  });
});
