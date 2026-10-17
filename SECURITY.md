# Security policy

## Supported versions

Security fixes are released for the latest minor version.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use
[GitHub private vulnerability reporting](https://github.com/lalchand07/travel-mcp-server/security/advisories/new)
or email the maintainer (see "Built by" in the README). You should get a reply within 5 working days.

## How this server handles secrets

- API keys are read only from environment variables. They are never written to logs, tool results,
  error messages or the cache file: every log line and tool output passes through a redaction filter.
- The server only calls fixed HTTPS endpoints (`api.flightapi.io`, `api.frankfurter.dev`). User input
  can only fill validated path or query segments; there is no way to make it fetch an arbitrary URL.
- In HTTP mode a bearer token (`MCP_HTTP_TOKEN`, minimum 16 characters) is required and compared in
  constant time. The server binds to `127.0.0.1` by default with Host-header (DNS rebinding) validation.
- The optional cache file is written with `0600` permissions.

## Running remotely

The HTTP server speaks plain HTTP. If you expose it beyond localhost:

- terminate TLS in front of it (Caddy, nginx, a cloud load balancer or Cloudflare Tunnel);
- use a long random token (`openssl rand -hex 32`) and rotate it if it leaks;
- keep `FLIGHTAPI_MAX_PER_DAY` set so a leaked token cannot drain your FlightAPI credits;
- only enable `MCP_HTTP_ALLOW_PATH_TOKEN` over HTTPS, and remember that URLs can end up in proxy logs.
