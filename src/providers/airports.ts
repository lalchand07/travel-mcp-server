import { readFileSync } from 'node:fs';

export interface Airport {
  iata: string;
  icao: string | null;
  name: string;
  city: string;
  countryCode: string;
  country: string;
  lat: number;
  lon: number;
  size: 'large' | 'medium' | 'small';
}

type Row = [string, string, string, string, string, number, number, 'L' | 'M' | 'S', string];

interface Dataset {
  generatedAt: string;
  countries: Record<string, string>;
  airports: Row[];
}

interface Indexed extends Airport {
  nCity: string;
  nName: string;
  nKeywords: string;
  nCountry: string;
}

const SIZE = { L: 'large', M: 'medium', S: 'small' } as const;
const SIZE_BONUS = { large: 10, medium: 5, small: 0 } as const;

/**
 * Hand-curated aliases for places people commonly ask about that have no airport
 * of their own or are spelled differently from the dataset.
 */
const ALIASES: Record<string, { codes: string[]; note: string }> = {
  makkah: { codes: ['JED', 'TIF'], note: 'Makkah has no airport; Jeddah (JED) is the usual gateway.' },
  mecca: { codes: ['JED', 'TIF'], note: 'Makkah has no airport; Jeddah (JED) is the usual gateway.' },
  madinah: { codes: ['MED'], note: 'Madinah is served by Prince Mohammad Bin Abdulaziz Airport (MED).' },
  madina: { codes: ['MED'], note: 'Madinah is served by Prince Mohammad Bin Abdulaziz Airport (MED).' },
  islamabad: { codes: ['ISB'], note: 'Islamabad International Airport (ISB).' },
  rawalpindi: { codes: ['ISB'], note: 'Rawalpindi is served by Islamabad International Airport (ISB).' },
  'new york': { codes: ['JFK', 'EWR', 'LGA'], note: 'New York has three main airports.' },
};

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface AirportSearchResult {
  airport: Airport;
  score: number;
  matchedBy: 'iata' | 'icao' | 'city' | 'alias' | 'name' | 'keyword' | 'country';
}

export class AirportDirectory {
  private readonly list: Indexed[];
  private readonly byIata = new Map<string, Indexed>();
  readonly generatedAt: string;

  constructor(dataset: Dataset) {
    this.generatedAt = dataset.generatedAt;
    this.list = dataset.airports.map(([iata, icao, name, city, cc, lat, lon, size, keywords]) => {
      const country = dataset.countries[cc] ?? cc;
      const a: Indexed = {
        iata,
        icao: icao || null,
        name,
        city,
        countryCode: cc,
        country,
        lat,
        lon,
        size: SIZE[size],
        nCity: normalize(city),
        nName: normalize(name),
        nKeywords: normalize(keywords),
        nCountry: normalize(country),
      };
      this.byIata.set(iata, a);
      return a;
    });
  }

  static fromBundledData(): AirportDirectory {
    const url = new URL('../../data/airports.json', import.meta.url);
    return new AirportDirectory(JSON.parse(readFileSync(url, 'utf8')) as Dataset);
  }

  get count(): number {
    return this.list.length;
  }

  getByIata(code: string): Airport | undefined {
    const a = this.byIata.get(code.toUpperCase());
    return a ? strip(a) : undefined;
  }

  /** Returns a short note for alias queries such as "Makkah", if any. */
  aliasNote(query: string): string | undefined {
    return ALIASES[normalize(query)]?.note;
  }

  search(query: string, limit = 8): AirportSearchResult[] {
    const q = normalize(query);
    if (!q) return [];
    const upper = query.trim().toUpperCase();
    const scored = new Map<string, AirportSearchResult>();
    const add = (a: Indexed, score: number, matchedBy: AirportSearchResult['matchedBy']) => {
      const total = score + SIZE_BONUS[a.size];
      const prev = scored.get(a.iata);
      if (!prev || prev.score < total) scored.set(a.iata, { airport: strip(a), score: total, matchedBy });
    };

    if (/^[A-Z]{3}$/.test(upper)) {
      const a = this.byIata.get(upper);
      if (a) add(a, 1000, 'iata');
    }
    const alias = ALIASES[q];
    alias?.codes.forEach((code, i) => {
      const a = this.byIata.get(code);
      if (a) add(a, 900 - i, 'alias');
    });

    const wordRe = new RegExp(`(^| )${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    for (const a of this.list) {
      if (/^[A-Z]{4}$/.test(upper) && a.icao === upper) add(a, 950, 'icao');
      else if (a.nCity === q) add(a, 800, 'city');
      else if (a.nCity.startsWith(q)) add(a, 600, 'city');
      else if (wordRe.test(a.nName)) add(a, 500, 'name');
      else if (q.length >= 4 && a.nName.includes(q)) add(a, 400, 'name');
      else if (wordRe.test(a.nKeywords)) add(a, 450, 'keyword');
      else if (a.nCountry === q && a.size === 'large') add(a, 200, 'country');
    }

    return [...scored.values()]
      .sort((x, y) => y.score - x.score || x.airport.iata.localeCompare(y.airport.iata))
      .slice(0, limit);
  }
}

function strip(a: Indexed): Airport {
  return {
    iata: a.iata,
    icao: a.icao,
    name: a.name,
    city: a.city,
    countryCode: a.countryCode,
    country: a.country,
    lat: a.lat,
    lon: a.lon,
    size: a.size,
  };
}
