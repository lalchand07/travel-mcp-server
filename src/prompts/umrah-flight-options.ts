import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function umrahText(a: {
  origin_city: string;
  month: string;
  adults?: string | undefined;
  currency?: string | undefined;
  trip_length_days?: string | undefined;
}): string {
  return [
    `I am planning Umrah. Find flight options from ${a.origin_city} to Saudi Arabia in ${a.month} for ${a.adults ?? '1'} adult(s), prices in ${a.currency ?? 'my local currency (ask me if unsure)'}.`,
    a.trip_length_days
      ? `I plan to stay about ${a.trip_length_days} days, so search round trips of that length.`
      : 'Search one-way fares unless I give a trip length.',
    '',
    'Please follow these steps with the travel tools:',
    `1. Call search_airports for "${a.origin_city}" to get the departure airport code (if there are several, use the main international airport).`,
    '2. The two gateways for Umrah are Jeddah (JED, closest to Makkah) and Madinah (MED). Search both.',
    `3. Pick 2 representative dates in ${a.month} (for example around the 5th and the 20th, skipping dates already in the past) and call search_flight_prices for each date to JED and to MED. That is about 4 searches; each costs FlightAPI credits, so do not run more unless I ask. Call get_usage if you are unsure about the remaining budget.`,
    '4. Compare the results in one table: date, gateway (JED/MED), price, airline, stops, duration. Recommend the best value option and mention the trade-off of arriving in Jeddah vs Madinah (many pilgrims fly into one and out of the other).',
    '5. Remind me that prices are indicative, booking happens elsewhere, and that Umrah visa and package requirements should be checked with an authorised provider.',
  ].join('\n');
}

export function registerUmrahFlightOptions(server: McpServer): void {
  server.registerPrompt(
    'umrah_flight_options',
    {
      title: 'Umrah flight options',
      description: 'Compare flights to Jeddah (JED) and Madinah (MED) from your city for a given month.',
      argsSchema: {
        origin_city: z.string().describe('Your departure city, e.g. "Lahore" or "Birmingham".'),
        month: z.string().describe('Travel month, e.g. "December 2026" or "2026-12".'),
        adults: z.string().optional().describe('Number of adults. Default 1.'),
        currency: z.string().optional().describe('Currency for prices, e.g. PKR or GBP.'),
        trip_length_days: z
          .string()
          .optional()
          .describe('Optional length of stay in days, for round-trip searches.'),
      },
    },
    (args) => ({
      messages: [{ role: 'user', content: { type: 'text', text: umrahText(args) } }],
    }),
  );
}
