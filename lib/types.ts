import { WeatherContext, WeatherImpact } from './weather/types';
import type { OptionIntelligence } from './intelligence/optionIntelligence';

export type TripType =
  | 'one-way-departure'
  | 'one-way-arrival'
  | 'round-trip'
  | 'dropoff-pickup';

export type TransportAvailability = 'car' | 'rideshare' | 'transit' | 'all';

export type SecurityOption = 'standard' | 'precheck' | 'clear' | 'clear-precheck';
export type FlightType = 'domestic' | 'international';
export type CabinClass = 'economy' | 'premium';

export type TransitPaymentOption = 'normal' | 'orca-pass';

type BaseTripData = {
  origin: string;
  destination: string;
  airportCode?: string;
  transportAvailability?: TransportAvailability;
  transitPayment?: TransitPaymentOption;
  parkingCheckInDate?: string;
  parkingCheckOutDate?: string;
};

export type TripData =
  | (BaseTripData & {
    type: 'one-way-departure';
    departureDate: string;
    departureTime: string;
    timeAnchor?: 'flight-departure' | 'airport-arrival'; // add this
    parkingDuration?: number;
    checkingBags?: boolean;
    securityOption?: SecurityOption;
    flightType?: FlightType;
    cabin?: CabinClass;
    checkedInAtAirport?: boolean;
  })
  | (BaseTripData & {
    type: 'one-way-arrival';
    arrivalDate: string;
    arrivalTime: string;
  })
  | (BaseTripData & {
    type: 'round-trip';
    departureDate: string;
    departureTime: string;
    returnDate: string;
    returnTime: string;
    parkingDuration?: number; // in minutes, optional user override
  })
  | (BaseTripData & {
    type: 'dropoff-pickup';
    airportTripDate: string;
    airportTripTime: string;
  });

export type TrustStatus = 'live' | 'verified-source' | 'estimated' | 'fallback';

export type PriceDisplay =
  | 'live'
  | 'estimated'
  | 'mock'
  | 'check-live'
  | 'from-per-day'
  | 'unavailable';

export type PriceUnit = 'total' | 'per-day';

export type ParkingPriceSource =
  | 'official-rate'
  | 'direct-lot-rate'
  | 'marketplace-link'
  | 'google-places'
  | 'estimated';

export type PriceConfidence = 'high' | 'medium' | 'low';

export type RideshareEstimateConfidence =
  | 'live-route-estimate'
  | 'baseline-estimate'
  | 'unavailable';

export type TransferLegType =
  | 'drive'
  | 'walk'
  | 'shuttle'
  | 'transit'
  | 'rideshare'
  | 'terminal';

export type TransferLeg = {
  type: TransferLegType;
  from: string;
  to: string;
  durationMinutes?: number;
  distanceMiles?: number;
  provider?: string;
  confidence: TrustStatus | 'unavailable';
  note?: string;
};

export type ParkingOption = {
  id: string;
  name: string;
  type: 'official' | 'off-airport';
  /** Minutes to park, pay, unload, etc. */
  parkingBufferMinutes?: number;
  /** Minutes from lot/garage to terminal (walk or shuttle). */
  transferToTerminalMinutes?: number;
  transferType?: 'walk' | 'shuttle' | 'airport-garage';
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
  priceSource?: ParkingPriceSource;
  priceConfidence?: PriceConfidence;
  distance: number; // in minutes
  availability: number; // percentage
  trustStatus: TrustStatus;
  routeTrustStatus?: TrustStatus;
  routeUnavailable?: boolean;
  routeUnavailableReason?: string;
  routeOrigin?: string;
  routeDestination?: string;
  sourceName: string;
  sourceLink?: string;
  mapLink?: string;
  lastUpdated: string; // ISO timestamp
  assumptions: string[];
  searchQuery?: string; // for marketplace options, the search query to use if direct link is not available 
  walkingMinutes?: number; // optional override for walking time to terminal, if transferType is 'walk'
  shuttleMinutes?: number; // optional override for shuttle time to terminal, if transferType is 'shuttle'
  covered?: boolean;
  reviewScore?: number; // e.g. from Google reviews, 0-5
  reviewCount?: number; // number of reviews, for context with reviewScore
  googleReviews?: ParkingGoogleReview[];
  googleReviewsFetchedAt?: string;
  googleReviewsExpiresAt?: string;
  googlePlaceName?: string;
  googlePlaceAddress?: string;
  googleMapsUri?: string;
  imageUrl?: string;
  images?: string[];
  availabilityScore?: number; // internal score for availability, used in ranking
  bookingProvider?: string; // e.g. "ParkWhiz", for marketplace options
  bestFor?: string[]; // e.g. ["short trips", "budget travelers"], for marketplace options
  availabilityStatus?: 'available' | 'unavailable' | 'unknown'; // simplified availability for UI display 
  isAvailable?: boolean; // legacy field, true if availabilityStatus is 'available'
  googlePlaceId?: string;
  providerLotId?: string;
  normalizedName?: string;
  normalizedAddress?: string;
  address?: string;
  canonicalLotKey?: string;
  lat?: number;
  lng?: number;
  shuttleWaitMinutes?: number;
  bufferRiskMinutes?: number;
  recommendedCheckpoint?: {
    name: string;
    minutes: number;
    reason: string;
  };

  checkpointWalkMinutes?: number;
  airportInsideRouteNote?: string;

  intelligence?: OptionIntelligence;
  transferLegs?: TransferLeg[];

  walkingBurdenScore?: number;
  walkingBurdenLabel?: string;

  stressScore?: number;
  stressLabel?: string;

  fullLotRiskScore?: number;
  fullLotRiskLabel?: string;

  rushPenaltyScore?: number;
  rushPenaltyLabel?: string;

  weatherPenaltyScore?: number;
  weatherPenaltyLabel?: string;

  shuttleReliabilityScore?: number;
  shuttleReliabilityLabel?: string;

  trueTotalCost?: number;
};

