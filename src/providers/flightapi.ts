/**
 * FlightAPI.io client. Endpoints, parameters and response shapes follow the official docs:
 *   https://www.flightapi.io/documentation/oneway-trip-api/
 *   https://www.flightapi.io/documentation/round-trip-api/
 *   https://www.flightapi.io/documentation/flight-tracking-api/
 *   https://www.flightapi.io/documentation/airport-schedule-api/
 * See docs/FLIGHTAPI.md for the mapping and known gaps in the docs.
 */
import { cacheKey, type TtlCache } from '../lib/cache.js';
import { HttpError, ToolError } from '../lib/errors.js';
import { fetchJson, type FetchLike } from '../lib/http-client.js';
import type { RateLimiter } from '../lib/rate-limiter.js';
import { registerSecret } from '../lib/redact.js';
import type { UsageTracker } from '../lib/usage.js';

export const FLIGHTAPI_BASE_URL = 'https://api.flightapi.io';

/** Documented credit cost per request (https://www.flightapi.io/documentation/getting-started/). */
export const CREDIT_COST = { onewaytrip: 2, roundtrip: 2, airline: 1, schedule: 2 } as const;
export type FlightApiEndpoint = keyof typeof CREDIT_COST;

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

/** Values documented for the cabin_class path segment. */
const CABIN_PARAM: Record<CabinClass, string> = {
  economy: 'Economy',
  premium_economy: 'Premium_Economy',
  business: 'Business',
  first: 'First',
};

export interface PriceSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string | undefined;
  adults: number;
  children: number;
  infants: number;
  cabinClass: CabinClass;
  currency: string;
}

export interface FlightApiDeps {
  apiKey: string | undefined;
  fetch: FetchLike;
  cache: TtlCache;
  limiter: RateLimiter;
  usage: UsageTracker;
  ttl: { pricesMs: number; statusMs: number };
  timeoutMs: number;
}

/** How long to remember an empty result. FlightAPI notes some searches need a retry to fill in. */
const EMPTY_RESULT_TTL_MS = 2 * 60_000;

export class FlightApiClient {
  constructor(private readonly deps: FlightApiDeps) {
    registerSecret(deps.apiKey);
  }

  get configured(): boolean {
    return Boolean(this.deps.apiKey);
  }

  /** One-way (`/onewaytrip`) or round-trip (`/roundtrip`) price search. Raw FlightAPI JSON. */
  async searchPrices(p: PriceSearchParams): Promise<{ data: PriceResponse; cached: boolean }> {
    const endpoint: FlightApiEndpoint = p.returnDate ? 'roundtrip' : 'onewaytrip';
    const segments = [
      p.origin,
      p.destination,
      p.departureDate,
      ...(p.returnDate ? [p.returnDate] : []),
      String(p.adults),
      String(p.children),
      String(p.infants),
      CABIN_PARAM[p.cabinClass],
      p.currency,
    ];
    return this.request<PriceResponse>(
      endpoint,
      segments,
      undefined,
      this.deps.ttl.pricesMs,
      (d) => Array.isArray(d.itineraries) && d.itineraries.length > 0,
    );
  }

  /** Flight tracking (`/airline`). `date` is YYYY-MM-DD; FlightAPI wants YYYYMMDD. */
  async trackFlight(p: {
    airline: string;
    number: string;
    date: string;
    departureAirport?: string | undefined;
  }): Promise<{ data: TrackingResponse; cached: boolean }> {
    const query: Record<string, string> = { num: p.number, name: p.airline, date: p.date.replace(/-/g, '') };
    if (p.departureAirport) query.depap = p.departureAirport;
    return this.request<TrackingResponse>(
      'airline',
      [],
      query,
      this.deps.ttl.statusMs,
      (d) => Array.isArray(d) && d.length > 0,
    );
  }

  /** Airport schedule (`/schedule`). day: 1 = today, 2 = tomorrow (always sent, to keep credit cost bounded). */
  async airportSchedule(p: {
    iata: string;
    mode: 'departures' | 'arrivals';
    day: 1 | 2;
  }): Promise<{ data: ScheduleResponse; cached: boolean }> {
    return this.request<ScheduleResponse>(
      'schedule',
      [],
      { mode: p.mode, iata: p.iata, day: String(p.day) },
      this.deps.ttl.statusMs,
      () => true,
    );
  }

