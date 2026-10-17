import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createContext } from '../src/context.js';
import { createHttpApp, tokensMatch } from '../src/http.js';
import { fakeFetch, TEST_KEY } from './helpers.js';

const TOKEN = 'http-test-token-0123456789abcdef';
let server: Server | undefined;

afterEach(async () => {
  const s = server;
  if (s) {
    await new Promise<void>((r) => {
      s.close(() => {
        r();
      });
    });
  }
  server = undefined;
});

async function start(env: Record<string, string> = {}): Promise<string> {
  const config = loadConfig({ FLIGHTAPI_KEY: TEST_KEY, MCP_HTTP_TOKEN: TOKEN, ...env }, { http: true });
  const app = createHttpApp(createContext(config, { fetch: fakeFetch([]) }));
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => {
      resolve(s);
    });
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } },
};

function post(url: string, headers: Record<string, string> = {}, body: unknown = initialize) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** POST initialize with a custom Host header (fetch() cannot override Host, so use node:http). */
function statusWithHost(base: URL, host: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: base.hostname,
        port: base.port,
        path: '/mcp',
        method: 'POST',
        headers: {
          host,
          authorization: `Bearer ${TOKEN}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(initialize));
  });
}

describe('HTTP transport auth', () => {
  it('refuses to start without a strong token', () => {
    const ctx = (token?: string) =>
      createContext(loadConfig(token ? { MCP_HTTP_TOKEN: token } : {}, { http: true }), {
        fetch: fakeFetch([]),
      });
    expect(() => createHttpApp(ctx())).toThrow(/requires MCP_HTTP_TOKEN/);
    expect(() => createHttpApp(ctx('short'))).toThrow(/at least 16 characters/);
  });

  it('rejects requests without a bearer token', async () => {
    const base = await start();
    const res = await post(`${base}/mcp`);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer/);
  });

  it('rejects a wrong token', async () => {
    const base = await start();
    expect((await post(`${base}/mcp`, { authorization: `Bearer ${TOKEN}x` })).status).toBe(401);
    expect((await post(`${base}/mcp`, { authorization: `Basic ${TOKEN}` })).status).toBe(401);
  });

  it('accepts the right token and serves MCP', async () => {
    const base = await start();
    const res = await post(`${base}/mcp`, { authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe('travel-mcp-server');
  });

  it('works end to end with the SDK Streamable HTTP client', async () => {
    const base = await start();
    const client = new Client({ name: 't', version: '0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
      }),
    );
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(6);
    const r = await client.callTool({ name: 'search_airports', arguments: { query: 'Doha', limit: 1 } });
    expect(JSON.stringify(r.content)).toContain('DOH');
    await client.close();
  });

  it('shares cache and limits across requests (stateless server, shared context)', async () => {
    const base = await start({ FLIGHTAPI_KEY: '' });
    const call = (id: number) =>
      post(
        `${base}/mcp`,
        { authorization: `Bearer ${TOKEN}` },
        {
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: 'get_usage', arguments: {} },
        },
      );
    const res = await call(2);
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).toContain('flightApiKeyConfigured');
  });

  it('does not expose the secret-path route unless enabled', async () => {
    const base = await start();
    expect((await post(`${base}/mcp/${TOKEN}`)).status).toBe(404);
  });

  it('supports the opt-in secret-path token for clients that cannot send headers', async () => {
    const base = await start({ MCP_HTTP_ALLOW_PATH_TOKEN: 'true' });
    expect((await post(`${base}/mcp/${TOKEN}`)).status).toBe(200);
    expect((await post(`${base}/mcp/not-the-token`)).status).toBe(404);
  });

  it('serves an unauthenticated health check that reveals nothing sensitive', async () => {
    const base = await start();
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"status":"ok"');
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(TEST_KEY);
  });

  it('rejects requests with a foreign Host header (DNS rebinding protection)', async () => {
    const base = new URL(await start());
    expect(await statusWithHost(base, 'evil.example')).toBe(403);
  });

  it('accepts allowlisted public hostnames and still allows loopback health checks', async () => {
    const base = new URL(await start({ MCP_HTTP_ALLOWED_HOSTS: 'travel.example.com' }));
    expect(await statusWithHost(base, 'travel.example.com')).toBe(200);
    expect(await statusWithHost(base, 'evil.example')).toBe(403);
    expect((await fetch(`${base.origin}/healthz`)).status).toBe(200);
  });

  it('answers GET /mcp with 405 (stateless server)', async () => {
    const base = await start();
    const res = await fetch(`${base}/mcp`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(405);
  });
});

describe('tokensMatch', () => {
  it('compares in constant time regardless of length', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
    expect(tokensMatch('abc', 'abcd')).toBe(false);
    expect(tokensMatch('', 'abc')).toBe(false);
  });
});
