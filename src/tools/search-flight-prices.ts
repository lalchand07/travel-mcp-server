import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { ToolError } from '../lib/errors.js';
import { currencyCode, daysBetween, futureDate, iataAirport } from '../lib/validation.js';
import { formatPriceSummary, PRICE_NOTE, summarizePrices } from '../summarize/prices.js';
import { ok, safe } from './result.js';

export function registerSearchFlightPrices(server: McpServer, ctx: AppContext): void {
  const date = futureDate({ now: ctx.now });
  server.registerTool(
    'search_flight_prices',
    {
      title: 'Search flight prices',
      description:
        'Search live flight prices between two airports for a date (one-way), or with return_date (round trip). ' +
        'Returns the cheapest options with airline, total price, stops, duration and local departure/arrival times. ' +
        'Airports must be 3-letter IATA codes: call search_airports first if you only know the city. ' +
        'Uses the FlightAPI key (2 credits per uncached search); identical searches are cached for 30 minutes. ' +
        'Prices are indicative; booking happens on the airline or travel agent website.',
      inputSchema: z.strictObject({
        origin: iataAirport.describe('Departure airport IATA code, e.g. LHE.'),
        destination: iataAirport.describe('Arrival airport IATA code, e.g. LHR.'),
        departure_date: date.describe('Outbound date, YYYY-MM-DD (today or later).'),
        return_date: date.optional().describe('Return date for a round trip, YYYY-MM-DD. Omit for one-way.'),
        adults: z.number().int().min(1).max(9).default(1).describe('Adults (12+ years), 1-9. Default 1.'),
        children: z.number().int().min(0).max(8).default(0).describe('Children (2-11 years). Default 0.'),
        infants: z
          .number()
          .int()
          .min(0)
          .max(4)
          .default(0)
          .describe('Infants (under 2, on lap). Cannot exceed adults. Default 0.'),
        cabin_class: z
          .enum(['economy', 'premium_economy', 'business', 'first'])
          .default('economy')
          .describe('Cabin class. Default economy.'),
        currency: currencyCode
          .optional()
          .describe(
            `ISO 4217 currency for prices, e.g. USD, GBP, PKR, EUR. Default ${ctx.config.defaultCurrency}.`,
          ),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe('How many of the cheapest options to return (1-20, default 5).'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    safe('search_flight_prices', async (a) => {
      if (a.origin === a.destination)
        throw new ToolError('VALIDATION', 'Origin and destination must be different airports.');
      if (a.return_date && daysBetween(a.departure_date, a.return_date) < 0)
        throw new ToolError('VALIDATION', 'return_date must be on or after departure_date.');
      if (a.infants > a.adults)
        throw new ToolError(
          'VALIDATION',
          'Each infant must travel with an adult (infants cannot exceed adults).',
        );
      if (a.adults + a.children > 9)
        throw new ToolError('VALIDATION', 'At most 9 seated passengers (adults + children) per search.');
      for (const code of [a.origin, a.destination]) {
        if (!ctx.airports.getByIata(code))
          throw new ToolError(
            'VALIDATION',
            `Unknown airport code ${code}.`,
            'Use search_airports to find the right IATA code.',
          );
      }

      const currency = a.currency ?? ctx.config.defaultCurrency;
      const { data, cached } = await ctx.flightApi.searchPrices({
        origin: a.origin,
        destination: a.destination,
        departureDate: a.departure_date,
        returnDate: a.return_date,
        adults: a.adults,
        children: a.children,
        infants: a.infants,
        cabinClass: a.cabin_class,
        currency,
      });
      const { options, totalItineraries } = summarizePrices(data, {
        origin: a.origin,
        destination: a.destination,
        currency,
        maxResults: a.max_results,
        airlines: ctx.airlines,
      });

      const pax = [
        `${a.adults} adult${a.adults > 1 ? 's' : ''}`,
        a.children ? `${a.children} child${a.children > 1 ? 'ren' : ''}` : '',
        a.infants ? `${a.infants} infant${a.infants > 1 ? 's' : ''}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      const title = `${a.return_date ? 'Round trip' : 'One-way'} ${a.origin} -> ${a.destination}, ${a.departure_date}${a.return_date ? ` to ${a.return_date}` : ''}, ${pax}, ${a.cabin_class.replace('_', ' ')}`;

      return ok(formatPriceSummary(title, options, { cached, totalItineraries }), {
        search: {
          origin: a.origin,
          destination: a.destination,
          departure_date: a.departure_date,
          return_date: a.return_date ?? null,
          adults: a.adults,
          children: a.children,
          infants: a.infants,
          cabin_class: a.cabin_class,
          currency,
        },
        cached,
        totalItineraries,
        options,
        note: PRICE_NOTE,
      });
    }),
  );
}
