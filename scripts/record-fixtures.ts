/**
 * Records live FlightAPI responses into test/fixtures/live/ with the API key redacted.
 *
 *   FLIGHTAPI_KEY=your_key npx tsx scripts/record-fixtures.ts
 *
 * Makes 4 requests (about 7 credits: 2 + 2 + 1 + 2). Review the output before committing.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const key = process.env.FLIGHTAPI_KEY;
if (!key) {
  console.error('Set FLIGHTAPI_KEY first.');
  process.exit(1);
}

const out = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'test', 'fixtures', 'live');
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const k = encodeURIComponent(key);

const requests: Record<string, string> = {
  onewaytrip: `https://api.flightapi.io/onewaytrip/${k}/LHE/LHR/${inDays(45)}/1/0/0/Economy/USD`,
  roundtrip: `https://api.flightapi.io/roundtrip/${k}/LHE/JED/${inDays(45)}/${inDays(59)}/1/0/0/Economy/USD`,
  airline: `https://api.flightapi.io/airline/${k}?num=1&name=EK&date=${today}`,
  schedule: `https://api.flightapi.io/schedule/${k}?mode=departures&iata=DXB&day=1`,
};

await mkdir(out, { recursive: true });
for (const [name, url] of Object.entries(requests)) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const text = (await res.text()).split(key).join('[REDACTED]');
  await writeFile(join(out, `${name}.json`), text);
  console.log(`${name}: HTTP ${res.status}, ${text.length} bytes`);
}
console.log(`Wrote ${out}. Check the files contain no personal data before committing.`);
