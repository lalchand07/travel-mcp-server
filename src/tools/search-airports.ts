import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { ok, safe } from './result.js';

export function registerSearchAirports(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    'search_airports',
    {
      title: 'Search airports',
      description:
        'Find airports by city, airport name, country, or IATA/ICAO code (e.g. "Lahore", "Heathrow", "JED", "OPLA"). ' +
        'Use this first to turn a city name into the 3-letter IATA codes required by search_flight_prices, ' +
        'get_flight_status and get_airport_schedule. Works offline from a bundled OurAirports dataset and uses no API credits. ' +
        'Larger airports are ranked first.',
      inputSchema: z.strictObject({
        query: z
          .string()
          .trim()
          .min(2, 'Query must be at least 2 characters.')
          .max(64)
          .describe('City, airport name, country, or IATA/ICAO code. Examples: "London", "Madinah", "LHE".'),
        limit: z.number().int().min(1).max(20).default(8).describe('Maximum results (1-20, default 8).'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    safe('search_airports', ({ query, limit }) => {
      const results = ctx.airports.search(query, limit);
      const note = ctx.airports.aliasNote(query);
      if (results.length === 0) {
        return ok(
          `No airports matched "${query}". Try the city name in English, the airport name, or a 3-letter IATA code.`,
          {
            query,
            results: [],
          },
        );
      }
      const lines = results.map(
        ({ airport: a }) =>
          `${a.iata}${a.icao ? `/${a.icao}` : ''} - ${a.name}, ${a.city || '?'}, ${a.country} (${a.size} airport)`,
      );
      return ok([...(note ? [note] : []), ...lines].join('\n'), {
        query,
        ...(note ? { note } : {}),
        results: results.map(({ airport, matchedBy }) => ({ ...airport, matchedBy })),
      });
    }),
  );
}
