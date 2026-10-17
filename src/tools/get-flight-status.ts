import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { ToolError } from '../lib/errors.js';
import { flightNumber, iataAirport, nearDate } from '../lib/validation.js';
import { formatStatus, summarizeStatus } from '../summarize/status.js';
import { ok, safe } from './result.js';

export function registerGetFlightStatus(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    'get_flight_status',
    {
      title: 'Get flight status',
      description:
        'Live status of a specific flight by flight number and date: scheduled/estimated/actual times, terminals, gates, ' +
        'baggage belt and whether it has departed or landed. Example: flight_number "EK623", date "2026-12-15". ' +
        'Uses the FlightAPI key (1 credit per uncached call); results are cached for 2 minutes.',
      inputSchema: z.strictObject({
        flight_number: flightNumber.describe('Airline code + number, e.g. PK757, EK 623, BA107.'),
        date: nearDate({ pastDays: 7, futureDays: 7, now: ctx.now }).describe(
          'Flight date (local departure date), YYYY-MM-DD, within 7 days of today.',
        ),
        departure_airport: iataAirport
          .optional()
          .describe(
            'Optional departure airport IATA code; only needed if the same flight number departs from several airports that day.',
          ),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    safe('get_flight_status', async ({ flight_number, date, departure_airport }) => {
      const { data, cached } = await ctx.flightApi.trackFlight({
        airline: flight_number.airline,
        number: flight_number.number,
        date,
        departureAirport: departure_airport,
      });
      if (!Array.isArray(data) || data.length === 0) {
        throw new ToolError(
          'UPSTREAM_NOT_FOUND',
          `No tracking data for ${flight_number.full} on ${date}.`,
          'Check the flight number and date.',
        );
      }
      const summary = summarizeStatus(data, flight_number.full, date);
      return ok(formatStatus(summary, cached), { ...summary, cached });
    }),
  );
}
