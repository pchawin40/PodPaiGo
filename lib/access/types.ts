import type {
  ParkingOption,
  ParkAndRideParkingRules,
  RideshareOption,
  TransitOption,
  PriceDisplay,
  TrustStatus,
  ParkingPriceSource,
  PriceConfidence,
} from '../types';
import type { PriceFreshness } from '../providers/parking/types';

export type PricingConfidenceLabel =
  | 'live'
  | 'recent'
  | 'official'
  | 'estimated'
  | 'final_on_provider';

export type StrategyType =
  | 'official_airport_parking'
  | 'off_airport_shuttle'
  | 'park_and_ride_transit'
  | 'rideshare'
  | 'transit_only'
  | 'dropoff';

export type DollarRange = {
  min: number;
  max: number;
  currency: 'USD';
};

export type AccessPriceBreakdown = {
  parking?: DollarRange;
  transit?: DollarRange;
  rideshare?: DollarRange;
  fuel?: DollarRange;
  other?: DollarRange;
};

export type AccessPriceEstimate = {
  total: DollarRange;
  unit: 'trip_total' | 'per_day';
  confidence: PricingConfidenceLabel;
  breakdown: AccessPriceBreakdown;
  displayPrimary: string;
  displaySecondary?: string;
  sourceNotes?: string;
};

export type AccessTimeEstimate = {
  terminalReadyMinutes: number;
  driveMinutes?: number;
  walkMinutes?: number;
  transitMinutes?: number;
  shuttleMinutes?: number;
  assumptions: string[];
};

export type AccessStrategyOption = {
  id: string;
  airportCode: string;
  displayName: string;
  strategyType: StrategyType;
  sourceKind: 'parking' | 'rideshare' | 'transit' | 'curated';
  sourceOption?: ParkingOption | RideshareOption | TransitOption;
  pricing: AccessPriceEstimate;
  timing: AccessTimeEstimate;
  easeScore: number;
  stressScore: number;
  confidenceScore: number;
  overnightCaveat?: string;
  parkAndRideRules?: ParkAndRideParkingRules;
  /** False when overnight/multi-day rules are unknown or disallow leaving a car. */
  recommendedForTrip?: boolean;
  notRecommendedReason?: string;
  explanation: string;
  bestFor?: string[];
  isHiddenGem?: boolean;
  sourceNotes: string;
  mapLink?: string;
  sourceLink?: string;
  rankScore?: number;
};

export type AccessRankingResult = {
  options: AccessStrategyOption[];
  topPickId?: string;
  rankedBy: ('cost' | 'time' | 'ease' | 'confidence')[];
};

export type SeaCuratedHubDefinition = {
  id: string;
  displayName: string;
  hubPlaceName: string;
  lat: number;
  lng: number;
  strategyType: 'park_and_ride_transit';
  parking: {
    min: number;
    max: number;
    unit: 'trip_total';
    overnightRules: string;
    sourceNotes: string;
  };
  transit: {
    min: number;
    max: number;
    mode: 'link';
    sourceNotes: string;
  };
  timing: {
    linkRideMinutes: number;
    walkToPlatformMinutes: number;
    driveTimeFactorMinutes: number;
  };
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
  bestFor: string[];
  enabled: boolean;
};

export type PriceableParkingLike = {
  price: number;
  priceMin?: number;
  priceMax?: number;
  priceDisplay?: PriceDisplay;
  priceUnit?: ParkingOption['priceUnit'];
  priceSource?: ParkingPriceSource;
  priceConfidence?: PriceConfidence;
  priceFreshness?: PriceFreshness;
  priceNote?: string;
  pricingConfidence?: PricingConfidenceLabel;
  type?: ParkingOption['type'];
  trustStatus?: TrustStatus;
  sourceName?: string;
  bookingProvider?: string;
  providerSource?: string;
  fetchedAt?: string;
};

export type ParkingPriceDisplayLine = {
  primary: string;
  secondary: string | null;
  confidence: PricingConfidenceLabel;
  badge?: string | null;
};
