import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { CREDIT_COST } from '../providers/flightapi.js';
import { ok, safe } from './result.js';

export function registerGetUsage(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    'get_usage',
    {
      title: 'Get API usage',
      description:
        'Shows how many FlightAPI and exchange-rate calls this server has made since it started, how many were served from cache, ' +
        'estimated FlightAPI credits spent, and the remaining per-minute and per-day safety limits. Uses no credits.',
      inputSchema: z.strictObject({}),
      annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
    },
    safe('get_usage', () => {
      const usage = ctx.usage.snapshot();
      const limits = ctx.limiter.snapshot();
      const fa = usage.flightapi;
      const estimatedCredits = fa
        ? Object.entries(fa.byEndpoint).reduce(
            (sum, [ep, n]) => sum + ((CREDIT_COST as Partial<Record<string, number>>)[ep] ?? 0) * n,
            0,
          )
        : 0;
      const remaining = (limit: number, used: number) =>
        limit > 0 ? Math.max(0, limit - used) : 'unlimited';
      const data = {
        since: ctx.usage.startedAt.toISOString(),
        flightApiKeyConfigured: ctx.flightApi.configured,
        flightapi: {
          upstreamCalls: fa?.upstreamCalls ?? 0,
          cacheHits: fa?.cacheHits ?? 0,
          errors: fa?.errors ?? 0,
          byEndpoint: fa?.byEndpoint ?? {},
          estimatedCreditsUsed: estimatedCredits,
        },
        currency: usage.frankfurter ?? { upstreamCalls: 0, cacheHits: 0, errors: 0, byEndpoint: {} },
        limits: {
          perMinute: limits.perMinute || 'unlimited',
          perDay: limits.perDay || 'unlimited',
          usedLastMinute: limits.usedLastMinute,
          usedLast24h: limits.usedLast24h,
          remainingThisMinute: remaining(limits.perMinute, limits.usedLastMinute),
          remainingToday: remaining(limits.perDay, limits.usedLast24h),
        },
        cacheEntries: ctx.cache.size,
      };
      const text = [
        `Usage since ${data.since} (this server process):`,
        `FlightAPI key configured: ${data.flightApiKeyConfigured ? 'yes' : 'no'}`,
        `FlightAPI: ${data.flightapi.upstreamCalls} calls (~${estimatedCredits} credits), ${data.flightapi.cacheHits} served from cache, ${data.flightapi.errors} errors`,
        `Exchange rates: ${data.currency.upstreamCalls} call(s), ${data.currency.cacheHits} from cache`,
        `Safety limits: ${String(data.limits.remainingThisMinute)} of ${String(data.limits.perMinute)} left this minute, ${String(data.limits.remainingToday)} of ${String(data.limits.perDay)} left in the last 24h`,
        'Note: counters reset when the server restarts. Your FlightAPI dashboard shows your account-wide balance.',
      ].join('\n');
      return ok(text, data);
    }),
  );
}
