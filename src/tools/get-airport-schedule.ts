import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { ToolError } from '../lib/errors.js';
import { iataAirport } from '../lib/validation.js';
import { formatSchedule, summarizeSchedule } from '../summarize/schedule.js';
import { ok, safe } from './result.js';

export function registerGetAirportSchedule(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    'get_airport_schedule',
    {
      title: 'Get airport departures or arrivals',
      description:
        'Upcoming departures or arrivals at an airport (flight number, airline, destination/origin, scheduled and estimated ' +
        'local times, status, terminal and gate). Use type "departures" or "arrivals". ' +
        'Uses the FlightAPI key (2 credits per uncached call); results are cached for 2 minutes.',
      inputSchema: z.strictObject({
        airport_code: iataAirport.describe('Airport IATA code, e.g. DXB.'),
        type: z.enum(['departures', 'arrivals']).describe('Which board to show.'),
        day: z
          .enum(['today', 'tomorrow'])
          .default('today')
          .describe('Which day (airport local time). Default today.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(15)
          .describe('Maximum flights to return (1-50, default 15).'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    safe('get_airport_schedule', async ({ airport_code, type, day, limit }) => {
      if (!ctx.airports.getByIata(airport_code))
        throw new ToolError(
          'VALIDATION',
          `Unknown airport code ${airport_code}.`,
          'Use search_airports to find the right IATA code.',
        );
      const { data, cached } = await ctx.flightApi.airportSchedule({
        iata: airport_code,
        mode: type,
        day: day === 'today' ? 1 : 2,
      });
      const summary = summarizeSchedule(data, {
        iata: airport_code,
        type,
        limit,
        nowSec: day === 'today' ? Math.floor(ctx.now().getTime() / 1000) : 0,
      });
      return ok(formatSchedule(summary, cached), { ...summary, day, cached });
    }),
  );
}
