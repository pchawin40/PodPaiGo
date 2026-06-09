import type { ParkAndRideRuleConfidence, TransitPaymentOption } from '../types';
import type { PointAbSortMode } from './pointAbRanking';

export type ParkRideMetroStatus =
  | 'connected'
  | 'no_useful_connection'
  | 'data_not_available';

export type ParkRideAvailabilityTier =
  | 'data_not_available'
  | 'not_recommended'
  | 'backup_available'
  | 'recommended';

export type ParkAndRideLotStatusLabel =
  | 'Long detour'
  | 'Too far from origin'
  | 'Slow transit connection'
  | 'Not recommended'
  | 'Useful backup'
  | 'Best pick'
  | 'Check rules';

export type ParkAndRideOperator =
  | 'Sound Transit'
  | 'King County Metro'
  | 'WSDOT'
  | 'CapMetro'
  | 'City'
  | 'Other';

export type ParkAndRideLotConfidence = 'high' | 'medium' | 'low';
export type ParkAndRidePriceConfidence = 'verified' | 'estimated' | 'unknown';
export type ParkAndRideTransitFareConfidence = 'known' | 'estimated' | 'pass' | 'unknown';
export type ParkAndRideTimingBasis =
  | 'selected_arrival_estimate'
  | 'selected_trip_estimate'
  | 'current_estimate'
  | 'schedule_unconfirmed';
export type ParkAndRideScheduleConfidence = 'scheduled' | 'current' | 'unconfirmed';

export type ParkAndRideCostEstimate = {
  min: number;
  max: number;
  display: string;
  parkingDisplay: string;
  transitFareDisplay: string;
  parkingMin: number;
  parkingMax: number;
  transitFareMin: number;
  transitFareMax: number;
  parkingPriceConfidence: ParkAndRidePriceConfidence;
  transitFareConfidence: ParkAndRideTransitFareConfidence;
};

export type ParkAndRideOption = {
  id: string;
  lotName: string;
  address: string;
  lat: number;
  lng: number;
  operator: ParkAndRideOperator;
  agencyName?: string;
  capacity?: number;
  routesServed: string[];
  maxParkingDuration?: string;
  permitInfo?: string;
  rulesUrl: string;
  sourceUrl?: string;
  directionsToLotUrl?: string;
  transitRouteUrl?: string;
  totalTimeMinutes?: number;
  driveToLotMinutes?: number;
  transitMinutes?: number;
  walkMinutes?: number;
  waitMinutes?: number;
  costEstimate?: ParkAndRideCostEstimate;
  confidence: ParkAndRideLotConfidence;
  ruleConfidence: ParkAndRideRuleConfidence;
  overnightAllowed: boolean;
  parkingPriceConfidence: ParkAndRidePriceConfidence;
  transitFareConfidence: ParkAndRideTransitFareConfidence;
  timingBasis: ParkAndRideTimingBasis;
  timingBasisLabel: string;
  scheduleConfidence: ParkAndRideScheduleConfidence;
  scheduleConfidenceLabel: string;
  warnings: string[];
  isRecommended: boolean;
  unavailableReason?: string;
  selectionReason?: string;
  selectionScore?: number;
  lotStatusLabel?: ParkAndRideLotStatusLabel;
  timeDeltaLabel?: string;
  metroId?: string;
  metroName?: string;
  tripPlannerUrl?: string;
};

export type ParkAndRideDetailsSection = {
  title: string;
  lines: string[];
};

export type ParkAndRideRulesLinkLabel = 'Open lot rules' | 'Search lot rules';

export type ParkAndRideLotCard = {
  id: string;
  lotName: string;
  provider: string;
  address: string;
  parkingRuleSummary: string;
  costDisplay: string;
  transitTimeDisplay: string;
  totalTimeDisplay: string;
  confidence: ParkAndRideLotConfidence;
  confidenceLabel: string;
  confidenceDescription: string;
  statusLabel: ParkAndRideLotStatusLabel;
  parkingCostDisplay: string;
  transitFareDisplay: string;
  timeDeltaLabel?: string;
  timingBasisLabel: string;
  scheduleConfidenceLabel: string;
  rulesUrl: string;
  rulesLinkLabel: ParkAndRideRulesLinkLabel;
  directionsToLotUrl?: string;
  transitRouteUrl?: string;
  unavailableReason?: string;
  warnings: string[];
};

export type ParkAndRideDetailsPanel = {
  lotName: string;
  operator: string;
  address: string;
  rulesUrl: string;
  routesServed: string[];
  parkingRuleSummary: string;
  maxDuration?: string;
  verifySignsWarning: string;
  timingBasisLabel: string;
  scheduleConfidenceLabel: string;
  routeBreakdown: {
    driveMinutes: number | null;
    transitMinutes: number | null;
    walkMinutes: number | null;
    waitMinutes: number | null;
    totalMinutes: number | null;
  };
  selectionReason?: string;
  unavailableReason?: string;
  warnings: string[];
  lots: ParkAndRideLotCard[];
  sections: ParkAndRideDetailsSection[];
};

export type ParkAndRideSelectionInput = {
  origin: string;
  originLat?: number;
  originLng?: number;
  destination: string;
  destinationLat?: number;
  destinationLng?: number;
  parkingDurationMinutes: number;
  isAirportTrip: boolean;
  sort?: PointAbSortMode;
  arrivalDate?: string;
  arrivalTime?: string;
  transitPayment?: TransitPaymentOption;
  parkingTotal?: number | null;
  weatherRisk?: 'low' | 'medium' | 'high';
};

export type ParkAndRideSelectionResult = {
  best: ParkAndRideOption | null;
  candidates: ParkAndRideOption[];
  metroStatus: ParkRideMetroStatus;
  availabilityTier: ParkRideAvailabilityTier;
  cardHeadline: string;
  metroId?: string;
  metroName?: string;
  tripPlannerUrl?: string;
  notUsefulReason?: string;
};

export type PointAbParkRidePresentation = {
  lotName: string;
  displayName: string;
  costDisplay: string;
  costNote?: string;
  cost: number | null;
  durationMinutes: number | null;
  reliable: boolean;
  confidenceScore: number;
  recommended: boolean;
  availabilityTier: ParkRideAvailabilityTier;
  cardHeadline: string;
  timingBasisLabel?: string;
  scheduleConfidenceLabel?: string;
  timingIsEstimated?: boolean;
  hasCandidates: boolean;
  unavailableReason?: string;
  pros: string[];
  cons: string[];
  warnings: string[];
  rulesUrl?: string;
  directionsToLotUrl?: string;
  transitRouteUrl?: string;
  transitPlannerUrl?: string;
  details: ParkAndRideDetailsPanel;
};
