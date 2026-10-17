# FlightAPI integration notes

The FlightAPI client (`src/providers/flightapi.ts`) is implemented from the official documentation at
<https://www.flightapi.io/documentation/> (pages read on 2026-10-17). This file records exactly which
endpoints are used, how tool inputs map to them, and the places where the docs are silent or
inconsistent, so they can be checked against a live response.

## Endpoints used

| Tool                                | Endpoint (documented)                                                                                                                                                                                                    | Credits |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `search_flight_prices` (one-way)    | `GET https://api.flightapi.io/onewaytrip/<api-key>/<departure_airport_code>/<arrival_airport_code>/<departure_date>/<number_of_adults>/<number_of_childrens>/<number_of_infants>/<cabin_class>/<currency>`               | 2       |
| `search_flight_prices` (round trip) | `GET https://api.flightapi.io/roundtrip/<api-key>/<departure_airport_code>/<arrival_airport_code>/<departure_date>/<arrival_date>/<number_of_adults>/<number_of_childrens>/<number_of_infants>/<cabin_class>/<currency>` | 2       |
| `get_flight_status`                 | `GET https://api.flightapi.io/airline/<api-key>?num=<number>&name=<airline code>&date=<YYYYMMDD>[&depap=<IATA>]`                                                                                                         | 1       |
| `get_airport_schedule`              | `GET https://api.flightapi.io/schedule/<api-key>?mode=<departures\|arrivals>&iata=<IATA>&day=<1\|2>`                                                                                                                     | 2       |

Docs pages: [Oneway Trip](https://www.flightapi.io/documentation/oneway-trip-api/),
[Round Trip](https://www.flightapi.io/documentation/round-trip-api/),
[Flight Tracking](https://www.flightapi.io/documentation/flight-tracking-api/),
[Airport Schedule](https://www.flightapi.io/documentation/airport-schedule-api/),
[Getting started / credit costs / error codes](https://www.flightapi.io/documentation/getting-started/).

## Parameter mapping

- `cabin_class`: `economy` → `Economy`, `premium_economy` → `Premium_Economy`, `business` → `Business`,
  `first` → `First` (the documented values).
- `get_flight_status.flight_number` is split into the airline designator (`name`) and number (`num`):
  `PK757` → `name=PK&num=757`. `date` is sent as `YYYYMMDD`, as documented.
- `get_airport_schedule.day`: `today` → `day=1`, `tomorrow` → `day=2`. **The `day` parameter is always
  sent.** The docs say that without it the API returns the last 5 to next 5 days and that "credit cost also
  depends on the number of days you receive".

## Response handling

- **Prices.** `itineraries[]` reference `legs[]` (by `leg_ids`), and legs reference `segments[]`
  (by `segment_ids`). Price is `cheapest_price.amount` when present (shown in the round-trip sample),
  otherwise the lowest `pricing_options[].price.amount`. Itineraries without a positive price are skipped.
  Duplicate itineraries (same flights sold by several agents) are collapsed to the cheapest.
- **Tracking.** The response is an array with a `{ departure: {...} }` and an `{ arrival: {...} }` object.
  There is no explicit status field, so status is derived from the documented timestamps:
  `inGateTime` → arrived, `onGroundTime` → landed, `offGroundTime` → in the air / departed,
  `outGateTime` → taxiing, otherwise scheduled.
- **Schedule.** Flights are read from `airport.pluginData.schedule.<departures|arrivals>.data[].flight`.
  Unix timestamps are converted to local time using the airport's `timezone.offset`. Flights more than
  30 minutes in the past are dropped so the board shows upcoming flights only.

## Error codes (documented)

| Status  | Docs say                                                                                                          | Tool reports                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 404     | "Either user is not found or there is no such flight"                                                             | `UPSTREAM_NOT_FOUND`, with a hint that the key may be invalid if it always happens |
| 410     | "no flight for that particular departure or arrival date" (the error table also calls it "Request timeout error") | `UPSTREAM_NOT_FOUND`, suggests a nearby date                                       |
| 429     | plan connection limit exceeded, or free plan's 100 requests / 30 days used up                                     | `UPSTREAM_QUOTA`                                                                   |
| 401/403 | not documented                                                                                                    | `UPSTREAM_AUTH` (defensive)                                                        |

HTTP errors are never retried, because a retried request may cost credits again.

## Gaps and inconsistencies in the docs

These were handled conservatively and should be verified with one live call (`scripts/record-fixtures.ts`):

1. **`places`, `carriers`, `agents` fields are not shown.** The price docs describe these lookup lists but
   the sample response omits them. The parser accepts arrays of objects with `id` (or objects keyed by id)
   and reads the name from `name` and the code from `display_code`, `alt_id`, `iata` or `code`. If none match,
   output falls back to the searched airport codes and "Unknown airline". It does not crash.
2. **`region` parameter.** The price parameter tables list `region` as required, but the URL schema and every
   example omit it. This client follows the schema and examples and does not send it.
3. **Price per passenger vs total.** Not stated. The deep-link URLs in the samples include `passengers=2` and a
   `ticket_price` equal to the itinerary amount, which suggests totals. The tool note says prices "normally cover all
   passengers in the search".
4. **Booking links** in `pricing_options[].items[].url` are relative paths with no documented host, so they are
   not returned.
5. **"Some objects will have more attributes"** and "you might have to make more than one API call to get complete
   data": empty price results are cached for only 2 minutes so a later retry can fill them in.
6. **Airport Schedule API v2** (`/schedule/v2`) has internally inconsistent docs (examples use `mode=dep` while the
   parameter table says `arrivals`/`departures`, and `iata` is not in the table). v1 is used.
7. **Flight tracking date window** is not documented. The tool accepts dates within ±7 days of today, as a
   sanity check to avoid wasting credits.
