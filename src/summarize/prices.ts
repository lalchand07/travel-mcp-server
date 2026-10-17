import type { AirlineDirectory } from '../providers/airlines.js';
import type { Itinerary, Leg, PriceResponse, Segment } from '../providers/flightapi.js';

export interface FlightLegSummary {
  from: string;
  to: string;
  departure: string | null;
  arrival: string | null;
  durationMinutes: number | null;
  duration: string | null;
  stops: number;
  stopovers: string[];
  airlines: string[];
  flightNumbers: string[];
}

export interface FlightOption {
  rank: number;
  price: number;
  currency: string;
  airlines: string[];
  outbound: FlightLegSummary;
  return?: FlightLegSummary;
  bookableVia: string[];
}

interface LookupEntry {
  name?: string;
  code?: string;
}

/**
 * Builds an id -> {name, code} map from a FlightAPI lookup list (places / carriers / agents).
 * The docs reference these lists but do not document their fields, so accept the common shapes:
 * an array of objects with `id`, or an object keyed by id; name from `name`, code from
 * `display_code` | `alt_id` | `iata` | `code`.
 */
export function buildLookup(list: unknown): Map<string, LookupEntry> {
  const out = new Map<string, LookupEntry>();
  const add = (id: unknown, v: unknown) => {
    if ((typeof id !== 'string' && typeof id !== 'number') || typeof v !== 'object' || v === null) return;
    const o = v as Record<string, unknown>;
    const name = [o.name, o.display_name].find((x): x is string => typeof x === 'string' && x.length > 0);
    const code = [o.display_code, o.alt_id, o.iata, o.code].find(
      (x): x is string => typeof x === 'string' && x.length > 0,
    );
    out.set(String(id), { ...(name ? { name } : {}), ...(code ? { code } : {}) });
  };
  if (Array.isArray(list)) for (const v of list) add((v as { id?: unknown } | null)?.id, v);
  else if (list && typeof list === 'object') for (const [k, v] of Object.entries(list)) add(k, v);
  return out;
}

