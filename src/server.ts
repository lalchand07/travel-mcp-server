import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from './context.js';
import { registerPlanTrip } from './prompts/plan-trip.js';
import { registerUmrahFlightOptions } from './prompts/umrah-flight-options.js';
import { registerConvertCurrency } from './tools/convert-currency.js';
import { registerGetAirportSchedule } from './tools/get-airport-schedule.js';
import { registerGetFlightStatus } from './tools/get-flight-status.js';
import { registerGetUsage } from './tools/get-usage.js';
import { registerSearchAirports } from './tools/search-airports.js';
import { registerSearchFlightPrices } from './tools/search-flight-prices.js';
import { VERSION } from './version.js';

export const SERVER_NAME = 'travel-mcp-server';

const INSTRUCTIONS = `Travel tools backed by real flight data.
- Resolve city names to IATA codes with search_airports before calling flight tools.
- search_flight_prices, get_flight_status and get_airport_schedule spend the user's FlightAPI credits: avoid duplicate or speculative calls. Identical calls are cached.
- Prices are indicative; this server cannot book.
- get_usage shows calls made and remaining safety limits.`;

/** Builds an MCP server instance. Stateful parts live in ctx so they can be shared across sessions. */
export function createMcpServer(ctx: AppContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION }, { instructions: INSTRUCTIONS });
  registerSearchAirports(server, ctx);
  registerSearchFlightPrices(server, ctx);
  registerGetFlightStatus(server, ctx);
  registerGetAirportSchedule(server, ctx);
  registerConvertCurrency(server, ctx);
  registerGetUsage(server, ctx);
  registerPlanTrip(server);
  registerUmrahFlightOptions(server);
  return server;
}
