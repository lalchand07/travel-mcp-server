/**
 * Regenerates the bundled datasets in data/.
 *
 *   npm run data:build                      # download fresh sources
 *   npm run data:build -- --from-dir ./src  # use local copies of the source files
 *
 * Sources:
 *   - OurAirports (public domain): airports.csv, countries.csv
 *     https://github.com/davidmegginson/ourairports-data
 *   - OpenFlights (ODbL 1.0): airlines.dat
 *     https://github.com/jpatokal/openflights
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCES = {
  airports: 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv',
  countries: 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/countries.csv',
  airlines: 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat',
} as const;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data');

/** RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toObjects(rows: string[][]): Record<string, string>[] {
  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

async function load(name: keyof typeof SOURCES, fromDir: string | undefined): Promise<string> {
  if (fromDir) {
    const file = SOURCES[name].split('/').pop()!;
    return readFile(join(fromDir, file), 'utf8');
  }
  console.log(`Downloading ${SOURCES[name]}`);
  const res = await fetch(SOURCES[name], { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Failed to download ${name}: HTTP ${res.status}`);
  return res.text();
}

const AIRPORT_TYPES = new Set(['large_airport', 'medium_airport', 'small_airport']);
const TYPE_CODE: Record<string, 'L' | 'M' | 'S'> = {
  large_airport: 'L',
  medium_airport: 'M',
  small_airport: 'S',
};

/**
 * Compact airport row: [iata, icao, name, city, countryCode, lat, lon, size, keywords, scheduled]
 * size: L(arge) | M(edium) | S(mall); keywords: OurAirports search keywords (alternate names);
 * scheduled: 1 if OurAirports marks the airport as having scheduled airline service.
 */
export type AirportRow = [
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  'L' | 'M' | 'S',
  string,
  0 | 1,
];

function cleanKeywords(raw: string, iata: string): string {
  const parts = raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k && k.toUpperCase() !== iata && k.length <= 60);
  return [...new Set(parts)].join(', ').slice(0, 200);
}

export function buildAirports(airportsCsv: string): AirportRow[] {
  const seen = new Set<string>();
  const out: AirportRow[] = [];
  for (const a of toObjects(parseCsv(airportsCsv))) {
    const iata = (a.iata_code ?? '').trim().toUpperCase();
    const type = a.type ?? '';
    if (!/^[A-Z]{3}$/.test(iata) || !AIRPORT_TYPES.has(type)) continue;
    // Keep airports with scheduled passenger service, plus all large/medium airports.
    if (a.scheduled_service !== 'yes' && type === 'small_airport') continue;
    if (seen.has(iata)) continue;
    seen.add(iata);
    const icao = (a.icao_code || a.gps_code || '').trim().toUpperCase();
    out.push([
      iata,
      /^[A-Z0-9]{4}$/.test(icao) ? icao : '',
      (a.name ?? '').trim(),
      (a.municipality ?? '').trim(),
      (a.iso_country ?? '').trim(),
      Math.round(Number(a.latitude_deg) * 1e4) / 1e4,
      Math.round(Number(a.longitude_deg) * 1e4) / 1e4,
      TYPE_CODE[type]!,
      cleanKeywords(a.keywords ?? '', iata),
      a.scheduled_service === 'yes' ? 1 : 0,
    ]);
  }
  return out.sort((x, y) => x[0].localeCompare(y[0]));
}

export function buildCountries(countriesCsv: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of toObjects(parseCsv(countriesCsv))) {
    if (c.code && c.name) out[c.code] = c.name;
  }
  return out;
}

/** Airline row keyed by IATA code: [name, icao, country] */
export function buildAirlines(airlinesDat: string): Record<string, [string, string, string]> {
  const out: Record<string, [string, string, string]> = {};
  for (const r of parseCsv(airlinesDat)) {
    // id, name, alias, IATA, ICAO, callsign, country, active
    const [, name = '', , iata = '', icao = '', , country = '', active = ''] = r;
    const code = iata.trim().toUpperCase();
    if (active !== 'Y' || !/^[A-Z0-9]{2}$/.test(code) || out[code]) continue;
    const clean = (s: string) => (s === '\\N' ? '' : s.trim());
    out[code] = [clean(name), /^[A-Z]{3}$/.test(clean(icao)) ? clean(icao) : '', clean(country)];
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const idx = process.argv.indexOf('--from-dir');
  const fromDir = idx > -1 ? resolve(process.argv[idx + 1] ?? '.') : undefined;

  const [airportsCsv, countriesCsv, airlinesDat] = await Promise.all([
    load('airports', fromDir),
    load('countries', fromDir),
    load('airlines', fromDir),
  ]);

  const generatedAt = new Date().toISOString().slice(0, 10);
  const airports = buildAirports(airportsCsv);
  const countries = buildCountries(countriesCsv);
  const airlines = buildAirlines(airlinesDat);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    join(OUT_DIR, 'airports.json'),
    JSON.stringify({
      source: 'OurAirports (https://ourairports.com/data/), public domain',
      generatedAt,
      fields: ['iata', 'icao', 'name', 'city', 'country', 'lat', 'lon', 'size', 'keywords', 'scheduled'],
      countries,
      airports,
    }) + '\n',
  );
  await writeFile(
    join(OUT_DIR, 'airlines.json'),
    JSON.stringify({
      source: 'OpenFlights (https://openflights.org/data.php), Open Database License (ODbL) 1.0',
      generatedAt,
      fields: ['name', 'icao', 'country'],
      airlines,
    }) + '\n',
  );
  console.log(
    `Wrote ${airports.length} airports, ${Object.keys(countries).length} countries, ${Object.keys(airlines).length} airlines to ${OUT_DIR}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
