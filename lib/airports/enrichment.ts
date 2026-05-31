import type { AirportInfo } from './types';

/**
 * PodPaiGo-specific enrichment for airports with rich UI metadata.
 * National coordinates/name come from OurAirports; these rows add maps, URLs, guidance.
 */
export const AIRPORT_ENRICHMENT: Record<string, Partial<AirportInfo>> = {
  SEA: {
    destinationName: 'SeaTac Airport',
    routingAddress:
      'Seattle-Tacoma International Airport (SEA), 17801 International Blvd, SeaTac, WA 98158',
    parkingSearchQuery: 'SEA airport parking',
    rideshareDestinationName: 'Seattle-Tacoma International Airport',
    checkinNote:
      'Use airline-specific check-in guidance when available. Otherwise, use the main terminal check-in area.',
    genericGuidance:
      'Confirm terminal, gate, and check-in area with your airline before leaving.',
    officialParkingUrl: 'https://www.portseattle.org/sea/parking',
    officialAirportUrl: 'https://www.portseattle.org/sea-tac',
    indoorMap: {
      provider: 'official',
      label: 'Official terminal map and airport guidance',
      sourceName: 'Port of Seattle',
      url: 'https://maps.flysea.org/',
      embedUrl: 'https://maps.flysea.org/',
      embeddable: true,
      mapType: 'official-indoor',
    },
  },
  PAE: {
    destinationName: 'Paine Field Airport',
    routingAddress:
      'Paine Field Passenger Terminal (PAE), 3308 100th St SW, Everett, WA 98204',
    parkingSearchQuery: 'PAE airport parking',
    rideshareDestinationName: 'Paine Field Passenger Terminal',
    checkinNote:
      'Use the Paine Field passenger terminal. Confirm airline check-in and gate details before leaving.',
    genericGuidance:
      'Smaller airport, but still confirm flight status and boarding time with your airline.',
    officialParkingUrl: 'https://www.painefield.com/parking-transportation',
    officialAirportUrl: 'https://flypainefield.com/',
    indoorMap: {
      provider: 'official',
      label: 'Official Paine Field terminal map',
      sourceName: 'Paine Field',
      url: 'https://flypainefield.com/img/terminal-map-043026.png',
      embedUrl: 'https://flypainefield.com/img/terminal-map-043026.png',
      embeddable: true,
    },
  },
  BLI: {
    destinationName: 'Bellingham International Airport',
    routingAddress:
      'Bellingham International Airport (BLI), 4255 Mitchell Way, Bellingham, WA 98226',
    parkingSearchQuery: 'BLI airport parking',
    rideshareDestinationName: 'Bellingham International Airport',
    officialParkingUrl: 'https://www.portofbellingham.com/91/Parking',
    officialAirportUrl: 'https://www.portofbellingham.com/89/Airport',
  },
  GEG: {
    destinationName: 'Spokane International Airport',
    routingAddress:
      'Spokane International Airport (GEG), 9000 W Airport Dr, Spokane, WA 99224',
    parkingSearchQuery: 'GEG airport parking',
    rideshareDestinationName: 'Spokane International Airport',
    officialParkingUrl: 'https://spokaneairports.net/parking/',
    officialAirportUrl: 'https://spokaneairports.net/',
  },
  PSC: {
    destinationName: 'Tri-Cities Airport',
    routingAddress:
      'Tri-Cities Airport (PSC), 3601 N 20th Ave, Pasco, WA 99301',
    parkingSearchQuery: 'PSC airport parking',
    rideshareDestinationName: 'Tri-Cities Airport',
    officialParkingUrl: 'https://www.flytricities.com/parking/',
    officialAirportUrl: 'https://www.flytricities.com/',
  },
  YKM: {
    destinationName: 'Yakima Air Terminal',
    routingAddress:
      'Yakima Air Terminal (YKM), 2406 W Washington Ave, Yakima, WA 98903',
    parkingSearchQuery: 'YKM airport parking',
    rideshareDestinationName: 'Yakima Air Terminal',
    officialParkingUrl: 'https://flyykm.com/',
    officialAirportUrl: 'https://flyykm.com/',
  },
};

export const ENRICHED_AIRPORT_CODES = Object.keys(AIRPORT_ENRICHMENT);

/** Search aliases not present in OurAirports keywords. */
export const AIRPORT_SEARCH_ALIASES: Record<string, string[]> = {
  SEA: ['seatac', 'sea-tac', 'seattle tacoma', 'seattle airport'],
  PAE: ['paine field', 'everett airport'],
  LAX: ['los angeles', 'la airport'],
  JFK: ['kennedy', 'new york jfk', 'nyc jfk'],
  ORD: ['ohare', "o'hare", 'chicago ohare', 'chicago airport'],
  ATL: ['hartsfield', 'atlanta airport'],
  DFW: ['dallas fort worth', 'dallas airport'],
  SFO: ['san francisco airport'],
  MDW: ['chicago midway', 'midway'],
  EWR: ['newark', 'newark airport'],
};