export type ParkingGoogleReview = {
  id: string;
  authorName?: string;
  displayName?: string;
  rating?: number;
  relativeTimeDescription?: string;
  publishedAt?: string;
  text?: string;
  profilePhotoUrl?: string;
  source: 'google-places';
};

export type ParkingGooglePlaceSnapshot = {
  parkingLotId?: number;
  airportCode: string;
  lotName: string;
  normalizedLotName: string;
  lotAddress?: string;
  googlePlaceId?: string;
  googlePlaceName?: string;
  googleFormattedAddress?: string;
  googleMapsUri?: string;
  rating?: number;
  reviewCount?: number;
  reviews: ParkingGoogleReview[];
  fetchedAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type RideshareOption = {
  id: string;
  name: string;
  /** Internal numeric price used by the recommendation engine (may be estimated/mock). */
  price: number;
  priceMin?: number;
  priceMax?: number;
  priceRangeLabel?: string;
  priceDisplay?: PriceDisplay;
  priceUnit?: PriceUnit;
  priceNote?: string;
  rideshareEstimateConfidence?: RideshareEstimateConfidence;
  distanceMiles?: number;
  routeDistanceMeters?: number;
  pickupWaitMinutes?: number;
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

  intelligence?: OptionIntelligence;
  transferLegs?: TransferLeg[];

  walkingBurdenScore?: number;
  walkingBurdenLabel?: string;

  stressScore?: number;
  stressLabel?: string;

  rushPenaltyScore?: number;
  rushPenaltyLabel?: string;

  weatherPenaltyScore?: number;
  weatherPenaltyLabel?: string;

  trueTotalCost?: number;
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

  intelligence?: OptionIntelligence;
  transferLegs?: TransferLeg[];

  walkingBurdenScore?: number;
  walkingBurdenLabel?: string;

  stressScore?: number;
  stressLabel?: string;

  rushPenaltyScore?: number;
  rushPenaltyLabel?: string;

  weatherPenaltyScore?: number;
  weatherPenaltyLabel?: string;

  trueTotalCost?: number;
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
  duration: number; // duration in minutes (traffic-aware)
  staticDuration?: number; // optional static duration in minutes (no-traffic typical)
  distanceMeters?: number;
  congestion: 'low' | 'medium' | 'high';
  trustStatus: TrustStatus;
  routeUnavailable?: boolean;
  routeUnavailableReason?: string;
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

export type TsaLane = 'standard' | 'precheck' | 'clear' | 'clear-precheck';

export type TsaDataStatus = 'live' | 'estimated' | 'fallback';

export type TsaEstimate = {
  destination: string;
  waitTime: number;
  waitTimes?: TsaWaitTimes;
  selectedLane?: TsaLane;
  plannedAirportArrivalAt?: string;
  timingBasis?: 'planned-arrival' | 'current-live';
  liveDataIsCurrentOnly?: boolean;

  bestCheckpoint?: {
    name: string;
    minutes: number;
    reason?: string;
  };

  status: TsaDataStatus;
  lastUpdated?: string;
  trustStatus: TrustStatus;
  sourceName: string;
  assumptions: string[];
};

export type TsaWaitTimes = {
  standard: number;
  precheck: number;
  clear: number;
  clearPrecheck: number;
};

export type Recommendation = {
  parking: ParkingOption[];
  rideshare: RideshareOption[];
  transit: TransitOption[];
  tsaEstimate: TsaEstimate;
  airportRouteUnavailable?: boolean;
  airportRouteUnavailableReason?: string;
  weatherImpact?: WeatherImpact | null;
  weatherContext?: WeatherContext;
  weatherForecastRangeStart?: string;
  weatherForecastRangeEnd?: string;
  leaveByTime?: string | null;
  tripDuration?: number;
  trafficEstimate?: TrafficEstimate;
  flightInfo?: FlightInfo;
  locationInfo?: LocationInfo;
};