  private async request<T>(
    endpoint: FlightApiEndpoint,
    pathSegments: string[],
    query: Record<string, string> | undefined,
    ttlMs: number,
    isNonEmpty: (data: T) => boolean,
  ): Promise<{ data: T; cached: boolean }> {
    const { apiKey, cache, limiter, usage } = this.deps;
    const key = cacheKey(`flightapi:${endpoint}`, { path: pathSegments.join('/'), ...query });

    const hit = cache.get<T>(key);
    if (hit !== undefined) {
      usage.recordCacheHit('flightapi');
      return { data: hit, cached: true };
    }
    if (!apiKey) {
      throw new ToolError(
        'MISSING_API_KEY',
        'No FlightAPI key is configured, so live flight data is unavailable. Airport search and currency conversion still work.',
        'Get a key at https://www.flightapi.io/ (free tier available) and set FLIGHTAPI_KEY in your MCP client config, then restart the client.',
      );
    }

    const { value, cached } = await cache.getOrSet(key, 0, async () => {
      limiter.consume('FlightAPI');
      usage.recordCall('flightapi', endpoint);
      const path = [apiKey, ...pathSegments].map(encodeURIComponent).join('/');
      const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
      try {
        return await fetchJson<T>(`${FLIGHTAPI_BASE_URL}/${endpoint}/${path}${qs}`, {
          fetch: this.deps.fetch,
          timeoutMs: this.deps.timeoutMs,
        });
      } catch (err) {
        usage.recordError('flightapi');
        throw toFlightApiError(err, endpoint);
      }
    });
    // getOrSet was called with ttl 0 so the TTL can depend on the result.
    if (!cached) cache.set(key, value, isNonEmpty(value) ? ttlMs : Math.min(ttlMs, EMPTY_RESULT_TTL_MS));
    else usage.recordCacheHit('flightapi');
    return { data: value, cached };
  }
}

function toFlightApiError(err: unknown, endpoint: FlightApiEndpoint): Error {
  if (err instanceof ToolError) return err;
  if (!(err instanceof HttpError)) return err instanceof Error ? err : new Error(String(err));

  if (err.kind === 'timeout')
    return new ToolError('TIMEOUT', 'FlightAPI did not respond in time.', 'Try again in a minute.');
  if (err.kind === 'network')
    return new ToolError(
      'NETWORK',
      'Could not reach FlightAPI (api.flightapi.io).',
      'Check your internet connection.',
    );
  if (err.kind === 'parse')
    return new ToolError('UPSTREAM_ERROR', 'FlightAPI returned an unreadable response.');

  const what =
    endpoint === 'airline'
      ? 'flight'
      : endpoint === 'schedule'
        ? 'schedule'
        : 'flights for this route and date';
  switch (err.status) {
    case 400:
      return new ToolError(
        'UPSTREAM_BAD_REQUEST',
        'FlightAPI rejected the request parameters.',
        'Check the airport codes and dates.',
      );
    case 401:
    case 403:
      return new ToolError(
        'UPSTREAM_AUTH',
        'FlightAPI rejected the API key.',
        'Check FLIGHTAPI_KEY in your MCP client config (copy it again from your FlightAPI dashboard).',
      );
    case 404:
      // Documented: "Either user is not found or there is no such flight".
      return new ToolError(
        'UPSTREAM_NOT_FOUND',
        `FlightAPI found no ${what}.`,
        'Double-check the codes and date. If this happens for every search, your API key may be invalid.',
      );
    case 410:
      // Documented: "410 error occurs when there is no flight for that particular departure or arrival date."
      return new ToolError(
        'UPSTREAM_NOT_FOUND',
        `FlightAPI has no ${what} on that date.`,
        'Try a nearby date.',
      );
    case 429:
      return new ToolError(
        'UPSTREAM_QUOTA',
        'FlightAPI says your plan limit has been reached (HTTP 429).',
        'Slow down, wait for your quota to reset, or upgrade your FlightAPI plan. The free plan has 100 requests per 30 days.',
      );
    default:
      return new ToolError(
        'UPSTREAM_ERROR',
        `FlightAPI returned an error (HTTP ${err.status ?? 'unknown'}).`,
        'Try again later.',
      );
  }
}

// ---------------------------------------------------------------------------
// Response types: only the fields documented in the official sample responses.
// Everything is optional because the docs say "some objects will have more attributes".
// ---------------------------------------------------------------------------

