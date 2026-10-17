import { describe, expect, it } from 'vitest';
import {
  currencyCode,
  daysBetween,
  flightNumber,
  futureDate,
  iataAirport,
  nearDate,
} from '../src/lib/validation.js';

const now = () => new Date('2026-10-17T12:00:00Z');

describe('iataAirport', () => {
  it('normalizes to upper case', () => {
    expect(iataAirport.parse(' lhe ')).toBe('LHE');
  });
  it.each(['LH', 'LHER', 'L1E', 'https://evil', ''])('rejects %j', (v) => {
    expect(iataAirport.safeParse(v).success).toBe(false);
  });
});

describe('currencyCode', () => {
  it('accepts and normalizes', () => {
    expect(currencyCode.parse('gbp')).toBe('GBP');
  });
  it('rejects non-codes', () => {
    expect(currencyCode.safeParse('POUND').success).toBe(false);
  });
});

describe('flightNumber', () => {
  it.each([
    ['PK757', 'PK', '757'],
    ['ek 623', 'EK', '623'],
    ['BA-107', 'BA', '107'],
    ['6E2405', '6E', '2405'],
    ['U21234', 'U2', '1234'],
  ])('parses %s', (input, airline, number) => {
    expect(flightNumber.parse(input)).toMatchObject({ airline, number });
  });
  it.each(['757', 'PKA', 'PK12345', 'P', 'PK757; rm -rf'])('rejects %j', (v) => {
    expect(flightNumber.safeParse(v).success).toBe(false);
  });
});

describe('futureDate', () => {
  const schema = futureDate({ now });
  it('accepts today and future dates', () => {
    expect(schema.safeParse('2026-10-17').success).toBe(true);
    expect(schema.safeParse('2026-12-15').success).toBe(true);
  });
  it('allows yesterday (time zones ahead of UTC)', () => {
    expect(schema.safeParse('2026-10-16').success).toBe(true);
  });
  it('rejects past dates with a clear message', () => {
    const r = schema.safeParse('2026-10-01');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/in the past/);
  });
  it('rejects impossible dates and bad formats', () => {
    expect(schema.safeParse('2026-02-30').success).toBe(false);
    expect(schema.safeParse('15/12/2026').success).toBe(false);
  });
  it('rejects dates too far ahead', () => {
    expect(schema.safeParse('2028-01-01').success).toBe(false);
  });
});

describe('nearDate', () => {
  const schema = nearDate({ pastDays: 7, futureDays: 7, now });
  it('accepts dates in the window', () => {
    expect(schema.safeParse('2026-10-10').success).toBe(true);
    expect(schema.safeParse('2026-10-24').success).toBe(true);
  });
  it('rejects dates outside the window', () => {
    expect(schema.safeParse('2026-10-09').success).toBe(false);
    expect(schema.safeParse('2026-10-25').success).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts days across months', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
  });
});
