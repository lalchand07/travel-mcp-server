# Contributing

Thanks for helping improve travel-mcp-server. Bug reports, docs fixes and new providers are all welcome.

## Development setup

```bash
git clone https://github.com/lalchand07/travel-mcp-server.git
cd travel-mcp-server
npm install
npm test          # no API key or network needed
npm run dev       # run from source over stdio (tsx)
npm run build && npm run inspect   # try it in the MCP Inspector
```

Requires Node.js 20 or newer.

## Before you open a pull request

```bash
npm run lint && npm run format:check && npm run typecheck && npm test
```

CI runs the same checks on Node 20 and 22.

## Guidelines

- **No network in tests.** Use `createHarness()` and `fakeFetch()` from `test/helpers.ts`, with fixtures in `test/fixtures/`.
  A test that reaches the internet is a bug.
- **Implement providers from their official documentation.** Link the docs page in the provider file, and record
  any gaps or contradictions in `docs/FLIGHTAPI.md` (or a new doc for a new provider). Never guess an endpoint.
- **Protect users' credits.** Paid calls must go through the shared cache and `RateLimiter`, and must not be retried on HTTP errors.
- **Never log or return secrets.** Use `log` (stderr, redacted), never `console.log`: stdout carries the stdio protocol.
- **Validate inputs with zod** using strict object schemas. Only fixed provider base URLs are allowed.
- **Keep tool output compact.** Models pay for every token: summarize, don't dump raw API responses.
- Add a line to `CHANGELOG.md` under _Unreleased_.

## Updating the bundled datasets

```bash
npm run data:build
```

This downloads the latest OurAirports and OpenFlights files and regenerates `data/*.json`. Include the
regenerated files in a separate commit.

## Releasing (maintainers)

1. Update `CHANGELOG.md` and bump the version with `npm version <patch|minor|major>`.
2. Push the tag and publish a GitHub release; the `Release` workflow publishes to npm with provenance
   (requires the `NPM_TOKEN` repository secret).

## Code of conduct

Be kind and assume good intent. Harassment of any kind is not tolerated.
