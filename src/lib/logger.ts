import { redact } from './redact.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

let current: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  current = level;
}

/**
 * Logs to stderr only. stdout is reserved for JSON-RPC in stdio mode, so writing
 * there would corrupt the protocol stream. Every line goes through redact().
 */
function write(level: Exclude<LogLevel, 'silent'>, msg: string, meta?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[current]) return;
  const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
  process.stderr.write(`[travel-mcp] ${level.toUpperCase()} ${redact(line)}\n`);
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => {
    write('debug', msg, meta);
  },
  info: (msg: string, meta?: Record<string, unknown>) => {
    write('info', msg, meta);
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    write('warn', msg, meta);
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    write('error', msg, meta);
  },
};
