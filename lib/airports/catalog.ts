'use strict';

/**
 * Backward-compatible airport catalog facade.
 * National airport data is served by AirportLookupService (OurAirports import).
 * WA enrichment metadata lives in enrichment.ts.
 */

import type { TrustStatus } from '../types';
import { AIRPORT_ENRICHMENT, ENRICHED_AIRPORT_CODES } from './enrichment';
import { airportLookupService, recordToAirportInfo } from './lookupService';
import type { AirportInfo as BaseAirportInfo } from './types';

export type AirportMapSource = {
  label: string;
  url: string;
  sourceName: string;
  trustStatus: TrustStatus;
};

export type AirportIndoorMap = {
  provider: 'official' | 'atrius' | 'mappedin' | 'custom' | 'link-only';
  label: string;
  url: string;
  embedUrl?: string;
  embeddable: boolean;
  sourceName: string;
  mapType?: 'official-indoor' | 'official-static-image' | 'official-link';
};

export type AirportTerminal = {
  id: string;
  label: string;
  notes?: string;
};

export type AirportCheckinArea = {
  id: string;
  label: string;
  terminal?: string;
  airlines?: string[];
  notes?: string;
};

export type AirportTerminalZone = {
  id: string;
  label: string;
  kind:
  | 'checkin'
  | 'security'
  | 'gates'
  | 'baggage'
  | 'ground-transport'
  | 'parking'
  | 'custom';
  description?: string;
  level?: string;
  airlines?: string[];
};

export type AirportInfo = BaseAirportInfo & {
  terminals?: AirportTerminal[];
  checkinAreas?: AirportCheckinArea[];
  terminalZones?: AirportTerminalZone[];
  airportMap?: AirportMapSource;
};

/** @deprecated Use airportLookupService.getPopularAirports() or search API. */
export const AIRPORTS_CATALOG: AirportInfo[] = ENRICHED_AIRPORT_CODES.map((code) => {
  const airport = airportLookupService.getAirportByCode(code);
  if (airport) return airport as AirportInfo;
  return recordToAirportInfo(
    {
      airportCode: code,
      iata: code,
      icao: null,
      name: code,
      city: null,
      state: null,
      country: 'US',
      latitude: 0,
      longitude: 0,
      timezone: null,
    },
    AIRPORT_ENRICHMENT[code],
  ) as AirportInfo;
});

export function getAirportById(id: string): AirportInfo | null {
  return airportLookupService.getAirportByCode(id) as AirportInfo | null;
}

export function getAirportOrFallback(id?: string): AirportInfo {
  if (id) {
    const found = getAirportById(id);
    if (found) return found;
  }

  return getAirportById('SEA') || AIRPORTS_CATALOG[0];
}

export { airportLookupService } from './lookupService';
export { ENRICHED_AIRPORT_CODES } from './enrichment';
