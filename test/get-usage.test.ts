import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, fixture, TEST_KEY, type Harness } from './helpers.js';

let h: Harness;
afterEach(async () => {
  await h.close();
});

describe('get_usage', () => {
  it('counts calls, cache hits, estimated credits and remaining limits', async () => {
    h = await createHarness({
      env: { FLIGHTAPI_MAX_PER_MINUTE: '5', FLIGHTAPI_MAX_PER_DAY: '50' },
      routes: [
        { match: /onewaytrip/, body: fixture('flightapi/onewaytrip.json') },
        { match: /\/airline\//, body: fixture('flightapi/airline.json') },
        { match: /frankfurter/, body: fixture('frankfurter/latest.json') },
      ],
    });
    const search = { origin: 'HEL', destination: 'OUL', departure_date: '2026-12-15' };
    await h.call('search_flight_prices', search);
    await h.call('search_flight_prices', search);
    await h.call('get_flight_status', { flight_number: 'BA478', date: '2026-10-17' });
    await h.call('convert_currency', { amount: 1, from: 'GBP', to: 'USD' });

    const r = await h.call('get_usage');
    expect(r.structuredContent).toMatchObject({
      flightApiKeyConfigured: true,
      flightapi: {
        upstreamCalls: 2,
        cacheHits: 1,
        errors: 0,
        byEndpoint: { onewaytrip: 1, airline: 1 },
        estimatedCreditsUsed: 3,
      },
      currency: { upstreamCalls: 1 },
      limits: { perMinute: 5, perDay: 50, usedLastMinute: 2, remainingThisMinute: 3, remainingToday: 48 },
    });
    expect(r.text).toContain('FlightAPI: 2 calls (~3 credits), 1 served from cache');
    expect(JSON.stringify(r)).not.toContain(TEST_KEY);
  });

  it('reports a missing key and unlimited limits', async () => {
    h = await createHarness({
      env: { FLIGHTAPI_KEY: '', FLIGHTAPI_MAX_PER_MINUTE: '0', FLIGHTAPI_MAX_PER_DAY: '0' },
    });
    const r = await h.call('get_usage');
    expect(r.structuredContent).toMatchObject({
      flightApiKeyConfigured: false,
      limits: { perMinute: 'unlimited', remainingToday: 'unlimited' },
    });
  });
});
