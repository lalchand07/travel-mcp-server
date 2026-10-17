import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './helpers.js';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(async () => {
  await h.close();
});

const text = (r: Awaited<ReturnType<Harness['client']['getPrompt']>>) => {
  const c = r.messages[0]?.content;
  return c?.type === 'text' ? c.text : '';
};

describe('prompts', () => {
  it('lists both prompts', async () => {
    const { prompts } = await h.client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['plan_trip', 'umrah_flight_options']);
  });

  it('plan_trip walks the model through airports -> prices -> summary', async () => {
    const r = await h.client.getPrompt({
      name: 'plan_trip',
      arguments: { origin: 'Lahore', destination: 'London', departure_date: '2026-12-15', currency: 'GBP' },
    });
    const t = text(r);
    expect(t).toContain('from Lahore to London, departing 2026-12-15 (one-way)');
    expect(t.indexOf('search_airports')).toBeLessThan(t.indexOf('search_flight_prices'));
    expect(t).toMatch(/3 best options/);
    expect(t).toMatch(/indicative/);
  });

  it('umrah_flight_options searches both JED and MED for the month', async () => {
    const r = await h.client.getPrompt({
      name: 'umrah_flight_options',
      arguments: { origin_city: 'Karachi', month: 'December 2026', adults: '2', trip_length_days: '14' },
    });
    const t = text(r);
    expect(t).toContain('from Karachi to Saudi Arabia in December 2026 for 2 adult(s)');
    expect(t).toMatch(/Jeddah \(JED.*Madinah \(MED\)/s);
    expect(t).toMatch(/round trips of that length/);
    expect(t).toMatch(/get_usage/);
  });
});
