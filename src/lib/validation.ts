import { z } from 'zod';

/** 3-letter IATA airport code, normalized to upper case. */
export const iataAirport = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z]{3}$/,
    'Must be a 3-letter IATA airport code, e.g. LHE or LHR. Use search_airports to find it.',
  )
  .transform((s) => s.toUpperCase());

/** ISO 4217 currency code. */
export const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'Must be a 3-letter ISO 4217 currency code, e.g. USD, GBP, PKR.')
  .transform((s) => s.toUpperCase());

/**
 * Airline flight number: 2-character IATA airline designator + 1-4 digits + optional suffix letter.
 * Accepts "PK757", "pk 757", "EK-623". Normalized to e.g. { airline: 'PK', number: '757' }.
 */
export const flightNumber = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .regex(
        /^(?:[A-Z]\d|\d[A-Z]|[A-Z]{2})\d{1,4}[A-Z]?$/,
        'Must be a flight number like PK757, EK623 or BA 107 (airline code + number).',
      ),
  )
  .transform((s) => ({ airline: s.slice(0, 2), number: s.slice(2), full: s }));

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format.');

function parseIsoDate(s: string): Date | undefined {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? undefined : d;
}

/** Today's date (UTC) as YYYY-MM-DD. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Difference in whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * A real calendar date that is not in the past. One day of slack covers time zones
 * ahead of UTC, and the upper bound keeps searches within what airlines sell.
 */
export function futureDate(opts: { maxDaysAhead?: number; now?: () => Date } = {}) {
  const { maxDaysAhead = 360, now = () => new Date() } = opts;
  return isoDate.superRefine((s, ctx) => {
    if (!parseIsoDate(s)) {
      ctx.addIssue({ code: 'custom', message: `${s} is not a valid calendar date.` });
      return;
    }
    const diff = daysBetween(todayUtc(now()), s);
    if (diff < -1)
      ctx.addIssue({ code: 'custom', message: `${s} is in the past. Use today or a future date.` });
    if (diff > maxDaysAhead)
      ctx.addIssue({
        code: 'custom',
        message: `${s} is more than ${maxDaysAhead} days ahead; fares are not published yet.`,
      });
  });
}

/** A real calendar date within [-pastDays, +futureDays] of today (UTC). */
export function nearDate(opts: { pastDays: number; futureDays: number; now?: () => Date }) {
  const { now = () => new Date() } = opts;
  return isoDate.superRefine((s, ctx) => {
    if (!parseIsoDate(s)) {
      ctx.addIssue({ code: 'custom', message: `${s} is not a valid calendar date.` });
      return;
    }
    const diff = daysBetween(todayUtc(now()), s);
    if (diff < -opts.pastDays || diff > opts.futureDays)
      ctx.addIssue({
        code: 'custom',
        message: `Date must be within ${opts.pastDays} day(s) before and ${opts.futureDays} day(s) after today (UTC).`,
      });
  });
}
