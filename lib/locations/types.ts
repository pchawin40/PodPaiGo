/**
 * Location model prep for national Point A -> B expansion.
 * Airport mirrors catalog fields used today; full national DB comes in Phase 1.
 */
export type LocationType =
  | 'airport'
  | 'cruise_port'
  | 'train_station'
  | 'hotel'
  | 'venue'
  | 'custom';

export interface Airport {
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
}

export type AirportLookup = (code: string) => Airport | null;
