# Test fixtures

Tests never touch the network. `test/helpers.ts` serves these files through a fake `fetch`.

| File | Origin |
| --- | --- |
| `flightapi/onewaytrip.json` | The sample response from the official [Oneway Trip API docs](https://www.flightapi.io/documentation/oneway-trip-api/) (HEL → OUL), plus a second, more expensive itinerary added for sorting tests. |
| `flightapi/onewaytrip-with-lookups.json` | The same shape, with `places`/`carriers`/`agents` lookup lists. The docs name these lists but do not show their fields, so this fixture uses the common `{id, name, display_code}` shape to exercise the defensive parser. Replace it with a live recording (below) when you can. |
| `flightapi/roundtrip.json` | Built from the sample in the official [Round Trip API docs](https://www.flightapi.io/documentation/round-trip-api/) (itineraries with `cheapest_price`, two legs, segments). |
| `flightapi/airline.json` | The sample response from the official [Flight Tracking API docs](https://www.flightapi.io/documentation/flight-tracking-api/), verbatim. |
| `flightapi/schedule.json` | The sample response from the official [Airport Schedule API docs](https://www.flightapi.io/documentation/airport-schedule-api/), trimmed to two flights, with a third (already departed) flight added for the "upcoming" filter. |
| `frankfurter/latest.json` | A response in the shape documented at https://frankfurter.dev/v1 (`/v1/latest`, base EUR). |

## Recording live fixtures

```bash
FLIGHTAPI_KEY=your_key npx tsx scripts/record-fixtures.ts
```

This makes 4 FlightAPI requests (about 7 credits) and writes `test/fixtures/live/*.json`. The API key is redacted from everything it writes. Review the files before committing them.
