import type { NationalAirportRecord } from './records';
import type { AirportInfo } from './types';
import {
  AIRPORT_ENRICHMENT,
  AIRPORT_SEARCH_ALIASES,
  ENRICHED_AIRPORT_CODES,
} from './enrichment';
import bundledAirports from '../../data/airports-us.generated.json';

const EARTH_RADIUS_MILES = 3958.8;

const POPULAR_US_IATA = [
  'SEA', 'PAE', 'LAX', 'JFK', 'ORD', 'ATL', 'DFW', 'SFO', 'DEN', 'LAS',
  'MIA', 'BOS', 'PHX', 'IAH', 'MSP', 'DTW', 'PHL', 'CLT', 'SAN', 'PDX',
];

function normalizeCode(value: string | null | undefined): string | null {
  const code = String(value || '').trim().toUpperCase();
  return code.length > 0 ? code : null;
}

function parseStateFromRegion(isoRegion: string | null | undefined): string | null {
  if (!isoRegion) return null;
  const parts = isoRegion.split('-');
  return parts.length >= 2 ? parts[1].toUpperCase() : null;
}

export function recordToAirportInfo(
  record: NationalAirportRecord,
  enrichment?: Partial<AirportInfo>,
): AirportInfo {
  const code = normalizeCode(record.iata) || record.airportCode;
  const city = record.city || '';
  const state = record.state || '';
  const locationSuffix = [city, state].filter(Boolean).join(', ');

  const base: AirportInfo = {
    id: code,
    label: record.name,
    destinationName: record.name,
    routingAddress: locationSuffix
      ? `${record.name} (${code}), ${locationSuffix}`
      : `${record.name} (${code})`,
    parkingSearchQuery: `${code} airport parking`,
    rideshareDestinationName: record.name,
    geoLocation: { lat: record.latitude, lng: record.longitude },
    city: record.city,
    state: record.state || undefined,
    country: record.country,
    iata: record.iata,
    icao: record.icao,
    timezone: record.timezone,
    isActive: record.isActive ?? true,
  };

  const merged = {
    ...base,
    ...(AIRPORT_ENRICHMENT[code] || {}),
    ...(enrichment || {}),
  };

  return merged;
}

function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

function scoreAirport(record: NationalAirportRecord, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const code = (record.iata || record.airportCode).toLowerCase();
  const name = record.name.toLowerCase();
  const city = (record.city || '').toLowerCase();
  const keywords = (record.keywords || '').toLowerCase();
  const aliases = AIRPORT_SEARCH_ALIASES[record.iata || record.airportCode] || [];

  let score = 0;

  if (code === q) score += 200;
  if (code.startsWith(q)) score += 120;
  if (name.startsWith(q)) score += 90;
  if (name.includes(q)) score += 60;
  if (city.startsWith(q)) score += 85;
  if (city.includes(q)) score += 55;
  if (keywords.includes(q)) score += 45;

  for (const alias of aliases) {
    if (alias === q) score += 150;
    if (alias.includes(q) || q.includes(alias)) score += 70;
  }

  if (score === 0) return 0;

  if (record.airportType === 'large_airport') score += 8;
  if (record.iata) score += 5;

  return score;
}

export class AirportLookupService {
  private records: NationalAirportRecord[] = [];
  private byCode = new Map<string, NationalAirportRecord>();
  private byIata = new Map<string, NationalAirportRecord>();
  private byIcao = new Map<string, NationalAirportRecord>();
  private loaded = false;

  loadRecords(records: NationalAirportRecord[]): void {
    this.records = records.filter((r) => r.isActive !== false);
    this.byCode.clear();
    this.byIata.clear();
    this.byIcao.clear();

    for (const record of this.records) {
      this.byCode.set(record.airportCode.toUpperCase(), record);
      const iata = normalizeCode(record.iata);
      const icao = normalizeCode(record.icao);
      if (iata) this.byIata.set(iata, record);
      if (icao) this.byIcao.set(icao, record);
    }

    this.loaded = true;
  }

  ensureLoaded(): void {
    if (this.loaded) return;
    this.loadRecords(bundledAirports as NationalAirportRecord[]);
  }

  searchAirports(query: string, limit = 10): AirportInfo[] {
    this.ensureLoaded();
    const q = query.trim();

    if (!q) {
      return POPULAR_US_IATA.map((code) => this.getAirportByCode(code)).filter(
        (a): a is AirportInfo => Boolean(a),
      );
    }

    return this.records
      .map((record) => ({ record, score: scoreAirport(record, q) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name))
      .slice(0, limit)
      .map(({ record }) => recordToAirportInfo(record));
  }

  getAirportByCode(code: string): AirportInfo | null {
    this.ensureLoaded();
    const upper = code.trim().toUpperCase();
    const record =
      this.byIata.get(upper) ||
      this.byCode.get(upper) ||
      this.byIcao.get(upper);
    return record ? recordToAirportInfo(record) : null;
  }

  getAirportByIcao(icao: string): AirportInfo | null {
    this.ensureLoaded();
    const record = this.byIcao.get(icao.trim().toUpperCase());
    return record ? recordToAirportInfo(record) : null;
  }

  getAirportByIata(iata: string): AirportInfo | null {
    return this.getAirportByCode(iata);
  }

  nearestAirport(lat: number, lng: number, limit = 5): AirportInfo[] {
    this.ensureLoaded();

    return this.records
      .filter((record) => record.iata && record.country === 'US')
      .map((record) => ({
        record,
        distanceMiles: milesBetween(
          { lat, lng },
          { lat: record.latitude, lng: record.longitude },
        ),
      }))
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, limit)
      .map(({ record }) => recordToAirportInfo(record));
  }

  getPopularAirports(limit = 20): AirportInfo[] {
    this.ensureLoaded();
    const codes = POPULAR_US_IATA.slice(0, limit);
    return codes
      .map((code) => this.getAirportByCode(code))
      .filter((a): a is AirportInfo => Boolean(a));
  }

  getEnrichedAirportCodes(): string[] {
    return [...ENRICHED_AIRPORT_CODES];
  }

  getAllRecords(): NationalAirportRecord[] {
    this.ensureLoaded();
    return [...this.records];
  }
}

export const airportLookupService = new AirportLookupService();

/** Map OurAirports CSV row to NationalAirportRecord. Exported for import script/tests. */
export function mapOurAirportsCsvRow(row: Record<string, string>): NationalAirportRecord | null {
  if (row.iso_country !== 'US') return null;

  const type = row.type || '';
  const iata = normalizeCode(row.iata_code);
  const allowedTypes = new Set([
    'large_airport',
    'medium_airport',
    'small_airport',
  ]);

  if (!allowedTypes.has(type)) return null;
  if (!iata && type === 'small_airport') return null;

  const latitude = Number(row.latitude_deg);
  const longitude = Number(row.longitude_deg);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const airportCode = iata || row.ident?.toUpperCase();
  if (!airportCode) return null;

  return {
    airportCode,
    iata,
    icao: normalizeCode(row.gps_code) || normalizeCode(row.ident),
    name: row.name,
    city: row.municipality || null,
    state: parseStateFromRegion(row.iso_region),
    country: 'US',
    latitude,
    longitude,
    timezone: null,
    airportType: type,
    keywords: row.keywords || null,
    isActive: true,
  };
}

export { parseStateFromRegion, normalizeCode, milesBetween };
