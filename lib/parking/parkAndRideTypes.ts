import type { ParkAndRideRuleConfidence } from '../types';
import type { PointAbSortMode } from './pointAbRanking';

export type ParkAndRideOperator = 'Sound Transit' | 'King County Metro' | 'WSDOT' | 'City' | 'Other';

export type ParkAndRideLotConfidence = 'high' | 'medium' | 'low';

export type ParkAndRideCostEstimate = {
  min: number;
  max: number;
  display: string;
};

export type ParkAndRideOption = {
  id: string;
  lotName: string;
  address: string;
  lat: number;
  lng: number;
  operator: ParkAndRideOperator;
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
  warnings: string[];
  isRecommended: boolean;
  unavailableReason?: string;
  selectionReason?: string;
  selectionScore?: number;
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
  statusLabel: string;
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
  parkingTotal?: number | null;
  weatherRisk?: 'low' | 'medium' | 'high';
};

export type ParkAndRideSelectionResult = {
  best: ParkAndRideOption | null;
  candidates: ParkAndRideOption[];
  notUsefulReason?: string;
};

export type PointAbParkRidePresentation = {
  lotName: string;
  displayName: string;
  costDisplay: string;
  cost: number | null;
  durationMinutes: number | null;
  reliable: boolean;
  confidenceScore: number;
  recommended: boolean;
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
