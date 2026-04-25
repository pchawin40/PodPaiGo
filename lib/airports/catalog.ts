'use strict';

export type AirportInfo = {
  id: string; // IATA code
  label: string;
  destinationName: string; // e.g., airport display name
  geoLocation: { lat: number; lng: number };
  checkinNote?: string;
  genericGuidance?: string;
};

export const AIRPORTS_CATALOG: AirportInfo[] = [
  {
    id: 'SEA',
    label: 'Seattle-Tacoma International Airport',
    destinationName: 'SeaTac Airport',
    geoLocation: { lat: 47.4502, lng: -122.3088 },
    checkinNote: 'SeaTac main terminal check-in',
  },
  {
    id: 'JFK',
    label: 'John F. Kennedy International Airport',
    destinationName: 'JFK Airport',
    geoLocation: { lat: 40.6413, lng: -73.7781 },
    genericGuidance: 'Use your airline departure or arrival information when planning your trip.',
  },
  {
    id: 'LAX',
    label: 'Los Angeles International Airport',
    destinationName: 'LAX Airport',
    geoLocation: { lat: 33.9416, lng: -118.4085 },
    genericGuidance: 'Use your airline departure or arrival information when planning your trip.',
  },
  {
    id: 'ORD',
    label: 'Chicago O’Hare International Airport',
    destinationName: 'O’Hare Airport',
    geoLocation: { lat: 41.9742, lng: -87.9073 },
    genericGuidance: 'Use your airline departure or arrival information when planning your trip.',
  },
  {
    id: 'ATL',
    label: 'Hartsfield-Jackson Atlanta International Airport',
    destinationName: 'Atlanta Airport',
    geoLocation: { lat: 33.6407, lng: -84.4277 },
    genericGuidance: 'Use your airline departure or arrival information when planning your trip.',
  },
  // Add more as needed
];

export function getAirportById(id: string): AirportInfo | null {
  const upperId = id.toUpperCase();
  return AIRPORTS_CATALOG.find((a) => a.id === upperId) || null;
}
