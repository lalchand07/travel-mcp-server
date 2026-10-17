# travel-mcp-server

**Ask your AI assistant real travel questions, like "What's the cheapest flight from Lahore to London on 15 December?", and get answers from live flight data, using your own API key.**

[![CI](https://github.com/lalchand07/travel-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/lalchand07/travel-mcp-server/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-server-travel.svg)](https://www.npmjs.com/package/mcp-server-travel)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-stdio%20%7C%20Streamable%20HTTP-6f42c1.svg)](https://modelcontextprotocol.io)

<!-- Demo GIF: record with docs/DEMO.md, then replace this comment with:
![Demo: asking Claude for the cheapest Lahore to London flight](docs/demo.gif) -->

> 🎬 _Demo GIF coming soon. See [docs/DEMO.md](docs/DEMO.md) to record one._

`travel-mcp-server` is a [Model Context Protocol](https://modelcontextprotocol.io) server. It gives Claude Desktop, Claude Code, Cursor, Gemini CLI, ChatGPT and other MCP clients tools for:

- ✈️ **Flight prices**: one-way and round-trip fares from 700+ airlines and agents (via [FlightAPI](https://www.flightapi.io/)).
- 🛰️ **Flight status**: is EK623 on time? Which gate?
- 🛫 **Airport boards**: upcoming departures and arrivals at any airport.
- 🔎 **Airport search**: "Lahore" → `LHE`, "Makkah" → `JED`. Works offline and needs no key.
- 💱 **Currency conversion**: European Central Bank reference rates. Free, no key.

It is built to **protect your API credits**: it caches responses, enforces per-minute and per-day limits, and shows usage on request.

---

## Contents

- [Quick start (5 minutes)](#quick-start-5-minutes)
  - [Claude Desktop](#claude-desktop) · [Claude Code](#claude-code) · [Cursor](#cursor) · [Gemini CLI](#gemini-cli) · [ChatGPT (HTTP mode)](#chatgpt-http-mode)
- [Example conversations](#example-conversations)
- [Tools](#tools) · [Prompts](#prompts)
- [Configuration](#configuration)
- [How your credits are protected](#how-your-credits-are-protected)
- [Running remotely (HTTP mode, Docker, HTTPS)](#running-remotely-http-mode-docker-https)
- [Troubleshooting](#troubleshooting)
- [Data sources and licenses](#data-sources-and-licenses)
- [Development](#development) · [Roadmap](#roadmap) · [Built by](#built-by)

---

## Quick start (5 minutes)

**1. Get a FlightAPI key** (about 1 minute). Sign up at [flightapi.io](https://api.flightapi.io/register) and copy your key from the dashboard. The free plan includes 100 requests per 30 days. A price search costs 2 credits.

> No key yet? You can still install the server. `search_airports` and `convert_currency` work without one, and the flight tools explain how to add a key.

**2. Add the server to your AI app** (about 2 minutes). Pick your client below. You need [Node.js 20+](https://nodejs.org) for `npx`.

**3. Ask.** Restart your app and try:

> What's the cheapest flight from Lahore to London on 15 December?

### Claude Desktop

Open **Settings → Developer → Edit Config**. This opens `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`). Add:

```json
{
  "mcpServers": {
    "travel": {
      "command": "npx",
      "args": ["-y", "mcp-server-travel"],
      "env": {
        "FLIGHTAPI_KEY": "your_flightapi_key"
      }
    }
  }
}
```

Fully quit and reopen Claude Desktop. The tools appear under the 🔧 / "Search and tools" menu.

### Claude Code

```bash
claude mcp add --transport stdio --scope user --env FLIGHTAPI_KEY=your_flightapi_key travel -- npx -y mcp-server-travel
```

Check it with `claude mcp list`, or `/mcp` inside a session. Drop `--scope user` to add it to the current project only.

### Cursor

Create or edit `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "travel": {
      "command": "npx",
      "args": ["-y", "mcp-server-travel"],
      "env": {
        "FLIGHTAPI_KEY": "your_flightapi_key"
      }
    }
  }
}
```

Then open **Cursor Settings → MCP** and make sure `travel` is enabled. Ask your question in Agent mode.

### Gemini CLI

Add to `~/.gemini/settings.json` (all projects) or `.gemini/settings.json` (one project):

```json
{
  "mcpServers": {
    "travel": {
      "command": "npx",
      "args": ["-y", "mcp-server-travel"],
      "env": {
        "FLIGHTAPI_KEY": "$FLIGHTAPI_KEY"
      }
    }
  }
}
```

Gemini CLI expands `$FLIGHTAPI_KEY` from your shell environment, so the key stays out of the file. Run `/mcp` in Gemini CLI to check the server is connected.

### ChatGPT (HTTP mode)

ChatGPT connects to **remote** MCP servers over HTTPS. That needs the Streamable HTTP transport and a public URL.

ChatGPT's connector settings offer OAuth or "No authentication", not a custom bearer header. So for ChatGPT, enable the **secret-path token**: the URL itself acts as the password.

```bash
# 1. Start the server in HTTP mode (keep this terminal open)
export FLIGHTAPI_KEY=your_flightapi_key
export MCP_HTTP_TOKEN=$(openssl rand -hex 32)
export MCP_HTTP_ALLOW_PATH_TOKEN=true
echo "Your token: $MCP_HTTP_TOKEN"
npx -y mcp-server-travel --http

# 2. In another terminal, give it a public HTTPS URL, e.g. with Cloudflare Tunnel:
cloudflared tunnel --url http://localhost:3000
#    -> https://random-words.trycloudflare.com
```

Restart step 1 with `MCP_HTTP_ALLOWED_HOSTS=random-words.trycloudflare.com` so the server accepts that hostname. This is DNS rebinding protection: requests with any other `Host` header get a 403.

Then, in ChatGPT, turn on **Developer mode** and create a connector (app) with:

- **MCP server URL:** `https://random-words.trycloudflare.com/mcp/<your token>`
- **Authentication:** No authentication. The secret path is the credential.

OpenAI moves these settings around from time to time. See OpenAI's [Developer mode guide](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta) for the current menu location and which plans support it.

> Any client that **can** send headers should use `Authorization: Bearer <token>` against `https://your-host/mcp` instead. For a permanent setup, see [Running remotely](#running-remotely-http-mode-docker-https).

---

## Example conversations

These show real questions and the shape of what the tools return to the model. The airport results are real output. Flight prices, times and exchange rates are **illustrative**: they show the exact output format, but live values depend on the day you ask.

### "What's the cheapest flight from Lahore to London on 15 December?"

The model first resolves both cities (offline, no credits):

```text
search_airports {"query": "Lahore"}
LHE/OPLA - Allama Iqbal International Airport, Lahore, Pakistan (large airport)

search_airports {"query": "London"}
LHR/EGLL - London Heathrow Airport, London, United Kingdom (large airport)
LGW/EGKK - London Gatwick Airport, London, United Kingdom (large airport)
LCY/EGLC - London City Airport, London, United Kingdom (medium airport)
...
```

Then it searches prices (2 credits; cached for 30 minutes):

```text
search_flight_prices {"origin": "LHE", "destination": "LHR", "departure_date": "2026-12-15", "currency": "GBP"}

One-way LHE -> LHR, 2026-12-15, 1 adult, economy
Showing 5 cheapest of 87 priced itineraries.

1. 412.30 GBP - Qatar Airways
   Out: LHE 2026-12-15 04:10 -> LHR 2026-12-15 13:05 | 13h 55m | 1 stop via DOH | Qatar Airways [QR629, QR3]
   Sold by: Qatar Airways, Mytrip
2. 455.80 GBP - Pakistan International Airlines
   Out: LHE 2026-12-15 10:00 -> LHR 2026-12-15 14:40 | 9h 40m | non-stop | Pakistan International Airlines [PK757]
...
Note: prices are indicative, collected from airlines and travel agents by FlightAPI, and normally cover all passengers in the search. They change quickly and may exclude baggage or payment fees. Times are local to each airport. This tool cannot book; confirm and book on the airline or agent website.
```

The assistant then answers in plain language, for example: _"The cheapest option is about £412 with Qatar Airways via Doha (13h 55m). PIA's non-stop is about £456 and saves over 4 hours…"_

### "Is EK623 on time today?"

```text
get_flight_status {"flight_number": "EK623", "date": "2026-10-17"}

Flight EK623 on 2026-10-17: In the air (1 hr 12 min remaining)
Departure: Dubai (DXB), terminal 3
  scheduled 09:45, Oct 17, took off 10:02, Oct 17
Arrival: Allama Iqbal Intl (LHE)
  scheduled 13:50, Oct 17, estimated 14:01, Oct 17
Times are local to each airport. Gates can change; check airport screens before travelling.
```

### "What's leaving Doha in the next few hours?"

```text
get_airport_schedule {"airport_code": "DOH", "type": "departures", "limit": 3}

Departures at Doha Hamad International Airport (DOH), times in Asia/Qatar

13:40  QR8221  to Frankfurt (FRA) - Qatar Airways - Scheduled
15:30  QR8860  to London (LHR) - Qatar Airways - Scheduled - gate C12
...
```

### "Umrah in February: what are my options from Karachi?"

Use the built-in **`umrah_flight_options`** prompt (in Claude Desktop: the ➕ / prompts menu). It resolves Karachi, searches both **Jeddah (JED)** and **Madinah (MED)** on a couple of dates, and compares them in a table. It keeps the number of searches small to save credits.

### "How much is 450 GBP in US dollars?"

```text
convert_currency {"amount": 450, "from": "GBP", "to": "USD"}
450 GBP = 607.93 USD (1 GBP = 1.350961 USD, ECB reference rate of 2026-10-16). Indicative only; card and bank rates differ.
```

### "How many API calls have we used?"

```text
get_usage {}
Usage since 2026-10-17T09:12:03.000Z (this server process):
FlightAPI key configured: yes
FlightAPI: 3 calls (~5 credits), 2 served from cache, 0 errors
Exchange rates: 1 call(s), 3 from cache
Safety limits: 9 of 10 left this minute, 97 of 100 left in the last 24h
Note: counters reset when the server restarts. Your FlightAPI dashboard shows your account-wide balance.
```

---

## Tools

| Tool                   | What it does                                                                                                                        | Key inputs                                                                                                                                                                                                       | Credits               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `search_airports`      | Find airports by city, name, country or IATA/ICAO code. Understands aliases like Makkah, Madinah, Bombay. Main airports rank first. | `query`, `limit` (1-20)                                                                                                                                                                                          | **0** (offline)       |
| `search_flight_prices` | Cheapest one-way or round-trip options: price, airlines, stops, duration, local departure/arrival times, sellers.                   | `origin`, `destination` (IATA), `departure_date`, `return_date?`, `adults` (1-9), `children?`, `infants?`, `cabin_class?` (`economy` \| `premium_economy` \| `business` \| `first`), `currency?`, `max_results?` | 2 per uncached search |
| `get_flight_status`    | Live status of one flight: scheduled/estimated/actual times, terminals, gates, baggage belt.                                        | `flight_number` (e.g. `PK757`), `date` (±7 days), `departure_airport?`                                                                                                                                           | 1 per uncached call   |
| `get_airport_schedule` | Upcoming departures or arrivals: flight, airline, destination/origin, times, status, terminal, gate.                                | `airport_code`, `type` (`departures` \| `arrivals`), `day?` (`today` \| `tomorrow`), `limit?`                                                                                                                    | 2 per uncached call   |
| `convert_currency`     | Convert using ECB reference rates (about 30 major currencies).                                                                      | `amount`, `from`, `to`                                                                                                                                                                                           | 0 (free API)          |
| `get_usage`            | Calls made, cache hits, estimated credits used, remaining safety limits.                                                            | none                                                                                                                                                                                                             | 0                     |

All inputs are validated with strict schemas before any API call:

- IATA codes must be 3 letters and exist in the bundled airport list.
- Dates must be real calendar dates, and not in the past.
- Infants cannot outnumber adults, and seated passengers are capped at 9.
- Unknown parameters are rejected.

Errors come back as short, friendly messages with a hint (for example `[RATE_LIMITED] … Wait about 40 seconds…`), never as stack traces.

## Prompts

| Prompt                 | Arguments                                                                                             | What it does                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `plan_trip`            | `origin`, `destination`, `departure_date`, `return_date?`, `travellers?`, `currency?`, `preferences?` | Searches airports, then prices, then summarizes the 3 best options (cheapest / fastest / best balance). |
| `umrah_flight_options` | `origin_city`, `month`, `adults?`, `currency?`, `trip_length_days?`                                   | Compares flights to Jeddah (JED) and Madinah (MED) on two dates in the month, with a recommendation.    |

---

## Configuration

All settings are environment variables. See [`.env.example`](.env.example) for a commented template. In desktop apps, put them in the server's `"env"` block.

| Variable                    | Default     | Description                                                                                      |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `FLIGHTAPI_KEY`             | none        | Your [FlightAPI](https://www.flightapi.io/) key. Needed for prices, status and schedules.        |
| `DEFAULT_CURRENCY`          | `USD`       | Currency for prices when the user doesn't specify one.                                           |
| `FLIGHTAPI_MAX_PER_MINUTE`  | `10`        | Max FlightAPI requests per rolling minute (`0` = unlimited).                                     |
| `FLIGHTAPI_MAX_PER_DAY`     | `100`       | Max FlightAPI requests per rolling 24 h (`0` = unlimited).                                       |
| `CACHE_TTL_PRICES_MIN`      | `30`        | Price search cache lifetime (minutes).                                                           |
| `CACHE_TTL_STATUS_MIN`      | `2`         | Flight status / airport board cache lifetime (minutes).                                          |
| `CACHE_TTL_FX_HOURS`        | `12`        | Exchange-rate cache lifetime (hours).                                                            |
| `ENABLE_FILE_CACHE`         | `false`     | Persist the cache to `~/.cache/mcp-server-travel/cache.json` so restarts don't re-spend credits. |
| `CACHE_FILE`                | none        | Custom cache file path (implies file cache).                                                     |
| `REQUEST_TIMEOUT_MS`        | `10000`     | Upstream timeout per attempt.                                                                    |
| `MCP_TRANSPORT`             | `stdio`     | `stdio` or `http`. CLI flags `--http` / `--stdio` override it.                                   |
| `MCP_HTTP_HOST`             | `127.0.0.1` | HTTP bind address (`--host`).                                                                    |
| `MCP_HTTP_PORT`             | `3000`      | HTTP port (`--port`).                                                                            |
| `MCP_HTTP_TOKEN`            | none        | **Required in HTTP mode.** Bearer token, 16+ characters.                                         |
| `MCP_HTTP_ALLOW_PATH_TOKEN` | `false`     | Also accept `POST /mcp/<token>`, for clients that can't send headers (ChatGPT). HTTPS only.      |
| `MCP_HTTP_ALLOWED_HOSTS`    | none        | Comma-separated public hostnames allowed in the `Host` header (DNS rebinding protection).        |
| `LOG_LEVEL`                 | `info`      | `debug`, `info`, `warn`, `error` or `silent`. Logs go to stderr.                                 |

CLI: `npx -y mcp-server-travel [--http] [--port 3000] [--host 127.0.0.1] [--version] [--help]`

---

## How your credits are protected

FlightAPI charges per request, and AI models sometimes call tools more often than needed. The server stands between the model and your wallet:

1. **Validation first.** Malformed codes, past dates, impossible passenger mixes and unknown airports are rejected locally, so they never cost a credit.
2. **Caching.** Identical price searches are answered from cache for **30 minutes**, flight status and airport boards for **2 minutes**, and exchange rates for **12 hours**. Requests are normalized (`lhe` = `LHE`), so trivial differences still hit the cache. If two identical calls arrive at the same time, they share one upstream request. Enable `ENABLE_FILE_CACHE=true` to keep the cache across restarts.
3. **Limits.** At most `FLIGHTAPI_MAX_PER_MINUTE` (default 10) and `FLIGHTAPI_MAX_PER_DAY` (default 100) real FlightAPI calls. Cache hits are free and still served when a limit is reached. The model gets a clear message such as _"Per-minute safety limit reached… Wait about 40 seconds"_ and can tell you.
4. **Conservative retries.** Each request times out after 10 s. Network errors and timeouts are retried **once** with backoff. HTTP errors (4xx **and** 5xx) are **never** retried, because a retry could be billed again.
5. **Bounded queries.** Airport boards always request a single day. Without that, FlightAPI returns 10 days and charges accordingly.
6. **Visibility.** `get_usage` reports calls per endpoint, cache hits and estimated credits (from FlightAPI's [published costs](https://www.flightapi.io/documentation/getting-started/)). Your FlightAPI dashboard remains the source of truth for your balance.

---

## Running remotely (HTTP mode, Docker, HTTPS)

HTTP mode serves **stateless Streamable HTTP** at `POST /mcp`. Cache, limits and usage are shared across all requests. There is also a `GET /healthz` health check.

```bash
FLIGHTAPI_KEY=... MCP_HTTP_TOKEN=$(openssl rand -hex 32) npx -y mcp-server-travel --http
# -> http://127.0.0.1:3000/mcp

curl -s http://127.0.0.1:3000/mcp \
  -H "Authorization: Bearer $MCP_HTTP_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_airports","arguments":{"query":"Dubai"}}}'
```

Clients that support remote servers with headers connect to `https://your-host/mcp` with `Authorization: Bearer <token>`. For example, Claude Code:

```bash
claude mcp add --transport http travel https://your-host/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

### Docker

```bash
docker build -t travel-mcp-server .
docker run -d --name travel-mcp -p 127.0.0.1:3000:3000 \
  -e FLIGHTAPI_KEY=your_flightapi_key \
  -e MCP_HTTP_TOKEN=$(openssl rand -hex 32) \
  -e MCP_HTTP_ALLOWED_HOSTS=travel.example.com \
  travel-mcp-server
```

The image runs as a non-root user, listens on `0.0.0.0:3000` inside the container, and includes a health check.

### HTTPS (required for anything beyond localhost)

The server itself speaks plain HTTP and binds to `127.0.0.1` by default. **Do not expose it directly to the internet.** Put a TLS-terminating proxy in front:

- **Caddy** (automatic certificates):

  ```caddyfile
  travel.example.com {
      reverse_proxy 127.0.0.1:3000
  }
  ```

- **nginx:** `proxy_pass http://127.0.0.1:3000;` inside a `server { listen 443 ssl; ... }` block. Set `proxy_buffering off;` so streamed responses flush.
- **Cloudflare Tunnel:** `cloudflared tunnel --url http://localhost:3000` (quick tests) or a named tunnel (permanent).

Then set `MCP_HTTP_ALLOWED_HOSTS=travel.example.com`. Use a long random token, keep `FLIGHTAPI_MAX_PER_DAY` set so a leaked token cannot drain your credits, and see [SECURITY.md](SECURITY.md).

---

## Troubleshooting

| Symptom                                                           | Fix                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tools don't appear in Claude Desktop                              | Fully quit the app (not just close the window) and reopen. Check the JSON is valid. Logs: macOS `~/Library/Logs/Claude/mcp-server-travel.log`, Windows `%APPDATA%\Claude\logs\`.                                                            |
| `spawn npx ENOENT` / server won't start                           | The app can't find Node. Install Node 20+, or use the absolute path to `npx` (run `which npx`, or `where npx` on Windows) as `"command"`. On Windows you can also use `"command": "cmd", "args": ["/c", "npx", "-y", "mcp-server-travel"]`. |
| `[MISSING_API_KEY]`                                               | `FLIGHTAPI_KEY` isn't reaching the server. Put it in the `"env"` block of the client config (not just your shell), then restart the client.                                                                                                 |
| `[UPSTREAM_AUTH]`, or `[UPSTREAM_NOT_FOUND]` on every search      | The key is wrong or inactive. Copy it again from the [FlightAPI dashboard](https://api.flightapi.io/).                                                                                                                                      |
| `[UPSTREAM_QUOTA]` (HTTP 429)                                     | Your FlightAPI plan limit is used up (free plan: 100 requests / 30 days). Wait for the reset or upgrade.                                                                                                                                    |
| `[RATE_LIMITED]`                                                  | This server's own safety limit. Wait, or raise `FLIGHTAPI_MAX_PER_MINUTE` / `FLIGHTAPI_MAX_PER_DAY`.                                                                                                                                        |
| "No priced itineraries were returned"                             | FlightAPI sometimes needs a second request to fill in results. Try again in a few minutes (empty results are cached for only 2 min), or try a nearby date.                                                                                  |
| `Unknown airport code XYZ`                                        | Use `search_airports` first. Codes are checked against the bundled list to avoid wasting credits on typos.                                                                                                                                  |
| `PKR is not covered by the European Central Bank reference rates` | ECB publishes about 30 currencies. Ask `search_flight_prices` for prices directly in your currency (`currency: "PKR"`) instead.                                                                                                             |
| HTTP mode: `401 Unauthorized`                                     | Send `Authorization: Bearer <MCP_HTTP_TOKEN>`.                                                                                                                                                                                              |
| HTTP mode: `403 Invalid Host`                                     | Add your public hostname to `MCP_HTTP_ALLOWED_HOSTS`.                                                                                                                                                                                       |
| Want to see what's happening                                      | Set `LOG_LEVEL=debug`. Logs go to stderr with secrets redacted. Or run `npm run inspect` to use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector).                                                                     |

---

## Data sources and licenses

| Data                                                             | Source                                                                                                                                  | License                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Flight prices, status, airport schedules                         | [FlightAPI.io](https://www.flightapi.io/) with **your** API key, under FlightAPI's [terms](https://www.flightapi.io/terms-and-privacy/) | Commercial API                                             |
| Airports (`data/airports.json`, ~5,300 airports with IATA codes) | [OurAirports](https://ourairports.com/data/) via [ourairports-data](https://github.com/davidmegginson/ourairports-data)                 | Public domain                                              |
| Airline names (`data/airlines.json`)                             | [OpenFlights](https://openflights.org/data.php) airline database                                                                        | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |
| Exchange rates                                                   | [Frankfurter](https://frankfurter.dev/) (European Central Bank reference rates)                                                         | Free, keyless API                                          |

Regenerate the bundled datasets with `npm run data:build` (see [`scripts/build-datasets.ts`](scripts/build-datasets.ts)). How the FlightAPI endpoints are used, and where the FlightAPI docs leave gaps, is documented in [docs/FLIGHTAPI.md](docs/FLIGHTAPI.md).

This project is not affiliated with FlightAPI, OurAirports, OpenFlights, Frankfurter or the ECB. Prices are indicative; always confirm with the airline or agent before booking.

---

## Development

```bash
git clone https://github.com/lalchand07/travel-mcp-server.git && cd travel-mcp-server
npm install
npm test            # 130+ tests, no network or API key needed
npm run dev         # run from source (stdio)
npm run build && npm run inspect   # MCP Inspector UI
```

Project layout: `src/tools/` (one file per tool), `src/providers/` (FlightAPI, Frankfurter, airport and airline data), `src/summarize/` (compact, model-friendly output), `src/lib/` (cache, limiter, HTTP client, validation). See [PLAN.md](PLAN.md) for the design and [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Roadmap

- 🏨 **Hotels**: search and price comparison through a hotel provider.
- 🛂 **Visa requirements**: entry rules by passport and destination.
- 🔌 **More flight providers**: pluggable providers (e.g. Amadeus, Duffel, Kiwi) so you can use the key you already have.
- 📅 **Flexible dates**: cheapest day in a month, with a strict credit budget.
- 🔐 **OAuth for HTTP mode**: first-class ChatGPT and remote client auth instead of the secret path.
- 🌍 **More currencies**: an optional provider for currencies the ECB doesn't publish (PKR, AED, SAR, ...).

Ideas and pull requests are welcome. Open an [issue](https://github.com/lalchand07/travel-mcp-server/issues/new/choose).

## Built by

**[Your Name]**, [Your Company]. [Contact / website link]

<!-- Replace the line above, e.g.:
**Jane Doe**, Example Travel Ltd. [jane@example.com](mailto:jane@example.com) · [example.com](https://example.com)
-->

If this project saves you time, a ⭐ on GitHub helps others find it.

## License

[MIT](LICENSE). Bundled data has its own licenses; see [Data sources and licenses](#data-sources-and-licenses).
