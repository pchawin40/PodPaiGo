export type TripType =
  | 'one-way-departure'
  | 'one-way-arrival'
  | 'round-trip'
  | 'dropoff-pickup';

export type TripData =
  | {
      type: 'one-way-departure';
      origin: string;
      destination: string;
      departureDate: string;
      departureTime: string;
      parkingDuration?: number; // in minutes, optional user override
    }
  | {
      type: 'one-way-arrival';
      origin: string;
      destination: string;
      arrivalDate: string;
      arrivalTime: string;
    }
  | {
      type: 'round-trip';
      origin: string;
      destination: string;
      departureDate: string;
      departureTime: string;
      returnDate: string;
      returnTime: string;
      parkingDuration?: number; // in minutes, optional user override
    }
  | {
      type: 'dropoff-pickup';
      origin: string;
      destination: string;
      airportTripDate: string;
      airportTripTime: string;
    };

export type TrustStatus = 'live' | 'verified-source' | 'estimated' | 'fallback';

export type PriceDisplay =
  | 'live'
  | 'estimated'
  | 'mock'
  | 'check-live'
  | 'from-per-day';

export type PriceUnit = 'total' | 'per-day';

export type ParkingOption = {
  id: string;
  name: string;
  type: 'official' | 'off-airport';
  /**
   * Internal numeric price used by the recommendation engine.
   * UI may hide this if `priceDisplay` is not `live`.
   */
  price: number;
  /**
   * How the UI should present this price.
   * Default: derived from trust status (legacy).
   */
  priceDisplay?: PriceDisplay;
  /** If `priceDisplay` is `from-per-day`, interpret `price` as a daily rate. */
  priceUnit?: PriceUnit;
  /** Extra context shown next to pricing (e.g. "Check live price", "Mock data"). */
  priceNote?: string;
  distance: number; // in minutes
  availability: number; // percentage
  trustStatus: TrustStatus;
  routeTrustStatus?: TrustStatus;
  routeOrigin?: string;
  routeDestination?: string;
  sourceName: string;
  sourceLink?: string;
  mapLink?: string;
  lastUpdated: string; // ISO timestamp
  assumptions: string[];
};

export type RideshareOption = {
  id: string;
  name: string;
  /** Internal numeric price used by the recommendation engine (may be estimated/mock). */
  price: number;
  priceDisplay?: PriceDisplay;
  priceUnit?: PriceUnit;
  priceNote?: string;
  duration: number; // in minutes
  availability: number;
  trustStatus: TrustStatus;
  routeTrustStatus?: TrustStatus;
  routeOrigin?: string;
  routeDestination?: string;
  sourceName: string;
  sourceLink?: string;
  mapLink?: string;
  lastUpdated: string; // ISO timestamp
  assumptions: string[];
};

export type TransitOption = {
  id: string;
  name: string;
  /** Fare (usually verified-source, but still not "live"). */
  price: number;
  priceDisplay?: PriceDisplay;
  priceUnit?: PriceUnit;
  priceNote?: string;
  duration: number;
  frequency: number; // minutes between services
  availability?: number;
  trustStatus: TrustStatus;
  routeTrustStatus?: TrustStatus;
  routeOrigin?: string;
  routeDestination?: string;
  sourceName: string;
  sourceLink?: string;
  mapLink?: string;
  lastUpdated: string; // ISO timestamp
  assumptions: string[];
};

export type TransitSegment = {
  mode: 'drive' | 'walk' | 'bus' | 'light-rail' | 'train' | 'ferry';
  name: string;
  duration: number; // in minutes
  distance?: number; // in miles, for drive segments
  cost: number;
  frequency?: number; // for scheduled transit
};

export type TransitJourney = TransitOption & {
  id: string;
  name: string;
  totalDuration: number; // total door-to-door time in minutes
  totalCost: number;
  segments: TransitSegment[];
  transfers: number; // number of transfers
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