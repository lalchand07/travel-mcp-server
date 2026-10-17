import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';
import { ToolError } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { redact } from '../lib/redact.js';

export function ok(text: string, structured?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: redact(text) }],
    ...(structured
      ? { structuredContent: JSON.parse(redact(JSON.stringify(structured))) as Record<string, unknown> }
      : {}),
  };
}

export function fail(err: unknown, tool: string): CallToolResult {
  let text: string;
  let code: string;
  if (err instanceof ToolError) {
    code = err.code;
    text = `${err.message}${err.hint ? `\n${err.hint}` : ''}`;
  } else if (err instanceof ZodError) {
    code = 'VALIDATION';
    text = `Invalid input: ${err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`;
  } else {
    code = 'INTERNAL';
    text = 'Something went wrong while handling this request. Please try again.';
    log.error(`Unexpected error in ${tool}`, { error: err instanceof Error ? err.message : String(err) });
  }
  return {
    isError: true,
    content: [{ type: 'text', text: redact(`[${code}] ${text}`) }],
  };
}

/** Wraps a tool handler so every failure becomes a friendly, redacted isError result. */
export function safe<A>(tool: string, fn: (args: A) => CallToolResult | Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      return fail(err, tool);
    }
  };
}
