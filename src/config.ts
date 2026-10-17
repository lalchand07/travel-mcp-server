import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { LogLevel } from './lib/logger.js';

const bool = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const int = (def: number, min = 0, max = 1_000_000) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === '') return def;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `must be an integer between ${min} and ${max}` });
        return z.NEVER;
      }
      return n;
    });

const EnvSchema = z.object({
  FLIGHTAPI_KEY: z.string().trim().optional(),
  FLIGHTAPI_MAX_PER_MINUTE: int(10),
  FLIGHTAPI_MAX_PER_DAY: int(100),
  DEFAULT_CURRENCY: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .optional()
    .transform((v) => (v ?? 'USD').toUpperCase()),
  CACHE_FILE: z.string().trim().optional(),
  CACHE_TTL_PRICES_MIN: int(30, 0, 1440),
  CACHE_TTL_STATUS_MIN: int(2, 0, 60),
  CACHE_TTL_FX_HOURS: int(12, 0, 72),
  REQUEST_TIMEOUT_MS: int(10_000, 1000, 60_000),
  MCP_TRANSPORT: z.enum(['stdio', 'http']).optional(),
  MCP_HTTP_HOST: z.string().trim().optional(),
  MCP_HTTP_PORT: int(3000, 1, 65535),
  MCP_HTTP_TOKEN: z.string().optional(),
  MCP_HTTP_ALLOWED_HOSTS: z.string().optional(),
  MCP_HTTP_ALLOW_PATH_TOKEN: bool,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
  ENABLE_FILE_CACHE: bool,
});

export interface Config {
  flightApiKey: string | undefined;
  limits: { perMinute: number; perDay: number };
  defaultCurrency: string;
  cacheFile: string | undefined;
  ttl: { pricesMs: number; statusMs: number; fxMs: number };
  requestTimeoutMs: number;
  transport: 'stdio' | 'http';
  http: {
    host: string;
    port: number;
    token: string | undefined;
    allowedHosts: string[] | undefined;
    /** Also accept the token as a secret URL path (/mcp/<token>) for clients that cannot send headers. */
    allowPathToken: boolean;
  };
  logLevel: LogLevel;
}

export interface CliFlags {
  http?: boolean;
  stdio?: boolean;
  port?: number;
  host?: string;
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, flags: CliFlags = {}): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid configuration: ${details}`);
  }
  const e = parsed.data;
  const transport = flags.http ? 'http' : flags.stdio ? 'stdio' : (e.MCP_TRANSPORT ?? 'stdio');
  const cacheFile =
    e.CACHE_FILE ||
    (e.ENABLE_FILE_CACHE ? join(homedir(), '.cache', 'mcp-server-travel', 'cache.json') : undefined);

  return {
    flightApiKey: e.FLIGHTAPI_KEY || undefined,
    limits: { perMinute: e.FLIGHTAPI_MAX_PER_MINUTE, perDay: e.FLIGHTAPI_MAX_PER_DAY },
    defaultCurrency: e.DEFAULT_CURRENCY,
    cacheFile,
    ttl: {
      pricesMs: e.CACHE_TTL_PRICES_MIN * 60_000,
      statusMs: e.CACHE_TTL_STATUS_MIN * 60_000,
      fxMs: e.CACHE_TTL_FX_HOURS * 3_600_000,
    },
    requestTimeoutMs: e.REQUEST_TIMEOUT_MS,
    transport,
    http: {
      host: flags.host ?? e.MCP_HTTP_HOST ?? '127.0.0.1',
      port: flags.port ?? e.MCP_HTTP_PORT,
      token: e.MCP_HTTP_TOKEN || undefined,
      allowedHosts: e.MCP_HTTP_ALLOWED_HOSTS?.split(',')
        .map((h) => h.trim())
        .filter(Boolean),
      allowPathToken: e.MCP_HTTP_ALLOW_PATH_TOKEN ?? false,
    },
    logLevel: e.LOG_LEVEL ?? 'info',
  };
}
