import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, fixture, TEST_KEY, type Harness } from './helpers.js';

const ONEWAY = /^https:\/\/api\.flightapi\.io\/onewaytrip\//;
const ROUND = /^https:\/\/api\.flightapi\.io\/roundtrip\//;

let h: Harness;
afterEach(async () => {
  await h.close();
});

const base = { origin: 'HEL', destination: 'OUL', departure_date: '2026-12-15' };

describe('search_flight_prices', () => {
  it('calls the documented one-way endpoint with path parameters in order', async () => {
    h = await createHarness({ routes: [{ match: ONEWAY, body: fixture('flightapi/onewaytrip.json') }] });
    const r = await h.call('search_flight_prices', { ...base, adults: 2, children: 1, currency: 'eur' });
    expect(r.isError).toBeFalsy();
    expect(h.fetch.calls).toEqual([
      `https://api.flightapi.io/onewaytrip/${TEST_KEY}/HEL/OUL/2026-12-15/2/1/0/Economy/EUR`,
    ]);
  });

  it('summarizes the cheapest options, sorted by price, with the indicative-price note', async () => {
    h = await createHarness({ routes: [{ match: ONEWAY, body: fixture('flightapi/onewaytrip.json') }] });
    const r = await h.call('search_flight_prices', base);
    const data = r.structuredContent as {
      options: { price: number; outbound: { stops: number; duration: string } }[];
    };
    expect(data.options.map((o) => o.price)).toEqual([52.1, 87.5]);
    expect(data.options[0]?.outbound).toMatchObject({
      stops: 0,
      duration: '1h 00m',
      departure: '2024-05-20T06:00:00',
    });
    expect(r.text).toContain('1. 52.10 USD');
    expect(r.text).toMatch(/prices are indicative/i);
    expect(r.text).toMatch(/cannot book/i);
  });

  it('resolves airline, airport and agent names from lookup lists when present', async () => {
    h = await createHarness({
      routes: [{ match: ONEWAY, body: fixture('flightapi/onewaytrip-with-lookups.json') }],
    });
    const r = await h.call('search_flight_prices', base);
    expect(r.text).toContain(
      'HEL 2024-05-20 06:00 -> OUL 2024-05-20 07:00 | 1h 00m | non-stop | Finnair [AY431]',
    );
    expect(r.text).toContain('Sold by: Finnair');
  });

  it('uses the round-trip endpoint and summarizes both legs', async () => {
    h = await createHarness({ routes: [{ match: ROUND, body: fixture('flightapi/roundtrip.json') }] });
    const r = await h.call('search_flight_prices', {
      origin: 'JFK',
      destination: 'LAX',
      departure_date: '2026-12-15',
      return_date: '2026-12-22',
      cabin_class: 'premium_economy',
      infants: 1,
    });
    expect(h.fetch.calls[0]).toBe(
      `https://api.flightapi.io/roundtrip/${TEST_KEY}/JFK/LAX/2026-12-15/2026-12-22/1/0/1/Premium_Economy/USD`,
    );
    const data = r.structuredContent as { options: { price: number; return?: { stops: number } }[] };
    expect(data.options[0]?.price).toBe(1250.4);
    expect(data.options[0]?.return?.stops).toBe(1);
    expect(r.text).toMatch(/Back: /);
  });

  it('caches identical searches for 30 minutes', async () => {
    h = await createHarness({ routes: [{ match: ONEWAY, body: fixture('flightapi/onewaytrip.json') }] });
    await h.call('search_flight_prices', base);
    const second = await h.call('search_flight_prices', { ...base, origin: 'hel' });
    expect(second.text).toContain('(cached result)');
    expect(h.fetch.calls).toHaveLength(1);
    h.clock.advance(29 * 60_000);
    await h.call('search_flight_prices', base);
    expect(h.fetch.calls).toHaveLength(1);
    h.clock.advance(2 * 60_000);
    await h.call('search_flight_prices', base);
    expect(h.fetch.calls).toHaveLength(2);
  });

  it('caches empty results only briefly', async () => {
    h = await createHarness({
      routes: [{ match: ONEWAY, body: { itineraries: [], legs: [], segments: [] } }],
    });
    const r = await h.call('search_flight_prices', base);
    expect(r.text).toMatch(/No priced itineraries/);
    h.clock.advance(3 * 60_000);
    await h.call('search_flight_prices', base);
    expect(h.fetch.calls).toHaveLength(2);
  });

  it('enforces the per-minute limit with a friendly error', async () => {
    h = await createHarness({
      routes: [{ match: ONEWAY, body: fixture('flightapi/onewaytrip.json') }],
      env: { FLIGHTAPI_MAX_PER_MINUTE: '2' },
    });
    await h.call('search_flight_prices', { ...base, departure_date: '2026-12-15' });
    await h.call('search_flight_prices', { ...base, departure_date: '2026-12-16' });
    const r = await h.call('search_flight_prices', { ...base, departure_date: '2026-12-17' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/\[RATE_LIMITED\].*protects your API credits/s);
    expect(h.fetch.calls).toHaveLength(2);
    // Cached searches are still served while limited.
    expect((await h.call('search_flight_prices', base)).isError).toBeFalsy();
  });

  it('explains how to add a key when none is configured', async () => {
    h = await createHarness({ env: { FLIGHTAPI_KEY: '' } });
    const r = await h.call('search_flight_prices', base);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/\[MISSING_API_KEY\]/);
    expect(r.text).toMatch(/FLIGHTAPI_KEY/);
    expect(h.fetch.calls).toHaveLength(0);
  });

  it.each([
    [{ ...base, departure_date: '2026-01-01' }, /in the past/],
    [{ ...base, departure_date: '2026-13-01' }, /not a valid calendar date/],
    [{ ...base, origin: 'LONDON' }, /3-letter IATA/],
    [{ ...base, adults: 0 }, /adults/],
    [{ ...base, cabin_class: 'luxury' }, /cabin_class/],
    [{ ...base, unexpected: true }, /Unrecognized key/],
  ])('rejects invalid input %#', async (args, message) => {
    h = await createHarness();
    const r = await h.call('search_flight_prices', args);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(message);
    expect(h.fetch.calls).toHaveLength(0);
  });

  it.each([
    [{ ...base, destination: 'HEL' }, /must be different/],
    [{ ...base, return_date: '2026-12-01' }, /on or after departure_date/],
    [{ ...base, adults: 1, infants: 2 }, /infants cannot exceed adults/],
    [{ ...base, adults: 6, children: 4 }, /At most 9/],
    [{ ...base, origin: 'QQQ' }, /Unknown airport code QQQ/],
  ])('rejects inconsistent input before spending credits %#', async (args, message) => {
    h = await createHarness();
    const r = await h.call('search_flight_prices', args);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/\[VALIDATION\]/);
    expect(r.text).toMatch(message);
    expect(h.fetch.calls).toHaveLength(0);
  });

  it.each([
    [404, /\[UPSTREAM_NOT_FOUND\]/],
    [410, /no flights for this route and date on that date/],
    [429, /\[UPSTREAM_QUOTA\].*plan limit/s],
    [403, /\[UPSTREAM_AUTH\]/],
    [500, /\[UPSTREAM_ERROR\]/],
  ])('maps HTTP %i to a friendly error without retrying', async (status, message) => {
    h = await createHarness({ routes: [{ match: ONEWAY, status, body: { message: `bad ${TEST_KEY}` } }] });
    const r = await h.call('search_flight_prices', base);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(message);
    expect(h.fetch.calls).toHaveLength(1);
  });

  it('never leaks the API key in results or errors', async () => {
    h = await createHarness({
      routes: [{ match: ONEWAY, error: new TypeError(`connect ECONNREFUSED /${TEST_KEY}/`) }],
    });
    const r = await h.call('search_flight_prices', base);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/\[NETWORK\]/);
    expect(JSON.stringify(r)).not.toContain(TEST_KEY);
    expect(h.fetch.calls).toHaveLength(2); // one retry on network errors
  });
});
