import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, fixture, type Harness } from './helpers.js';

const FX = /^https:\/\/api\.frankfurter\.dev\/v1\/latest$/;
let h: Harness;
afterEach(async () => {
  await h.close();
});

describe('convert_currency', () => {
  it('converts via EUR cross rates from the ECB table', async () => {
    h = await createHarness({ routes: [{ match: FX, body: fixture('frankfurter/latest.json') }] });
    const r = await h.call('convert_currency', { amount: 100, from: 'gbp', to: 'usd' });
    expect(r.isError).toBeFalsy();
    // 1.1675 / 0.8642 = 1.350960...
    expect(r.structuredContent).toMatchObject({
      from: 'GBP',
      to: 'USD',
      rate: 1.35096,
      result: 135.1,
      date: '2026-10-16',
    });
    expect(r.text).toContain('100 GBP = 135.10 USD');
  });

  it('handles EUR as either side', async () => {
    h = await createHarness({ routes: [{ match: FX, body: fixture('frankfurter/latest.json') }] });
    expect(
      (await h.call('convert_currency', { amount: 10, from: 'EUR', to: 'INR' })).structuredContent,
    ).toMatchObject({
      result: 981.2,
    });
    expect(
      (await h.call('convert_currency', { amount: 1.1675, from: 'USD', to: 'EUR' })).structuredContent,
    ).toMatchObject({
      result: 1,
    });
  });

  it('fetches the table once and caches it for 12 hours', async () => {
    h = await createHarness({ routes: [{ match: FX, body: fixture('frankfurter/latest.json') }] });
    await h.call('convert_currency', { amount: 1, from: 'GBP', to: 'USD' });
    await h.call('convert_currency', { amount: 5, from: 'JPY', to: 'CHF' });
    h.clock.advance(11 * 3600_000);
    await h.call('convert_currency', { amount: 5, from: 'CAD', to: 'AUD' });
    expect(h.fetch.calls).toHaveLength(1);
    h.clock.advance(2 * 3600_000);
    await h.call('convert_currency', { amount: 5, from: 'CAD', to: 'AUD' });
    expect(h.fetch.calls).toHaveLength(2);
  });

  it('explains when a currency is not in the ECB set', async () => {
    h = await createHarness({ routes: [{ match: FX, body: fixture('frankfurter/latest.json') }] });
    const r = await h.call('convert_currency', { amount: 100, from: 'PKR', to: 'GBP' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/PKR is not covered by the European Central Bank/);
    expect(r.text).toMatch(/Supported currencies: AUD, CAD/);
  });

  it('works without a FlightAPI key', async () => {
    h = await createHarness({
      env: { FLIGHTAPI_KEY: '' },
      routes: [{ match: FX, body: fixture('frankfurter/latest.json') }],
    });
    expect((await h.call('convert_currency', { amount: 1, from: 'GBP', to: 'USD' })).isError).toBeFalsy();
  });

  it('validates input', async () => {
    h = await createHarness();
    expect((await h.call('convert_currency', { amount: -5, from: 'GBP', to: 'USD' })).isError).toBe(true);
    expect((await h.call('convert_currency', { amount: 5, from: 'pounds', to: 'USD' })).isError).toBe(true);
    expect(h.fetch.calls).toHaveLength(0);
  });

  it('reports network failures plainly', async () => {
    h = await createHarness({ routes: [{ match: FX, error: new TypeError('fetch failed') }] });
    const r = await h.call('convert_currency', { amount: 1, from: 'GBP', to: 'USD' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/\[NETWORK\] Could not reach the exchange-rate service/);
  });
});
