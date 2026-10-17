# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-17

### Added

- MCP tools: `search_airports`, `search_flight_prices` (one-way and round trip), `get_flight_status`,
  `get_airport_schedule`, `convert_currency`, `get_usage`.
- MCP prompts: `plan_trip`, `umrah_flight_options`.
- FlightAPI.io integration (bring your own key), Frankfurter/ECB currency rates (keyless).
- Bundled airport (OurAirports) and airline (OpenFlights) datasets, with a regeneration script.
- Credit protection: response caching (30 min prices, 2 min status, 12 h FX), per-minute and per-day
  request limits, usage tracking, 10 s timeouts, one retry on network errors only.
- Transports: stdio (default) and stateless Streamable HTTP with bearer-token auth, localhost
  binding and DNS rebinding protection.
- Dockerfile for HTTP mode, CI on Node 20 and 22.

[Unreleased]: https://github.com/lalchand07/travel-mcp-server/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lalchand07/travel-mcp-server/releases/tag/v0.1.0
