import { AirportInfo } from './types';

export const AIRPORTS_FALLBACK_CATALOG: AirportInfo[] = [
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
  },
];