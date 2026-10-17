import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, fixture, TEST_KEY, testClock, type Harness } from './helpers.js';

const SCHEDULE = /^https:\/\/api\.flightapi\.io\/schedule\//;
let h: Harness;
afterEach(async () => {
  await h.close();
});

// The documented sample is from 12 July 2020 (timestamps around 1594550400).
const sampleDay = () => testClock('2020-07-12T10:30:00Z');

describe('get_airport_schedule', () => {
  it('calls the documented schedule endpoint with mode, iata and day', async () => {
    h = await createHarness({
      clock: sampleDay(),
      routes: [{ match: SCHEDULE, body: fixture('flightapi/schedule.json') }],
    });
    await h.call('get_airport_schedule', { airport_code: 'doh', type: 'departures' });
    expect(h.fetch.calls).toEqual([
      `https://api.flightapi.io/schedule/${TEST_KEY}?mode=departures&iata=DOH&day=1`,
    ]);
  });

  it('lists upcoming flights in local time, soonest first, without already-departed ones', async () => {
    h = await createHarness({
      clock: sampleDay(),
      routes: [{ match: SCHEDULE, body: fixture('flightapi/schedule.json') }],
    });
    const r = await h.call('get_airport_schedule', { airport_code: 'DOH', type: 'departures' });
    expect(r.isError).toBeFalsy();
    const lines = r.text.split('\n');
    expect(lines[0]).toBe('Departures at Doha Hamad International Airport (DOH), times in Asia/Qatar');
    expect(lines[2]).toBe('13:40  QR8221  to Frankfurt (FRA) - Qatar Airways - Scheduled');
    expect(lines[3]).toBe('15:30  QR8860  to London (LHR) - Qatar Airways - Scheduled - gate C12');
    expect(r.text).not.toContain('QR1 ');
    const data = r.structuredContent as { flights: { scheduled: string }[] };
    expect(data.flights[0]?.scheduled).toBe('2020-07-12T13:40+03:00');
  });

  it('respects limit and supports tomorrow', async () => {
    h = await createHarness({
      clock: sampleDay(),
      routes: [{ match: SCHEDULE, body: fixture('flightapi/schedule.json') }],
    });
    const r = await h.call('get_airport_schedule', {
      airport_code: 'DOH',
      type: 'departures',
      day: 'tomorrow',
      limit: 1,
    });
    expect(h.fetch.calls[0]).toContain('day=2');
    expect((r.structuredContent as { flights: unknown[] }).flights).toHaveLength(1);
    expect(r.text).toMatch(/more upcoming flights not shown/);
  });

  it('caches boards for 2 minutes', async () => {
    h = await createHarness({
      clock: sampleDay(),
      routes: [{ match: SCHEDULE, body: fixture('flightapi/schedule.json') }],
    });
    await h.call('get_airport_schedule', { airport_code: 'DOH', type: 'departures' });
    await h.call('get_airport_schedule', { airport_code: 'DOH', type: 'departures' });
    expect(h.fetch.calls).toHaveLength(1);
    await h.call('get_airport_schedule', { airport_code: 'DOH', type: 'arrivals' });
    expect(h.fetch.calls).toHaveLength(2);
  });

  it('handles an empty board', async () => {
    h = await createHarness({
      routes: [{ match: SCHEDULE, body: { airport: { pluginData: { schedule: {} } } } }],
    });
    const r = await h.call('get_airport_schedule', { airport_code: 'LHE', type: 'arrivals' });
    expect(r.isError).toBeFalsy();
    expect(r.text).toMatch(/No upcoming flights/);
  });

  it('validates input', async () => {
    h = await createHarness();
    expect((await h.call('get_airport_schedule', { airport_code: 'DOH', type: 'both' })).isError).toBe(true);
    const unknown = await h.call('get_airport_schedule', { airport_code: 'ZZZ', type: 'arrivals' });
    expect(unknown.text).toMatch(/Unknown airport code ZZZ/);
    expect(h.fetch.calls).toHaveLength(0);
  });
});
