import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { currencyCode } from '../lib/validation.js';
import { ok, safe } from './result.js';

export function registerConvertCurrency(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    'convert_currency',
    {
      title: 'Convert currency',
      description:
        'Convert an amount between currencies using European Central Bank reference rates (published once per working day). ' +
        'Good for comparing fares quoted in different currencies. Free and keyless; rates are cached for 12 hours. ' +
        'Covers about 30 major currencies (USD, EUR, GBP, INR, TRY, CNY, JPY, ...); currencies the ECB does not publish (e.g. PKR, AED, SAR) are not available.',
      inputSchema: z.strictObject({
        amount: z.number().positive().max(1e12).describe('Amount to convert, e.g. 450.'),
        from: currencyCode.describe('Source currency, ISO 4217, e.g. GBP.'),
        to: currencyCode.describe('Target currency, ISO 4217, e.g. USD.'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    safe('convert_currency', async ({ amount, from, to }) => {
      const c = await ctx.currency.convert(amount, from, to);
      return ok(
        `${c.amount} ${c.from} = ${c.result.toFixed(2)} ${c.to} (1 ${c.from} = ${c.rate} ${c.to}, ECB reference rate of ${c.date}). Indicative only; card and bank rates differ.`,
        { ...c },
      );
    }),
  );
}
