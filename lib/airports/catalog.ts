'use strict';

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
    checkinNote: 'SeaTac main terminal check-in',
    officialParkingUrl: 'https://www.portseattle.org/sea/parking'
  },
  {
    id: 'JFK',
    label: 'John F. Kennedy International Airport',
    destinationName: 'JFK Airport',
    routingAddress: 'John F. Kennedy International Airport (JFK), Queens, NY 11430',
    parkingSearchQuery: 'JFK airport parking',
    rideshareDestinationName: 'John F. Kennedy International Airport',
    geoLocation: { lat: 40.6413, lng: -73.7781 },
    genericGuidance: 'Use your airline departure or arrival information when planning your trip.',
    officialParkingUrl: 'https://www.jfkairport.com/parking'
  },
  {
    id: 'LAX',
    label: 'Los Angeles International Airport',
    destinationName: 'LAX Airport',
    routingAddress: 'Los Angeles International Airport (LAX), 1 World Way, Los Angeles, CA 90045',
    parkingSearchQuery: 'LAX airport parking',
    rideshareDestinationName: 'Los Angeles International Airport',
    geoLocation: { lat: 33.9416, lng: -118.4085 },
    genericGuidance: 'Use your airline departure or arrival information when planning your trip.',
    officialParkingUrl: 'https://www.flylax.com/parking'
  },
  {
    id: 'ORD',
    label: 'Chicago O’Hare International Airport',
    destinationName: 'O’Hare Airport',
    routingAddress: 'Chicago O’Hare International Airport (ORD), 1600 W O’Hare Blvd, Chicago, IL 60660',
    parkingSearchQuery: 'ORD airport parking',
    rideshareDestinationName: 'Chicago O’Hare International Airport',
    geoLocation: { lat: 41.9742, lng: -87.9073 },
    genericGuidance: 'Use your airline departure or arrival information when planning your trip.',
    officialParkingUrl: 'https://www.flyord.com/parking'
  },
  {
    id: 'ATL',
    label: 'Hartsfield-Jackson Atlanta International Airport',
    destinationName: 'Atlanta Airport',
    routingAddress: 'Hartsfield-Jackson Atlanta International Airport (ATL), 6000 N TerminalPkwy, Atlanta, GA 30320',
    parkingSearchQuery: 'ATL airport parking',
    rideshareDestinationName: 'Hartsfield-Jackson Atlanta International Airport',
    geoLocation: { lat: 33.6407, lng: -84.4277 },
    genericGuidance: 'Use your airline departure or arrival information when planning your trip.',
    officialParkingUrl: 'https://www.atlanta-airport.com/parking'
  },
  // Add more as needed
];

export function getAirportById(id: string): AirportInfo | null {
  const upperId = id.toUpperCase();
  return AIRPORTS_CATALOG.find((a) => a.id === upperId) || null;
}