export interface PriceAmount {
  amount?: number;
  update_status?: string;
  last_updated?: string;
  quote_age?: number;
}

export interface PricingOption {
  id?: string;
  agent_ids?: string[];
  price?: PriceAmount;
  items?: { agent_id?: string; url?: string; price?: PriceAmount }[];
}

export interface Itinerary {
  id: string;
  leg_ids?: string[];
  pricing_options?: PricingOption[];
  cheapest_price?: PriceAmount;
  score?: number;
}

export interface Leg {
  id: string;
  origin_place_id?: number;
  destination_place_id?: number;
  departure?: string;
  arrival?: string;
  segment_ids?: string[];
  duration?: number;
  stop_count?: number;
  marketing_carrier_ids?: number[];
  operating_carrier_ids?: number[];
  stop_ids?: number[][];
}

export interface Segment {
  id: string;
  origin_place_id?: number;
  destination_place_id?: number;
  departure?: string;
  arrival?: string;
  duration?: number;
  marketing_flight_number?: string;
  marketing_carrier_id?: number;
  operating_carrier_id?: number;
  mode?: string;
}

/**
 * The docs describe `places`, `carriers` and `agents` as lookup lists referenced by id,
 * but do not show their fields, so they are read defensively (see summarize-prices.ts).
 */
export interface PriceResponse {
  itineraries?: Itinerary[];
  legs?: Leg[];
  segments?: Segment[];
  places?: unknown;
  carriers?: unknown;
  agents?: unknown;
}

export interface TrackingDeparture {
  offGroundTime?: string | null;
  outGateTime?: string | null;
  gate?: string | null;
  departureDateTime?: string | null;
  airport?: string | null;
  airportCity?: string | null;
  airportCode?: string | null;
  airportCountryCode?: string | null;
  scheduledTime?: string | null;
  estimatedTime?: string | null;
  terminal?: string | null;
}

export interface TrackingArrival {
  timeRemaining?: string | null;
  onGroundTime?: string | null;
  inGateTime?: string | null;
  gate?: string | null;
  baggage?: string | null;
  arrivalDateTime?: string | null;
  airport?: string | null;
  airportCity?: string | null;
  airportCode?: string | null;
  airportCountryCode?: string | null;
  scheduledTime?: string | null;
  estimatedTime?: string | null;
  terminal?: string | null;
}

export type TrackingResponse = ({ departure?: TrackingDeparture } | { arrival?: TrackingArrival })[];

export interface ScheduleAirportRef {
  code?: { iata?: string | null; icao?: string | null } | null;
  name?: string | null;
  timezone?: { name?: string | null; offset?: number | null } | null;
  info?: { terminal?: string | null; baggage?: string | null; gate?: string | null } | null;
  position?: {
    country?: { name?: string | null; code?: string | null } | null;
    region?: { city?: string | null } | null;
  } | null;
}

export interface ScheduleFlight {
  identification?: {
    number?: { default?: string | null; alternative?: string | null } | null;
    callsign?: string | null;
  } | null;
  status?: {
    live?: boolean | null;
    text?: string | null;
    generic?: { status?: { text?: string | null } | null } | null;
  } | null;
  aircraft?: { model?: { code?: string | null; text?: string | null } | null } | null;
  airline?: { name?: string | null; code?: { iata?: string | null; icao?: string | null } | null } | null;
  airport?: { origin?: ScheduleAirportRef | null; destination?: ScheduleAirportRef | null } | null;
  time?: {
    scheduled?: { departure?: number | null; arrival?: number | null } | null;
    real?: { departure?: number | null; arrival?: number | null } | null;
    estimated?: { departure?: number | null; arrival?: number | null } | null;
  } | null;
}

export interface ScheduleBoard {
  item?: { current?: number; total?: number; limit?: number };
  page?: { current?: number; total?: number };
  timestamp?: number;
  data?: { flight?: ScheduleFlight }[];
}

export interface ScheduleResponse {
  airport?: {
    pluginData?: {
      details?: {
        name?: string | null;
        code?: { iata?: string | null; icao?: string | null } | null;
        timezone?: { name?: string | null; offset?: number | null } | null;
        position?: {
          region?: { city?: string | null } | null;
          country?: { name?: string | null } | null;
        } | null;
      } | null;
      schedule?: { departures?: ScheduleBoard | null; arrivals?: ScheduleBoard | null } | null;
    } | null;
  } | null;
}
