import type { TrackingArrival, TrackingDeparture, TrackingResponse } from '../providers/flightapi.js';

export interface FlightStatusSummary {
  flight: string;
  date: string;
  status: string;
  departure: {
    airport: string | null;
    airportCode: string | null;
    city: string | null;
    terminal: string | null;
    gate: string | null;
    scheduled: string | null;
    estimated: string | null;
    actualTakeoff: string | null;
    gateDeparture: string | null;
    dateTime: string | null;
  } | null;
  arrival: {
    airport: string | null;
    airportCode: string | null;
    city: string | null;
    terminal: string | null;
    gate: string | null;
    baggageBelt: string | null;
    scheduled: string | null;
    estimated: string | null;
    touchdown: string | null;
    gateArrival: string | null;
    dateTime: string | null;
    timeRemaining: string | null;
  } | null;
}

const v = (x: string | null | undefined): string | null =>
  x === undefined || x === null || x === '' ? null : x;

/**
 * FlightAPI's tracking response has no explicit status field, so derive one from the
 * documented timestamps: gate-in/touchdown => landed, takeoff => in the air, gate-out => taxiing.
 */
export function deriveStatus(dep: TrackingDeparture | undefined, arr: TrackingArrival | undefined): string {
  if (v(arr?.inGateTime)) return 'Arrived at gate';
  if (v(arr?.onGroundTime)) return 'Landed';
  if (v(dep?.offGroundTime))
    return v(arr?.timeRemaining) ? `In the air (${arr?.timeRemaining} remaining)` : 'Departed';
  if (v(dep?.outGateTime)) return 'Left the gate (taxiing)';
  if (v(dep?.estimatedTime) && dep?.estimatedTime !== dep?.scheduledTime)
    return 'Scheduled (new estimated time)';
  return 'Scheduled';
}

export function summarizeStatus(data: TrackingResponse, flight: string, date: string): FlightStatusSummary {
  let dep: TrackingDeparture | undefined;
  let arr: TrackingArrival | undefined;
  for (const item of data) {
    if ('departure' in item && item.departure) dep = item.departure;
    if ('arrival' in item && item.arrival) arr = item.arrival;
  }
  return {
    flight,
    date,
    status: deriveStatus(dep, arr),
    departure: dep
      ? {
          airport: v(dep.airport),
          airportCode: v(dep.airportCode),
          city: v(dep.airportCity),
          terminal: v(dep.terminal),
          gate: v(dep.gate),
          scheduled: v(dep.scheduledTime),
          estimated: v(dep.estimatedTime),
          actualTakeoff: v(dep.offGroundTime),
          gateDeparture: v(dep.outGateTime),
          dateTime: v(dep.departureDateTime),
        }
      : null,
    arrival: arr
      ? {
          airport: v(arr.airport),
          airportCode: v(arr.airportCode),
          city: v(arr.airportCity),
          terminal: v(arr.terminal),
          gate: v(arr.gate),
          baggageBelt: v(arr.baggage),
          scheduled: v(arr.scheduledTime),
          estimated: v(arr.estimatedTime),
          touchdown: v(arr.onGroundTime),
          gateArrival: v(arr.inGateTime),
          dateTime: v(arr.arrivalDateTime),
          timeRemaining: v(arr.timeRemaining),
        }
      : null,
  };
}

export function formatStatus(s: FlightStatusSummary, cached: boolean): string {
  const lines = [`Flight ${s.flight} on ${s.date}: ${s.status}${cached ? ' (cached, up to 2 min old)' : ''}`];
  const d = s.departure;
  if (d) {
    lines.push(
      `Departure: ${d.airport ?? '?'} (${d.airportCode ?? '?'})${d.terminal ? `, terminal ${d.terminal}` : ''}${d.gate ? `, gate ${d.gate}` : ''}`,
      `  scheduled ${d.scheduled ?? '?'}${d.estimated ? `, estimated ${d.estimated}` : ''}${d.actualTakeoff ? `, took off ${d.actualTakeoff}` : ''}`,
    );
  }
  const a = s.arrival;
  if (a) {
    lines.push(
      `Arrival: ${a.airport ?? '?'} (${a.airportCode ?? '?'})${a.terminal ? `, terminal ${a.terminal}` : ''}${a.gate ? `, gate ${a.gate}` : ''}${a.baggageBelt ? `, baggage ${a.baggageBelt}` : ''}`,
      `  scheduled ${a.scheduled ?? '?'}${a.estimated ? `, estimated ${a.estimated}` : ''}${a.touchdown ? `, landed ${a.touchdown}` : ''}`,
    );
  }
  lines.push('Times are local to each airport. Gates can change; check airport screens before travelling.');
  return lines.join('\n');
}
