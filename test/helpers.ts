import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../src/config.js';
import { createContext, type AppContext } from '../src/context.js';
import type { FetchLike } from '../src/lib/http-client.js';
import { createMcpServer } from '../src/server.js';

export const TEST_KEY = 'test-key-0123456789abcdef';

export function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8'));
}

export interface Route {
  match: RegExp;
  status?: number;
  body?: unknown;
  /** Throw instead of responding (simulates a network failure). */
  error?: Error;
}

/** A fake fetch that serves fixtures by URL pattern and records every call. Unmatched URLs fail the test. */
export function fakeFetch(routes: Route[]): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (input: string): Promise<Response> => {
    calls.push(input);
    const route = routes.find((r) => r.match.test(input));
    if (!route) return Promise.reject(new Error(`Unexpected fetch in test: ${input}`));
    if (route.error) return Promise.reject(route.error);
    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body ?? {});
    return Promise.resolve(
      new Response(body, { status: route.status ?? 200, headers: { 'content-type': 'application/json' } }),
    );
  };
  return Object.assign(fn, { calls });
}

/** A controllable clock. Default: 2026-10-17 12:00 UTC. */
export function testClock(start = '2026-10-17T12:00:00Z') {
  let t = new Date(start).getTime();
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
    set: (iso: string) => {
      t = new Date(iso).getTime();
    },
  };
}

export interface Harness {
  client: Client;
  ctx: AppContext;
  fetch: ReturnType<typeof fakeFetch>;
  clock: ReturnType<typeof testClock>;
  call: (name: string, args?: Record<string, unknown>) => Promise<CallToolResult & { text: string }>;
  close: () => Promise<void>;
}

/** Connects a real MCP client to the server over an in-memory transport. */
export async function createHarness(
  opts: { routes?: Route[]; env?: Record<string, string>; clock?: ReturnType<typeof testClock> } = {},
): Promise<Harness> {
  const clock = opts.clock ?? testClock();
  const fetch = fakeFetch(opts.routes ?? []);
  const config = loadConfig({ FLIGHTAPI_KEY: TEST_KEY, ...opts.env });
  const ctx = createContext(config, { fetch, now: clock.now });
  const server = createMcpServer(ctx);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const text = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
    return { ...res, text };
  };
  return {
    client,
    ctx,
    fetch,
    clock,
    call,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
