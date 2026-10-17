import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function planTripText(a: {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string | undefined;
  travellers?: string | undefined;
  currency?: string | undefined;
  preferences?: string | undefined;
}): string {
  return [
    `Help me plan a trip from ${a.origin} to ${a.destination}, departing ${a.departure_date}${a.return_date ? ` and returning ${a.return_date}` : ' (one-way)'}.`,
    `Travellers: ${a.travellers ?? '1 adult'}. Show prices in ${a.currency ?? 'my local currency (ask me if unsure)'}.${a.preferences ? ` Preferences: ${a.preferences}.` : ''}`,
    '',
    'Please work through these steps with the travel tools:',
    '1. Call search_airports for the origin and for the destination. If a city has several airports, pick the main international one, and mention the alternatives.',
    '2. Call search_flight_prices with the IATA codes, dates, passenger counts and currency. Each new search costs FlightAPI credits, so do not repeat identical searches and keep extra searches (other airports or dates) to two at most unless I ask.',
    '3. If I asked for a different currency than the prices came back in, use convert_currency.',
    '4. Summarize the 3 best options in a short table: price, airline(s), stops, total duration, departure and arrival times. Point out the cheapest, the fastest and the best balance, and any long layovers or overnight connections.',
    '5. Finish with a reminder that prices are indicative and booking happens on the airline or agent website.',
    'If a tool returns an error (missing API key, limit reached, no flights), explain it plainly and suggest the next step.',
  ].join('\n');
}

export function registerPlanTrip(server: McpServer): void {
  server.registerPrompt(
    'plan_trip',
    {
      title: 'Plan a trip',
      description: 'Find airports, search flight prices and summarize the best options for a trip.',
      argsSchema: {
        origin: z.string().describe('Where you are flying from (city or airport), e.g. "Lahore".'),
        destination: z.string().describe('Where you are going (city or airport), e.g. "London".'),
        departure_date: z.string().describe('Departure date, YYYY-MM-DD.'),
        return_date: z.string().optional().describe('Return date, YYYY-MM-DD (leave empty for one-way).'),
        travellers: z.string().optional().describe('e.g. "2 adults, 1 child". Default 1 adult.'),
        currency: z.string().optional().describe('Currency for prices, e.g. GBP.'),
        preferences: z.string().optional().describe('e.g. "non-stop only", "avoid overnight layovers".'),
      },
    },
    (args) => ({
      messages: [{ role: 'user', content: { type: 'text', text: planTripText(args) } }],
    }),
  );
}
