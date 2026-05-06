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
  airportMapUrl?: string;
  airportMapLabel?: string;
  state?: string;
  country?: string;
  isActive?: boolean;
  sortOrder?: number;
};