# Implementation plan

A short design document for `travel-mcp-server` (npm package: `mcp-server-travel`).

## Goals

- Discover the repo, then ask "What's the cheapest flight from Lahore to London on 15 December?" in an AI app in under 5 minutes.
- Bring your own key (FlightAPI). Protect the user's credits through caching, limits and usage visibility.
- Small surface area. Correct, well-tested and well-documented.

## Stack

- TypeScript (strict, ESM), Node.js >= 20.
- `@modelcontextprotocol/sdk` 1.x (`McpServer`, `StdioServerTransport`, `StreamableHTTPServerTransport`, `createMcpExpressApp`).
- `zod` for input validation (the SDK peer dependency).
- `vitest` for tests, `eslint` (typescript-eslint) + `prettier` for linting and formatting.
- No database. An in-memory TTL cache with an optional JSON file cache.

## Layout

```
src/
  index.ts              CLI entry point (bin): parses flags and starts stdio or HTTP
  config.ts             Parses env vars and CLI flags into a typed Config (zod)
  context.ts            AppContext: config + cache + limiter + usage + providers (shared across sessions)
  server.ts             createMcpServer(ctx): registers tools and prompts
  http.ts               Streamable HTTP app: bearer auth, localhost binding, /healthz
  lib/
    cache.ts            TtlCache (memory, optional file persistence)
    rate-limiter.ts     Per-minute and per-day limits for outbound paid calls
    usage.ts            Per-provider call counters (calls, cache hits, errors)
    http-client.ts      fetchJson: 10 s timeout, 1 retry with backoff on network errors only
    errors.ts           ToolError (user-facing), mapping to MCP isError results
    redact.ts           Strips secrets from any string before logging or returning it
    validation.ts       Shared zod schemas: IATA codes, future dates, currencies, flight numbers
    logger.ts           stderr-only logger (stdout is reserved for stdio JSON-RPC)
  providers/
    airports.ts         Search over the bundled OurAirports dataset
    airlines.ts         Airline name lookup over the bundled OpenFlights dataset
    currency.ts         Frankfurter (ECB reference rates), cached for 12 h
    flightapi.ts        FlightAPI.io client (prices, tracking, airport schedules)
  tools/                One file per MCP tool
  prompts/              plan_trip, umrah_flight_options
data/
  airports.json         Generated compact dataset
  airlines.json         Generated compact dataset
scripts/
  build-datasets.ts     Regenerates data/*.json from OurAirports + OpenFlights
test/
  fixtures/             Recorded API responses
  *.test.ts
```

## Tools

| Tool                   | Input                                                                                                                                                                                                                                                                                                              | Notes                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `search_airports`      | `query` (string, 2–64 chars), `limit?` (1–20, default 8)                                                                                                                                                                                                                                                           | Offline. Matches IATA exactly first, then ICAO, then city, then name. Never uses credits.                                                |
| `search_flight_prices` | `origin`, `destination` (IATA, 3 letters), `departure_date` (YYYY-MM-DD, today or later), `return_date?` (>= departure), `adults` (1–9, default 1), `children?` (0–8), `infants?` (0–adults), `cabin_class?` (economy\|premium_economy\|business\|first), `currency?` (ISO 4217), `max_results?` (1–20, default 5) | One-way when `return_date` is absent. Returns the cheapest options sorted by price, plus an "indicative prices" note. Cached for 30 min. |
| `get_flight_status`    | `flight_number` (e.g. `EK623`, `PK 757`), `date` (YYYY-MM-DD; the allowed window follows the FlightAPI docs)                                                                                                                                                                                                       | Status, terminals, gates, scheduled/estimated/actual times. Cached for 2 min.                                                            |
| `get_airport_schedule` | `airport_code` (IATA), `type` (departures\|arrivals), `limit?`                                                                                                                                                                                                                                                     | Upcoming flights. Cached for 2 min.                                                                                                      |
| `convert_currency`     | `amount` (> 0), `from`, `to` (ISO 4217)                                                                                                                                                                                                                                                                            | ECB reference rates via Frankfurter. Cached for 12 h. Keyless.                                                                           |
| `get_usage`            | none                                                                                                                                                                                                                                                                                                               | Calls made this session per provider, cache hits, remaining minute/day budget.                                                           |

All inputs are strict zod schemas: no unknown keys, normalized to upper case, and no URLs or free-form endpoints anywhere.

## Prompts

- `plan_trip(origin_city, destination_city, departure_date, return_date?, travellers?, budget_currency?)`: tells the model to resolve both cities with `search_airports`, call `search_flight_prices`, optionally `convert_currency`, then summarize the 3 best options with trade-offs.
- `umrah_flight_options(origin_city, month, adults?, currency?)`: resolves the origin, searches JED and MED on several dates spread across the month, and compares them.

## Credit protection

- The cache key is the normalized request (provider + endpoint + sorted params). Prices are cached for 30 min, status and schedules for 2 min, and FX for 12 h.
- `RateLimiter` applies only to paid providers (FlightAPI). It uses a sliding one-minute window and a rolling 24 h window (in memory). Defaults are 10/min and 100/day, configurable via `FLIGHTAPI_MAX_PER_MINUTE` and `FLIGHTAPI_MAX_PER_DAY`. A cache hit never counts.
- When a limit is exceeded, the tool returns a friendly `isError` result that says when to retry and how to raise the limit.
- `get_usage` exposes the counters.
- HTTP requests use a 10 s timeout and 1 retry with exponential backoff (+ jitter) on network errors and timeouts only. 4xx responses are never retried. A 5xx is not retried either, because it may already have been billed.

## Security

- API keys come only from env vars. They are redacted from every log line, error message and tool output (`redact.ts`), and they are never echoed in `get_usage`.
- Only fixed provider base URLs are used. User input only fills validated path and query segments, which are `encodeURIComponent`-ed.
- HTTP mode requires `MCP_HTTP_TOKEN` (refuses to start without it, unless `MCP_HTTP_ALLOW_NO_AUTH=true` is set _and_ host is loopback). Tokens are compared in constant time. The default bind is `127.0.0.1`, with the SDK's DNS rebinding protection. The README documents running behind HTTPS (Caddy/nginx/Cloudflare Tunnel).
- Logs go to stderr only.

## Transports

- `stdio` (default): `npx -y mcp-server-travel`.
- `http`: `npx -y mcp-server-travel --http --port 3000`, or `MCP_TRANSPORT=http`. Stateless Streamable HTTP on `POST /mcp`. Cache, limiter and usage are process-wide, so they persist across requests.

## Testing

- `fetch` is injected into providers, so tests pass a fake that serves recorded fixtures. No network or API key is needed.
- One test file per tool, plus cache, rate limiter, http-client retry policy, validation, redaction, HTTP auth (supertest-style via a real ephemeral port) and an end-to-end MCP client test via `InMemoryTransport`.

## Packaging

- `bin: { "mcp-server-travel": "dist/index.js" }`, with `files: ["dist", "data"]`.
- Dockerfile (multi-stage, non-root, HTTP mode, `HOST=0.0.0.0` inside the container, token required).
- CI: lint, typecheck, test, build on Node 20 and 22.

## Status: FlightAPI endpoints

The FlightAPI endpoint shapes must come from the official documentation (https://docs.flightapi.io/). While building, that documentation could not be reached from the development environment. `providers/flightapi.ts` is implemented only from verified documentation. See the summary or TODO for current status.
