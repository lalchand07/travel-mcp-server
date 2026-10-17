import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './helpers.js';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(async () => {
  await h.close();
});

describe('search_airports', () => {
  it('finds an airport by city name', async () => {
    const r = await h.call('search_airports', { query: 'Lahore' });
    expect(r.isError).toBeFalsy();
    expect(r.text).toMatch(/^LHE\/OPLA - Allama Iqbal International Airport, Lahore, Pakistan/);
  });

  it('ranks the main airport first for multi-airport cities', async () => {
    const london = await h.call('search_airports', { query: 'london', limit: 3 });
    const results = (london.structuredContent as { results: { iata: string }[] }).results;
    expect(results.map((a) => a.iata)).toEqual(['LHR', 'LGW', 'LCY']);
    const paris = await h.call('search_airports', { query: 'Paris', limit: 1 });
    expect(paris.text).toContain('CDG');
  });

  it('matches IATA and ICAO codes exactly', async () => {
    expect((await h.call('search_airports', { query: 'jed', limit: 1 })).text).toContain('King Abdulaziz');
    expect((await h.call('search_airports', { query: 'OEMA', limit: 1 })).text).toContain('MED');
  });

  it('understands common aliases such as Makkah and Madinah', async () => {
    const r = await h.call('search_airports', { query: 'Makkah' });
    expect(r.text).toMatch(/Jeddah \(JED\) is the usual gateway/);
    expect((r.structuredContent as { results: { iata: string }[] }).results[0]?.iata).toBe('JED');
    expect((await h.call('search_airports', { query: 'Madinah', limit: 1 })).text).toContain('MED');
  });

  it('ignores accents and case', async () => {
    expect((await h.call('search_airports', { query: 'zürich', limit: 1 })).text).toContain('ZRH');
  });

  it('returns a helpful message when nothing matches', async () => {
    const r = await h.call('search_airports', { query: 'Atlantis Undersea' });
    expect(r.isError).toBeFalsy();
    expect(r.text).toMatch(/No airports matched/);
  });

  it('validates input', async () => {
    const r = await h.call('search_airports', { query: 'a' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/at least 2 characters/);
  });

  it('never calls the network', async () => {
    await h.call('search_airports', { query: 'Dubai' });
    expect(h.fetch.calls).toHaveLength(0);
  });
});
