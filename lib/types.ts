export type TripType =
  | 'one-way-departure'
  | 'one-way-arrival'
  | 'round-trip'
  | 'dropoff-pickup';

export type TripData =
  | {
      type: 'one-way-departure';
      departureDate: string;
      departureTime: string;
      destination: string; // renamed from terminal
    }
  | {
      type: 'one-way-arrival';
      arrivalDate: string;
      arrivalTime: string;
      destination: string; // renamed from terminal
    }
  | {
      type: 'round-trip';
      departureDate: string;
      departureTime: string;
      returnDate: string;
      returnTime: string;
      destination: string; // renamed from terminal
    }
  | {
      type: 'dropoff-pickup';
      airportTripDate: string;
      airportTripTime: string;
      destination: string; // renamed from terminal
    };

export type TrustStatus = 'live' | 'verified-source' | 'estimated' | 'fallback';

export type ParkingOption = {
  id: string;
  name: string;
  type: 'official' | 'off-airport';
  price: number;
  distance: number; // in minutes
  availability: number; // percentage
  trustStatus: TrustStatus;
  sourceName: string;
  sourceLink?: string;
  mapLink?: string;
  lastUpdated: string; // ISO timestamp
  assumptions: string[];
};

export type RideshareOption = {
  id: string;
  name: string;
  price: number;
  duration: number; // in minutes
  availability: number;
  trustStatus: TrustStatus;
  sourceName: string;
  sourceLink?: string;
  mapLink?: string;
  lastUpdated: string; // ISO timestamp
  assumptions: string[];
};

export type TransitOption = {
  id: string;
  name: string;
  price: number;
  duration: number;
  frequency: number; // minutes between services
  trustStatus: TrustStatus;
  sourceName: string;
  sourceLink?: string;
  mapLink?: string;
  lastUpdated: string; // ISO timestamp
  assumptions: string[];
};

export type TrafficEstimate = {
  route: string;
  duration: number;
  congestion: 'low' | 'medium' | 'high';
  trustStatus: TrustStatus;
  sourceName: string;
  lastUpdated: string;
  assumptions: string[];
};

export type FlightInfo = {
  destination: string; // renamed from terminal
  status: string;
  gate: string;
  scheduledTime: string;
  trustStatus: TrustStatus;
  sourceName: string;
  lastUpdated: string;
  assumptions: string[];
};

export type LocationInfo = { // renamed from AirportInfo
  destination: string; // renamed from terminal
  name: string;
  services: string[];
  trustStatus: TrustStatus;
  sourceName: string;
  lastUpdated: string;
  assumptions: string[];
};

export type TsaDataStatus = 'live' | 'estimated' | 'fallback';

export type TsaEstimate = {
  destination: string; // renamed from terminal
  waitTime: number; // minutes
  status: TsaDataStatus;
  lastUpdated?: string; // ISO timestamp
  trustStatus: TrustStatus;
  sourceName: string;
  assumptions: string[];
};

export type Recommendation = {
  parking: ParkingOption[];
  rideshare: RideshareOption[];
  transit: TransitOption[];
  tsaEstimate: TsaEstimate; // Updated to include status
  leaveByTime?: string | null; // for departures
  tripDuration?: number; // in minutes for round-trip
  trafficEstimate?: TrafficEstimate;
  flightInfo?: FlightInfo;
  locationInfo?: LocationInfo; // renamed from airportInfo
};