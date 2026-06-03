import { ENRICHED_AIRPORT_CODES } from './enrichment';
import { airportLookupService } from './lookupService';
import type { AirportDirectoryEntry } from './supabaseAirports';

export type AirportDirectoryStatus = 'active_planner' | 'planning_guide' | 'coming_soon';

export type AirportDirectoryFeature =
  | 'parking'
  | 'rideshare'
  | 'transit'
  | 'tsa_clear'
  | 'weather'
  | 'companion';

export type AirportDirectoryRecord = {
  code: string;
  name: string;
  city: string | null;
  region: string | null;
  country: string;
  countryCode: string;
  slug: string;
  status: AirportDirectoryStatus;
  features: AirportDirectoryFeature[];
  notes: string | null;
};

export const AIRPORT_DIRECTORY_STATUS_LABELS: Record<AirportDirectoryStatus, string> = {
  active_planner: 'Active airport planner',
  planning_guide: 'Airport planning guide',
  coming_soon: 'Coming soon',
};

export const AIRPORT_DIRECTORY_FEATURE_LABELS: Record<AirportDirectoryFeature, string> = {
  parking: 'Parking',
  rideshare: 'Rideshare',
  transit: 'Transit',
  tsa_clear: 'TSA/CLEAR',
  weather: 'Weather',
  companion: 'Companion card',
};

function resolveStatus(code: string): AirportDirectoryStatus {
  if (code.toUpperCase() === 'SEA') return 'active_planner';
  if (ENRICHED_AIRPORT_CODES.includes(code.toUpperCase())) return 'planning_guide';
  return 'coming_soon';
}

function resolveFeatures(code: string, status: AirportDirectoryStatus): AirportDirectoryFeature[] {
  if (status === 'active_planner') {
    return ['parking', 'rideshare', 'transit', 'tsa_clear', 'weather', 'companion'];
  }

  if (status === 'planning_guide') {
    const enriched = ENRICHED_AIRPORT_CODES.includes(code.toUpperCase());
    return enriched
      ? ['parking', 'rideshare', 'weather', 'companion']
      : ['parking', 'rideshare', 'weather'];
  }

  return ['parking', 'rideshare'];
}

function resolveCountryCode(rawCountry: string | null | undefined): string {
  const value = String(rawCountry || 'US').trim().toUpperCase();
  if (value === 'CA' || value === 'CANADA') return 'CA';
  return 'US';
}

function resolveCountryLabel(countryCode: string): string {
  if (countryCode === 'CA') return 'Canada';
  return 'United States';
}

export function buildAirportDirectoryRecords(
  entries: AirportDirectoryEntry[],
): AirportDirectoryRecord[] {
  return entries.map((entry) => {
    const code = entry.code.toUpperCase();
    const airport = airportLookupService.getAirportByCode(code);
    const status = resolveStatus(code);
    const countryCode = resolveCountryCode(airport?.country);

    return {
      code,
      name: entry.name,
      city: entry.city ?? airport?.city ?? null,
      region: entry.state ?? airport?.state ?? null,
      country: resolveCountryLabel(countryCode),
      countryCode,
      slug: code.toLowerCase(),
      status,
      features: resolveFeatures(code, status),
      notes: entry.description ?? airport?.genericGuidance ?? null,
    };
  });
}

const US_REGION_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  CA: 'California',
  CO: 'Colorado',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  IL: 'Illinois',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  NC: 'North Carolina',
  NJ: 'New Jersey',
  NV: 'Nevada',
  NY: 'New York',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  TX: 'Texas',
  UT: 'Utah',
  VA: 'Virginia',
  WA: 'Washington',
};

const CA_REGION_NAMES: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  ON: 'Ontario',
  QC: 'Quebec',
  SK: 'Saskatchewan',
};

function getRegionSearchTerms(region: string | null, countryCode: string): string[] {
  if (!region) return [];

  const code = region.toUpperCase();
  const regionNames = countryCode === 'CA' ? CA_REGION_NAMES : US_REGION_NAMES;

  return [code, regionNames[code]].filter(Boolean);
}

export function normalizeAirportSearchText(value: string): string {
  return value.trim().toLowerCase();
}

export function matchesAirportSearch(record: AirportDirectoryRecord, query: string): boolean {
  const normalized = normalizeAirportSearchText(query);
  if (!normalized) return true;

  const haystack = [
    record.code,
    record.name,
    record.city,
    ...getRegionSearchTerms(record.region, record.countryCode),
    record.country,
    record.countryCode,
    record.notes,
    AIRPORT_DIRECTORY_STATUS_LABELS[record.status],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalized) || record.code.toLowerCase().startsWith(normalized);
}

export type AirportDirectoryFilters = {
  query?: string;
  country?: 'all' | string;
  region?: 'all' | string;
  status?: 'all' | AirportDirectoryStatus;
};

export function filterAirportDirectory(
  records: AirportDirectoryRecord[],
  filters: AirportDirectoryFilters,
): AirportDirectoryRecord[] {
  return records.filter((record) => {
    if (filters.country && filters.country !== 'all' && record.countryCode !== filters.country) {
      return false;
    }

    if (
      filters.region &&
      filters.region !== 'all' &&
      record.region?.toUpperCase() !== filters.region.toUpperCase()
    ) {
      return false;
    }

    if (filters.status && filters.status !== 'all' && record.status !== filters.status) {
      return false;
    }

    if (filters.query && !matchesAirportSearch(record, filters.query)) {
      return false;
    }

    return true;
  });
}

export function getAvailableRegions(records: AirportDirectoryRecord[]): string[] {
  const regions = new Set<string>();

  for (const record of records) {
    if (record.region) {
      regions.add(record.region.toUpperCase());
    }
  }

  return [...regions].sort();
}

export function getAvailableCountries(records: AirportDirectoryRecord[]): string[] {
  const countries = new Set<string>();

  for (const record of records) {
    countries.add(record.countryCode);
  }

  return [...countries].sort();
}
