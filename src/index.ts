#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, loadConfig } from './config.js';
import { createContext } from './context.js';
import { startHttpServer } from './http.js';
import { log, setLogLevel } from './lib/logger.js';
import { createMcpServer } from './server.js';
import { VERSION } from './version.js';

const HELP = `travel-mcp-server ${VERSION}: MCP server for flight prices, status, schedules, airports and currency.

Usage:
  npx -y mcp-server-travel            Run over stdio (for Claude Desktop, Claude Code, Cursor, Gemini CLI)
  npx -y mcp-server-travel --http     Run Streamable HTTP on http://127.0.0.1:3000/mcp

Options:
  --http               Use Streamable HTTP transport (same as MCP_TRANSPORT=http)
  --stdio              Use stdio transport (default)
  --port <n>           HTTP port (default 3000, or MCP_HTTP_PORT)
  --host <addr>        HTTP bind address (default 127.0.0.1, or MCP_HTTP_HOST)
  -v, --version        Print version
  -h, --help           Show this help

Environment: FLIGHTAPI_KEY, MCP_HTTP_TOKEN and more; see .env.example or the README.`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      http: { type: 'boolean' },
      stdio: { type: 'boolean' },
      port: { type: 'string' },
      host: { type: 'string' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });
  if (values.help) {
    process.stderr.write(`${HELP}\n`);
    return;
  }
  if (values.version) {
    process.stderr.write(`${VERSION}\n`);
    return;
  }
  const port = values.port === undefined ? undefined : Number(values.port);
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new ConfigError('--port must be an integer between 1 and 65535');
  }

  const config = loadConfig(process.env, {
    ...(values.http ? { http: true } : {}),
    ...(values.stdio ? { stdio: true } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(values.host ? { host: values.host } : {}),
  });
  setLogLevel(config.logLevel);
  const ctx = createContext(config);

  if (!config.flightApiKey) {
    log.warn(
      'FLIGHTAPI_KEY is not set: airport search and currency conversion work, flight tools will explain how to add a key.',
    );
  }

  const shutdown = () => {
    ctx.cache.flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (config.transport === 'http') {
    await startHttpServer(ctx);
    return;
  }
  const server = createMcpServer(ctx);
  await server.connect(new StdioServerTransport());
  log.info(`travel-mcp-server ${VERSION} running on stdio`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  log.error(msg);
  process.exit(1);
});
