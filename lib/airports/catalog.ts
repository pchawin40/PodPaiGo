'use strict';

import { TrustStatus } from '../types';

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

export type AirportInfo = {
  id: string;
  label: string;
  destinationName: string;
  routingAddress: string;
  parkingSearchQuery: string;
  rideshareDestinationName: string;
  geoLocation: { lat: number; lng: number };
  checkinNote?: string;
  genericGuidance?: string;
  officialParkingUrl?: string;

  officialAirportUrl?: string;
  airportMap?: AirportMapSource;
  indoorMap?: AirportIndoorMap;

  terminals?: AirportTerminal[];
  checkinAreas?: AirportCheckinArea[];
  terminalZones?: AirportTerminalZone[];
};

export const AIRPORTS_CATALOG: AirportInfo[] = [
  {
    id: 'SEA',
    label: 'Seattle-Tacoma International Airport',
    destinationName: 'SeaTac Airport',
    routingAddress: 'Seattle-Tacoma International Airport (SEA), 17801 International Blvd, SeaTac, WA 98158',
    parkingSearchQuery: 'SEA airport parking',
    rideshareDestinationName: 'Seattle-Tacoma International Airport',
    geoLocation: { lat: 47.4502, lng: -122.3088 },
    checkinNote: 'Use airline-specific check-in guidance when available. Otherwise, use the main terminal check-in area.',
    genericGuidance: 'Confirm terminal, gate, and check-in area with your airline before leaving.',
    officialParkingUrl: 'https://www.portseattle.org/sea/parking',
    officialAirportUrl: 'https://www.portseattle.org/sea-tac',
    indoorMap: {
      provider: 'official',
      label: 'Official terminal map and airport guidance',
      sourceName: 'Port of Seattle',
      url: 'https://maps.flysea.org/',
      embedUrl: 'https://maps.flysea.org/',
      embeddable: true,
    },
  },
  {
    id: 'PAE',
    label: 'Paine Field',
    destinationName: 'Paine Field Airport',
    routingAddress: 'Paine Field Passenger Terminal (PAE), 3308 100th St SW, Everett, WA 98204',
    parkingSearchQuery: 'PAE airport parking',
    rideshareDestinationName: 'Paine Field Passenger Terminal',
    geoLocation: { lat: 47.9063, lng: -122.2816 },
    checkinNote: 'Use the Paine Field passenger terminal. Confirm airline check-in and gate details before leaving.',
    genericGuidance: 'Smaller airport, but still confirm flight status and boarding time with your airline.',
    officialParkingUrl: 'https://www.painefield.com/parking-transportation',
  },
  {
    id: 'BLI',
    label: 'Bellingham International Airport',
    destinationName: 'Bellingham International Airport',
    routingAddress: 'Bellingham International Airport (BLI), 4255 Mitchell Way, Bellingham, WA 98226',
    parkingSearchQuery: 'BLI airport parking',
    rideshareDestinationName: 'Bellingham International Airport',
    geoLocation: { lat: 48.7928, lng: -122.5375 },
    checkinNote: 'Use the main passenger terminal. Confirm airline check-in and gate details before leaving.',
    genericGuidance: 'Confirm flight status and airport arrival guidance with your airline.',
    officialParkingUrl: 'https://www.portofbellingham.com/91/Parking',
  },
  {
    id: 'GEG',
    label: 'Spokane International Airport',
    destinationName: 'Spokane International Airport',
    routingAddress: 'Spokane International Airport (GEG), 9000 W Airport Dr, Spokane, WA 99224',
    parkingSearchQuery: 'GEG airport parking',
    rideshareDestinationName: 'Spokane International Airport',
    geoLocation: { lat: 47.6199, lng: -117.5338 },
    checkinNote: 'Use your airline’s terminal/check-in area. Confirm gate and flight status before leaving.',
    genericGuidance: 'Confirm flight status, terminal, and check-in area with your airline.',
    officialParkingUrl: 'https://spokaneairports.net/parking/',
  },
  {
    id: 'PSC',
    label: 'Tri-Cities Airport',
    destinationName: 'Tri-Cities Airport',
    routingAddress: 'Tri-Cities Airport (PSC), 3601 N 20th Ave, Pasco, WA 99301',
    parkingSearchQuery: 'PSC airport parking',
    rideshareDestinationName: 'Tri-Cities Airport',
    geoLocation: { lat: 46.2647, lng: -119.1190 },
    checkinNote: 'Use the main passenger terminal. Confirm airline check-in and gate details before leaving.',
    genericGuidance: 'Confirm flight status and boarding details with your airline.',
    officialParkingUrl: 'https://www.flytricities.com/parking/',
  },
  {
    id: 'YKM',
    label: 'Yakima Air Terminal',
    destinationName: 'Yakima Air Terminal',
    routingAddress: 'Yakima Air Terminal (YKM), 2406 W Washington Ave, Yakima, WA 98903',
    parkingSearchQuery: 'YKM airport parking',
    rideshareDestinationName: 'Yakima Air Terminal',
    geoLocation: { lat: 46.5682, lng: -120.5441 },
    checkinNote: 'Use the main passenger terminal. Confirm airline check-in and flight status before leaving.',
    genericGuidance: 'Confirm flight status and boarding details with your airline.',
    officialParkingUrl: 'https://flyykm.com/',
  },
];

export function getAirportById(id: string): AirportInfo | null {
  const upperId = id.toUpperCase();
  return AIRPORTS_CATALOG.find((a) => a.id === upperId) || null;
}

export function getAirportOrFallback(id?: string): AirportInfo {
  if (id) {
    const found = getAirportById(id);
    if (found) return found;
  }

  return AIRPORTS_CATALOG[0];
}