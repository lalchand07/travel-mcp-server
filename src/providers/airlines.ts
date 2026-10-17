import { readFileSync } from 'node:fs';

interface Dataset {
  airlines: Record<string, [string, string, string]>;
}

export interface Airline {
  iata: string;
  name: string;
  icao: string | null;
  country: string;
}

/** Airline name lookup by IATA designator (OpenFlights data, ODbL). */
export class AirlineDirectory {
  constructor(private readonly data: Dataset) {}

  static fromBundledData(): AirlineDirectory {
    const url = new URL('../../data/airlines.json', import.meta.url);
    return new AirlineDirectory(JSON.parse(readFileSync(url, 'utf8')) as Dataset);
  }

  get(iata: string): Airline | undefined {
    const row = this.data.airlines[iata.toUpperCase()];
    if (!row) return undefined;
    return { iata: iata.toUpperCase(), name: row[0], icao: row[1] || null, country: row[2] };
  }

  /** Display name for an IATA code; falls back to the code itself. */
  name(iata: string): string {
    return this.get(iata)?.name ?? iata;
  }
}
