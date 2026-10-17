import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './helpers.js';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(async () => {
  await h.close();
});

describe('server', () => {
  it('exposes the six tools with descriptions, strict schemas and read-only annotations', async () => {
    const { tools } = await h.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'convert_currency',
      'get_airport_schedule',
      'get_flight_status',
      'get_usage',
      'search_airports',
      'search_flight_prices',
    ]);
    for (const t of tools) {
      expect(t.description?.length).toBeGreaterThan(60);
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(t.annotations?.readOnlyHint).toBe(true);
    }
    const prices = tools.find((t) => t.name === 'search_flight_prices');
    expect(prices?.inputSchema.required).toEqual(['origin', 'destination', 'departure_date']);
  });

  it('identifies itself and sends usage instructions', () => {
    expect(h.client.getServerVersion()?.name).toBe('travel-mcp-server');
    expect(h.client.getInstructions()).toMatch(/search_airports/);
  });
});
