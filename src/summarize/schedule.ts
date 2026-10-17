import type { ScheduleAirportRef, ScheduleFlight, ScheduleResponse } from '../providers/flightapi.js';

export interface ScheduleEntry {
  flight: string;
  airline: string | null;
  /** Destination (for departures) or origin (for arrivals). */
  otherAirport: { code: string | null; name: string | null; city: string | null };
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
  status: string | null;
  terminal: string | null;
  gate: string | null;
  aircraft: string | null;
}

export interface ScheduleSummary {
  airport: { code: string; name: string | null; timezone: string | null };
  type: 'departures' | 'arrivals';
  flights: ScheduleEntry[];
  totalOnBoard: number;
  pagesAvailable: number | null;
}

/** Formats a unix timestamp (seconds) as local wall-clock time using a UTC offset in seconds. */
export function localTime(
  unix: number | null | undefined,
  offsetSec: number | null | undefined,
): string | null {
  if (typeof unix !== 'number') return null;
  const off = typeof offsetSec === 'number' ? offsetSec : 0;
  const d = new Date((unix + off) * 1000).toISOString().slice(0, 16);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 3600)).padStart(2, '0');
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  return `${d}${sign}${hh}:${mm}`;
}

export function summarizeSchedule(
  data: ScheduleResponse,
  opts: { iata: string; type: 'departures' | 'arrivals'; limit: number; nowSec: number; graceMin?: number },
): ScheduleSummary {
  const details = data.airport?.pluginData?.details;
  const board = data.airport?.pluginData?.schedule?.[opts.type];
  const offset = details?.timezone?.offset ?? null;
  const which = opts.type === 'departures' ? 'departure' : 'arrival';
  const graceSec = (opts.graceMin ?? 30) * 60;

  const flights = (board?.data ?? [])
    .map((d) => d.flight)
    .filter((f): f is ScheduleFlight => !!f)
    .map((f) => {
      const t = f.time;
      const sched = t?.scheduled?.[which] ?? null;
      const est = t?.estimated?.[which] ?? null;
      const real = t?.real?.[which] ?? null;
      const here: ScheduleAirportRef | null | undefined =
        opts.type === 'departures' ? f.airport?.origin : f.airport?.destination;
      const other: ScheduleAirportRef | null | undefined =
        opts.type === 'departures' ? f.airport?.destination : f.airport?.origin;
      return {
        sortKey: est ?? sched ?? 0,
        entry: {
          flight: f.identification?.number?.default ?? '?',
          airline: f.airline?.name ?? null,
          otherAirport: {
            code: other?.code?.iata ?? null,
            name: other?.name ?? null,
            city: other?.position?.region?.city ?? null,
          },
          scheduled: localTime(sched, offset),
          estimated: localTime(est, offset),
          actual: localTime(real, offset),
          status: f.status?.text ?? null,
          terminal: here?.info?.terminal ?? null,
          gate: here?.info?.gate ?? null,
          aircraft: f.aircraft?.model?.code || null,
        } satisfies ScheduleEntry,
      };
    })
    // "Upcoming": not yet departed/arrived, or within a short grace window.
    .filter((x) => x.sortKey === 0 || x.sortKey >= opts.nowSec - graceSec)
    .sort((a, b) => a.sortKey - b.sortKey);

  return {
    airport: {
      code: details?.code?.iata ?? opts.iata,
      name: details?.name ?? null,
      timezone: details?.timezone?.name ?? null,
    },
    type: opts.type,
    flights: flights.slice(0, opts.limit).map((x) => x.entry),
    totalOnBoard: flights.length,
    pagesAvailable: board?.page?.total ?? null,
  };
}

export function formatSchedule(s: ScheduleSummary, cached: boolean): string {
  const dir = s.type === 'departures' ? 'to' : 'from';
  const head = `${s.type === 'departures' ? 'Departures' : 'Arrivals'} at ${s.airport.name ?? s.airport.code} (${s.airport.code})${s.airport.timezone ? `, times in ${s.airport.timezone}` : ''}${cached ? ' (cached, up to 2 min old)' : ''}`;
  if (s.flights.length === 0) return `${head}\nNo upcoming flights found on this board.`;
  const lines = [head, ''];
  for (const f of s.flights) {
    const time =
      f.estimated && f.estimated !== f.scheduled
        ? `${f.scheduled?.slice(11, 16) ?? '?'} (est. ${f.estimated.slice(11, 16)})`
        : (f.scheduled?.slice(11, 16) ?? '?');
    const where = f.otherAirport.city ?? f.otherAirport.name ?? '?';
    const extra = [f.terminal ? `T${f.terminal}` : '', f.gate ? `gate ${f.gate}` : '']
      .filter(Boolean)
      .join(' ');
    lines.push(
      `${time}  ${f.flight.padEnd(7)} ${dir} ${where} (${f.otherAirport.code ?? '?'}) - ${f.airline ?? '?'} - ${f.status ?? '?'}${extra ? ` - ${extra}` : ''}`,
    );
  }
  if (s.totalOnBoard > s.flights.length)
    lines.push(
      '',
      `${s.totalOnBoard - s.flights.length} more upcoming flights not shown (raise "limit" to see more).`,
    );
  return lines.join('\n');
}
