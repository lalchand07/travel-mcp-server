import { describe, expect, it } from 'vitest';
import { ToolError } from '../src/lib/errors.js';
import { RateLimiter } from '../src/lib/rate-limiter.js';

describe('RateLimiter', () => {
  it('enforces the per-minute limit with a friendly message, then recovers', () => {
    let t = 0;
    const rl = new RateLimiter({ perMinute: 2, perDay: 100, now: () => t });
    rl.consume('FlightAPI');
    rl.consume('FlightAPI');
    let err: unknown;
    try {
      rl.consume('FlightAPI');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).code).toBe('RATE_LIMITED');
    expect((err as ToolError).message).toMatch(/per-minute safety limit/i);
    expect((err as ToolError).hint).toMatch(/FLIGHTAPI_MAX_PER_MINUTE/);
    t = 60_001;
    expect(() => {
      rl.consume('FlightAPI');
    }).not.toThrow();
  });

  it('enforces the daily limit over a rolling 24h window', () => {
    let t = 0;
    const rl = new RateLimiter({ perMinute: 0, perDay: 3, now: () => t });
    for (let i = 0; i < 3; i++) {
      rl.consume('FlightAPI');
      t += 61_000;
    }
    expect(() => {
      rl.consume('FlightAPI');
    }).toThrow(/Daily safety limit/);
    expect(rl.snapshot()).toMatchObject({ usedLast24h: 3 });
    t = 24 * 3600_000 + 1;
    expect(() => {
      rl.consume('FlightAPI');
    }).not.toThrow();
  });

  it('treats 0 as unlimited', () => {
    const rl = new RateLimiter({ perMinute: 0, perDay: 0 });
    for (let i = 0; i < 500; i++) rl.consume('x');
    expect(rl.snapshot().usedLastMinute).toBe(500);
  });
});