export function formatDuration(min: number | undefined | null): string | null {
  if (min === undefined || min === null || !Number.isFinite(min)) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function itineraryPrice(it: Itinerary): number | undefined {
  const cheapest = it.cheapest_price?.amount;
  if (typeof cheapest === 'number' && cheapest > 0) return cheapest;
  const prices = (it.pricing_options ?? [])
    .map((o) => o.price?.amount)
    .filter((a): a is number => typeof a === 'number' && a > 0);
  return prices.length > 0 ? Math.min(...prices) : undefined;
}

export function summarizePrices(
  data: PriceResponse,
  opts: {
    origin: string;
    destination: string;
    currency: string;
    maxResults: number;
    airlines: AirlineDirectory;
  },
): { options: FlightOption[]; totalItineraries: number } {
  const legs = new Map((data.legs ?? []).map((l) => [l.id, l]));
  const segments = new Map((data.segments ?? []).map((s) => [s.id, s]));
  const places = buildLookup(data.places);
  const carriers = buildLookup(data.carriers);
  const agents = buildLookup(data.agents);

  const carrierName = (id: number | undefined): string | undefined => {
    if (id === undefined) return undefined;
    const c = carriers.get(String(id));
    if (c?.name) return c.name;
    if (c?.code) return opts.airlines.get(c.code)?.name ?? c.code;
    return undefined;
  };
  const carrierCode = (id: number | undefined) =>
    id === undefined ? undefined : carriers.get(String(id))?.code;
  const placeCode = (id: number | undefined) =>
    id === undefined ? undefined : (places.get(String(id))?.code ?? places.get(String(id))?.name);

  const summarizeLeg = (leg: Leg | undefined, fallbackFrom: string, fallbackTo: string): FlightLegSummary => {
    const segs = (leg?.segment_ids ?? []).map((id) => segments.get(id)).filter((s): s is Segment => !!s);
    const carrierIds = leg?.marketing_carrier_ids?.length
      ? leg.marketing_carrier_ids
      : segs.map((s) => s.marketing_carrier_id).filter((x): x is number => x !== undefined);
    const airlines = unique(carrierIds.map((id) => carrierName(id) ?? 'Unknown airline'));
    const flightNumbers = segs
      .map((s) => {
        const code = carrierCode(s.marketing_carrier_id);
        return s.marketing_flight_number ? `${code ?? ''}${s.marketing_flight_number}` : undefined;
      })
      .filter((x): x is string => !!x);
    const stopovers = (leg?.stop_ids ?? [])
      .flat()
      .map((id) => placeCode(id))
      .filter((x): x is string => !!x);
    return {
      from: placeCode(leg?.origin_place_id) ?? fallbackFrom,
      to: placeCode(leg?.destination_place_id) ?? fallbackTo,
      departure: leg?.departure ?? null,
      arrival: leg?.arrival ?? null,
      durationMinutes: leg?.duration ?? null,
      duration: formatDuration(leg?.duration),
      stops: leg?.stop_count ?? Math.max(0, segs.length - 1),
      stopovers: unique(stopovers),
      airlines,
      flightNumbers,
    };
  };

  const priced = (data.itineraries ?? [])
    .map((it) => ({ it, price: itineraryPrice(it) }))
    .filter((x): x is { it: Itinerary; price: number } => x.price !== undefined)
    .sort((a, b) => a.price - b.price);

  const seen = new Set<string>();
  const options: FlightOption[] = [];
  for (const { it, price } of priced) {
    if (options.length >= opts.maxResults) break;
    const [outId, retId] = it.leg_ids ?? [];
    const outbound = summarizeLeg(outId ? legs.get(outId) : undefined, opts.origin, opts.destination);
    const ret = retId ? summarizeLeg(legs.get(retId), opts.destination, opts.origin) : undefined;
    // The same flights are often sold by several agents; keep the cheapest.
    const sig = [
      outbound.departure,
      outbound.flightNumbers.join(','),
      ret?.departure,
      ret?.flightNumbers.join(','),
    ].join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);

    const agentIds = unique((it.pricing_options ?? []).flatMap((o) => o.agent_ids ?? []));
    options.push({
      rank: options.length + 1,
      price: Math.round(price * 100) / 100,
      currency: opts.currency,
      airlines: unique([...outbound.airlines, ...(ret?.airlines ?? [])]),
      outbound,
      ...(ret ? { return: ret } : {}),
      bookableVia: agentIds.slice(0, 3).map((id) => agents.get(id)?.name ?? id),
    });
  }
  return { options, totalItineraries: priced.length };
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function fmtTime(iso: string | null): string {
  if (!iso) return '?';
  // FlightAPI gives local times without an offset, e.g. 2024-05-20T06:00:00.
  return iso.slice(0, 16).replace('T', ' ');
}

function fmtLeg(l: FlightLegSummary): string {
  const stops =
    l.stops === 0
      ? 'non-stop'
      : `${l.stops} stop${l.stops > 1 ? 's' : ''}${l.stopovers.length ? ` via ${l.stopovers.join(', ')}` : ''}`;
  const nums = l.flightNumbers.length ? ` [${l.flightNumbers.join(', ')}]` : '';
  return `${l.from} ${fmtTime(l.departure)} -> ${l.to} ${fmtTime(l.arrival)} | ${l.duration ?? '?'} | ${stops} | ${l.airlines.join(' + ')}${nums}`;
}

export function formatPriceSummary(
  title: string,
  options: FlightOption[],
  meta: { cached: boolean; totalItineraries: number },
): string {
  if (options.length === 0) {
    return `${title}\nNo priced itineraries were returned. FlightAPI sometimes needs a second request to fill in results; try again in a few minutes or try a nearby date.`;
  }
  const lines = [
    title,
    `Showing ${options.length} cheapest of ${meta.totalItineraries} priced itineraries${meta.cached ? ' (cached result)' : ''}.`,
    '',
  ];
  for (const o of options) {
    lines.push(`${o.rank}. ${o.price.toFixed(2)} ${o.currency} - ${o.airlines.join(' + ')}`);
    lines.push(`   Out: ${fmtLeg(o.outbound)}`);
    if (o.return) lines.push(`   Back: ${fmtLeg(o.return)}`);
    if (o.bookableVia.length) lines.push(`   Sold by: ${o.bookableVia.join(', ')}`);
  }
  lines.push('', PRICE_NOTE);
  return lines.join('\n');
}

export const PRICE_NOTE =
  'Note: prices are indicative, collected from airlines and travel agents by FlightAPI, and normally cover all passengers in the search. They change quickly and may exclude baggage or payment fees. Times are local to each airport. This tool cannot book; confirm and book on the airline or agent website.';
