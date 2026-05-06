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

  // Optional structured data for future PodPaiGo guidance
  terminals?: AirportTerminal[];
  checkinAreas?: AirportCheckinArea[];
  terminalZones?: AirportTerminalZone[];
};

export const AIRPORTS_CATALOG: AirportInfo[] = [
  {
    id: 'SEA',
    label: 'Seattle-Tacoma International Airport',
    destinationName: 'SeaTac Airport',
    routingAddress:
      'Seattle-Tacoma International Airport (SEA), 17801 International Blvd, SeaTac, WA 98158',
    parkingSearchQuery: 'SEA airport parking',
    rideshareDestinationName: 'Seattle-Tacoma International Airport',
    geoLocation: { lat: 47.4502, lng: -122.3088 },
    checkinNote: 'SeaTac main terminal check-in',
    genericGuidance:
      'Use your airline app or airport flight display to confirm gate and terminal changes.',
    officialParkingUrl: 'https://www.portseattle.org/sea/parking',
    officialAirportUrl: 'https://www.portseattle.org/sea-tac',
    airportMap: {
      label: 'Official SEA terminal map',
      url: 'https://www.portseattle.org/sea-tac/maps',
      sourceName: 'Port of Seattle',
      trustStatus: 'verified-source',
    },
    indoorMap: {
      provider: 'atrius',
      label: 'SEA interactive terminal map',
      url: 'https://maps.flysea.org/',
      embedUrl: 'https://maps.flysea.org/',
      embeddable: true,
      sourceName: 'Port of Seattle / flySEA',
    },
    terminals: [
      {
        id: 'main-terminal',
        label: 'Main Terminal',
        notes: 'Main check-in, ticketing, baggage, and security areas.',
      },
      {
        id: 'concourses',
        label: 'Concourses',
        notes: 'Gate areas are reached after security, including satellite concourses.',
      },
    ],
    checkinAreas: [
      {
        id: 'general-checkin',
        label: 'General airline check-in',
        terminal: 'Main Terminal',
        notes:
          'Check your airline app or confirmation email for counter and gate details.',
      },
    ],
  },
  {
    id: 'JFK',
    label: 'John F. Kennedy International Airport',
    destinationName: 'JFK Airport',
    routingAddress: 'John F. Kennedy International Airport (JFK), Queens, NY 11430',
    parkingSearchQuery: 'JFK airport parking',
    rideshareDestinationName: 'John F. Kennedy International Airport',
    geoLocation: { lat: 40.6413, lng: -73.7781 },
    genericGuidance:
      'JFK uses multiple terminals. Confirm your airline terminal and gate before leaving.',
    officialParkingUrl: 'https://www.jfkairport.com/parking',
    officialAirportUrl: 'https://www.jfkairport.com/',
    airportMap: {
      label: 'Official JFK airport map',
      url: 'https://www.jfkairport.com/at-airport/airport-maps',
      sourceName: 'JFK Airport',
      trustStatus: 'verified-source',
    },
    indoorMap: {
      provider: 'link-only',
      label: 'Official JFK airport map',
      url: 'https://www.jfkairport.com/at-airport/airport-maps',
      embeddable: false,
      sourceName: 'JFK Airport',
    },
  },
  {
    id: 'LAX',
    label: 'Los Angeles International Airport',
    destinationName: 'LAX Airport',
    routingAddress:
      'Los Angeles International Airport (LAX), 1 World Way, Los Angeles, CA 90045',
    parkingSearchQuery: 'LAX airport parking',
    rideshareDestinationName: 'Los Angeles International Airport',
    geoLocation: { lat: 33.9416, lng: -118.4085 },
    genericGuidance:
      'LAX has multiple terminals around the central loop. Confirm your airline terminal and gate before leaving.',
    officialParkingUrl: 'https://www.flylax.com/parking',
    officialAirportUrl: 'https://www.flylax.com/',
    airportMap: {
      label: 'Official LAX airport map',
      url: 'https://www.flylax.com/lax-map',
      sourceName: 'Los Angeles World Airports',
      trustStatus: 'verified-source',
    },
    indoorMap: {
      provider: 'link-only',
      label: 'Official LAX airport map',
      url: 'https://www.flylax.com/lax-map',
      embeddable: false,
      sourceName: 'Los Angeles World Airports',
    },
  },
  {
    id: 'ORD',
    label: 'Chicago O’Hare International Airport',
    destinationName: 'O’Hare Airport',
    routingAddress:
      'Chicago O’Hare International Airport (ORD), 1600 W O’Hare Blvd, Chicago, IL 60660',
    parkingSearchQuery: 'ORD airport parking',
    rideshareDestinationName: 'Chicago O’Hare International Airport',
    geoLocation: { lat: 41.9742, lng: -87.9073 },
    genericGuidance:
      'O’Hare has multiple terminals. Confirm your airline terminal and gate before leaving.',
    officialParkingUrl: 'https://www.flychicago.com/ohare/tofrom/parking/Pages/default.aspx',
    officialAirportUrl: 'https://www.flychicago.com/ohare/home/pages/default.aspx',
    airportMap: {
      label: 'Official ORD airport map',
      url: 'https://www.flychicago.com/ohare/map/pages/default.aspx',
      sourceName: 'Fly Chicago',
      trustStatus: 'verified-source',
    },
    indoorMap: {
      provider: 'link-only',
      label: 'Official ORD airport map',
      url: 'https://www.flychicago.com/ohare/map/pages/default.aspx',
      embeddable: false,
      sourceName: 'Fly Chicago',
    },
  },
  {
    id: 'ATL',
    label: 'Hartsfield-Jackson Atlanta International Airport',
    destinationName: 'Atlanta Airport',
    routingAddress:
      'Hartsfield-Jackson Atlanta International Airport (ATL), 6000 N Terminal Pkwy, Atlanta, GA 30320',
    parkingSearchQuery: 'ATL airport parking',
    rideshareDestinationName: 'Hartsfield-Jackson Atlanta International Airport',
    geoLocation: { lat: 33.6407, lng: -84.4277 },
    genericGuidance:
      'ATL has domestic and international terminal areas. Confirm your airline terminal and gate before leaving.',
    officialParkingUrl: 'https://www.atl.com/parking/',
    officialAirportUrl: 'https://www.atl.com/',
    airportMap: {
      label: 'Official ATL airport map',
      url: 'https://www.atl.com/maps/',
      sourceName: 'ATL Airport',
      trustStatus: 'verified-source',
    },
    indoorMap: {
      provider: 'link-only',
      label: 'Official ATL airport map',
      url: 'https://www.atl.com/maps/',
      embeddable: false,
      sourceName: 'ATL Airport',
    },
    terminals: [
      { id: 'domestic-terminal', label: 'Domestic Terminal' },
      {
        id: 'international-terminal',
        label: 'Maynard H. Jackson Jr. International Terminal',
      },
    ],
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