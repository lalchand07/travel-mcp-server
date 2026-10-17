import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, fixture, TEST_KEY, type Harness } from './helpers.js';

const AIRLINE = /^https:\/\/api\.flightapi\.io\/airline\//;
let h: Harness;
afterEach(async () => {
  await h.close();
});

describe('get_flight_status', () => {
  it('calls the documented tracking endpoint and summarizes status, times, terminals and gates', async () => {
    h = await createHarness({ routes: [{ match: AIRLINE, body: fixture('flightapi/airline.json') }] });
    const r = await h.call('get_flight_status', { flight_number: 'ba 478', date: '2026-10-18' });
    expect(r.isError).toBeFalsy();
    expect(h.fetch.calls).toEqual([
      `https://api.flightapi.io/airline/${TEST_KEY}?num=478&name=BA&date=20261018`,
    ]);
    expect(r.text).toContain('Flight BA478 on 2026-10-18: In the air (1 hr 12 min remaining)');
    expect(r.text).toContain('Departure: Barcelona (BCN), terminal 1');
    expect(r.text).toContain('Arrival: Heathrow (LHR), terminal 5');
    expect(r.text).toContain('scheduled 16:15, Jul 16, estimated 16:21, Jul 16');
    expect(r.structuredContent).toMatchObject({
      status: 'In the air (1 hr 12 min remaining)',
      departure: { airportCode: 'BCN', actualTakeoff: '15:27, Jul 16' },
      arrival: { airportCode: 'LHR', terminal: '5', gate: null },
    });
  });

  it('passes the optional departure airport as depap', async () => {
    h = await createHarness({ routes: [{ match: AIRLINE, body: fixture('flightapi/airline.json') }] });
    await h.call('get_flight_status', {
      flight_number: 'DL33',
      date: '2026-10-17',
      departure_airport: 'atl',
    });
    expect(h.fetch.calls[0]).toContain('?num=33&name=DL&date=20261017&depap=ATL');
  });

  it('caches status for 2 minutes', async () => {
    h = await createHarness({ routes: [{ match: AIRLINE, body: fixture('flightapi/airline.json') }] });
    const args = { flight_number: 'BA478', date: '2026-10-17' };
    await h.call('get_flight_status', args);
    expect((await h.call('get_flight_status', args)).text).toContain('(cached');
    expect(h.fetch.calls).toHaveLength(1);
    h.clock.advance(2 * 60_000 + 1);
    await h.call('get_flight_status', args);
    expect(h.fetch.calls).toHaveLength(2);
  });

  it('reports landed flights', async () => {
    const data = fixture('flightapi/airline.json') as [unknown, { arrival: Record<string, unknown> }];
    data[1].arrival.onGroundTime = '16:20, Jul 16';
    h = await createHarness({ routes: [{ match: AIRLINE, body: data }] });
    expect(
      (await h.call('get_flight_status', { flight_number: 'BA478', date: '2026-10-17' })).text,
    ).toContain(': Landed');
  });

  it('handles unknown flights', async () => {
    h = await createHarness({ routes: [{ match: AIRLINE, status: 404, body: {} }] });
    const r = await h.call('get_flight_status', { flight_number: 'BA9999', date: '2026-10-17' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/FlightAPI found no flight/);
  });

  it.each([
    [{ flight_number: '478', date: '2026-10-17' }, /flight number like/],
    [{ flight_number: 'BA478', date: '2026-11-30' }, /within 7 day/],
    [{ flight_number: 'BA478', date: '17-10-2026' }, /YYYY-MM-DD/],
  ])('validates input %#', async (args, message) => {
    h = await createHarness();
    const r = await h.call('get_flight_status', args);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(message);
    expect(h.fetch.calls).toHaveLength(0);
  });
});
