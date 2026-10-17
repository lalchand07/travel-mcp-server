import { createHash, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Express, NextFunction, Request, Response } from 'express';
import type { AppContext } from './context.js';
import { log } from './lib/logger.js';
import { registerSecret } from './lib/redact.js';
import { createMcpServer } from './server.js';
import { VERSION } from './version.js';

export const MIN_TOKEN_LENGTH = 16;
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** Constant-time comparison (hashing first makes lengths equal). */
export function tokensMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function jsonRpcError(res: Response, status: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}

/**
 * Express app serving MCP over Streamable HTTP (stateless: a fresh McpServer per request,
 * while cache/limits/usage live in the shared ctx).
 */
export function createHttpApp(ctx: AppContext): Express {
  const { host, token, allowedHosts, allowPathToken } = ctx.config.http;
  if (!token || token.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `HTTP mode requires MCP_HTTP_TOKEN with at least ${MIN_TOKEN_LENGTH} characters. Generate one with: openssl rand -hex 32`,
    );
  }
  registerSecret(token);

  // Host-header validation (DNS rebinding protection) is automatic for loopback hosts. With an explicit
  // allowlist, loopback names stay allowed so local health checks keep working (they cannot be rebound).
  const hosts = allowedHosts?.length ? [...new Set([...allowedHosts, ...LOOPBACK_HOSTS])] : undefined;
  const app = createMcpExpressApp({ host, ...(hosts ? { allowedHosts: hosts } : {}) });
  app.disable('x-powered-by');

  const requireBearer = (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match?.[1] || !tokensMatch(match[1].trim(), token)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="travel-mcp-server"');
      jsonRpcError(res, 401, 'Unauthorized: missing or invalid bearer token');
      return;
    }
    next();
  };

  const requirePathToken = (req: Request, res: Response, next: NextFunction) => {
    const provided = req.params.token;
    if (typeof provided !== 'string' || !tokensMatch(provided, token)) {
      jsonRpcError(res, 404, 'Not found');
      return;
    }
    next();
  };

  const handleMcp = async (req: Request, res: Response) => {
    const server = createMcpServer(ctx);
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log.error('Error handling MCP request', { error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) jsonRpcError(res, 500, 'Internal server error');
    }
  };

  const methodNotAllowed = (_req: Request, res: Response) => {
    res.setHeader('Allow', 'POST');
    jsonRpcError(res, 405, 'Method not allowed. This server is stateless; use POST.');
  };

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', name: 'travel-mcp-server', version: VERSION });
  });

  app.post('/mcp', requireBearer, handleMcp);
  app.get('/mcp', requireBearer, methodNotAllowed);
  app.delete('/mcp', requireBearer, methodNotAllowed);

  if (allowPathToken) {
    app.post('/mcp/:token', requirePathToken, handleMcp);
    app.get('/mcp/:token', requirePathToken, methodNotAllowed);
    app.delete('/mcp/:token', requirePathToken, methodNotAllowed);
  }

  app.use((_req, res) => {
    jsonRpcError(res, 404, 'Not found');
  });
  return app;
}

export function startHttpServer(ctx: AppContext): Promise<Server> {
  const app = createHttpApp(ctx);
  const { host, port } = ctx.config.http;
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, (err?: Error) => {
      if (err) {
        reject(err);
        return;
      }
      const shown = host.includes(':') ? `[${host}]` : host;
      log.info(`Streamable HTTP MCP server listening on http://${shown}:${port}/mcp`);
      if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
        log.warn(
          'Listening on a non-loopback interface. Put this server behind HTTPS (see README "Running remotely").',
        );
      }
      resolve(server);
    });
  });
}
