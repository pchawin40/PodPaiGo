import { calculateParkingDuration } from '../domain';
import type { ParkingOption, ParkAndRideParkingRules, TrafficEstimate, TripData } from '../types';
import {
  deriveParkingTotalRange,
} from './pricingLadder';
import type { AccessStrategyOption } from './types';

const PARK_AND_RIDE_NAME_PATTERNS = [
  'park & ride',
  'park and ride',
  'park-and-ride',
  'park n ride',
  'transit center',
  'transit centre',
  'link station',
  'light rail',
  'sound transit',
  'station parking',
  'narrows park',
  'northgate transit',
];

export const PARK_AND_RIDE_UI_COPY = {
  notRecommendedOvernight: 'Not recommended for overnight airport parking',
  verifyRules: 'Verify parking rules before leaving your car',
  sameDayCaveat: 'Best for same-day transit trips',
  unknownRulesNote: 'Parking rules are not confirmed. Best for same-day transit use only.',
  overnightCostUnavailable: 'Overnight parking cost not estimated',
} as const;

export const DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES: ParkAndRideParkingRules = {
  overnightAllowed: false,
  ruleConfidence: 'unknown',
  ruleNote: PARK_AND_RIDE_UI_COPY.unknownRulesNote,
};

export function isParkAndRideParkingOption(option: ParkingOption): boolean {
  if (option.type === 'park-and-ride') return true;
  if (option.transferType === 'transit') return true;

  const name = option.name.toLowerCase();
  return PARK_AND_RIDE_NAME_PATTERNS.some((pattern) => name.includes(pattern));
}

export function resolveParkAndRideRules(parking: ParkingOption): ParkAndRideParkingRules {
  if (parking.parkAndRideRules) {
    return parking.parkAndRideRules;
  }

  if (!isParkAndRideParkingOption(parking)) {
    return { ruleConfidence: 'unknown' };
  }

  return DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES;
}

export function isOvernightAirportParkingTrip(tripData: TripData): boolean {
  const parkingDurationMinutes = calculateParkingDuration(tripData);
  return (
    (tripData.type === 'one-way-departure' || tripData.type === 'round-trip') &&
    parkingDurationMinutes >= 18 * 60
  );
}

export function canConfirmOvernightParkAndRide(rules: ParkAndRideParkingRules): boolean {
  return rules.ruleConfidence === 'confirmed' && rules.overnightAllowed === true;
}

export function isParkAndRideRecommendedForTrip(
  rules: ParkAndRideParkingRules,
  tripData: TripData,
): boolean {
  if (!isOvernightAirportParkingTrip(tripData)) {
    return true;
  }

  return canConfirmOvernightParkAndRide(rules);
}

export function canEstimateParkAndRideParkingCost(
  rules: ParkAndRideParkingRules,
  tripData: TripData,
): boolean {
  if (!isOvernightAirportParkingTrip(tripData)) {
    return true;
  }

  return canConfirmOvernightParkAndRide(rules);
}

function formatMoneyRange(min: number, max: number): string {
  if (min === max) return `$${Math.round(min)}`;
  return `$${Math.round(min)}–$${Math.round(max)}`;
}

function transitFareRange(tripData: TripData): { min: number; max: number } {
  if (tripData.transitPayment === 'orca-pass') {
    return { min: 0, max: 0 };
  }

  const multiplier = tripData.type === 'round-trip' ? 2 : 1;
  return { min: 3 * multiplier, max: 6 * multiplier };
}

function estimateDriveMinutes(
  parking: ParkingOption,
  trafficEstimate: TrafficEstimate | undefined,
): number {
  if (
    trafficEstimate &&
    !trafficEstimate.routeUnavailable &&
    trafficEstimate.duration > 0
  ) {
    return Math.max(12, Math.round(trafficEstimate.duration * 0.55));
  }

  if (typeof parking.distance === 'number' && parking.distance > 0) {
    return Math.max(12, Math.round(parking.distance * 2.4));
  }

  return 25;
}

function buildSameDayPricing(
  parking: ParkingOption,
  tripData: TripData,
  transitRange: { min: number; max: number },
  rules: ParkAndRideParkingRules,
) {
  const parkingTotal = deriveParkingTotalRange(parking, tripData);
  const totalMin = parkingTotal.min + transitRange.min;
  const totalMax = parkingTotal.max + transitRange.max;

  return {
    total: { min: totalMin, max: totalMax, currency: 'USD' as const },
    unit: 'trip_total' as const,
    confidence: 'estimated' as const,
    breakdown: {
      parking: {
        min: parkingTotal.min,
        max: parkingTotal.max,
        currency: 'USD' as const,
      },
      transit: {
        min: transitRange.min,
        max: transitRange.max,
        currency: 'USD' as const,
      },
    },
    displayPrimary: `Estimated ${formatMoneyRange(totalMin, totalMax)} total`,
    displaySecondary: `Parking ${formatMoneyRange(parkingTotal.min, parkingTotal.max)} + transit ${formatMoneyRange(transitRange.min, transitRange.max)}`,
    sourceNotes: rules.ruleNote || parking.sourceName || 'Discovered park-and-ride listing',
  };
}

function buildOvernightUnknownPricing(
  transitRange: { min: number; max: number },
  rules: ParkAndRideParkingRules,
) {
  return {
    total: { min: transitRange.min, max: transitRange.max, currency: 'USD' as const },
    unit: 'trip_total' as const,
    confidence: 'estimated' as const,
    breakdown: {
      transit: {
        min: transitRange.min,
        max: transitRange.max,
        currency: 'USD' as const,
      },
    },
    displayPrimary: PARK_AND_RIDE_UI_COPY.notRecommendedOvernight,
    displaySecondary: `${PARK_AND_RIDE_UI_COPY.unknownRulesNote} Transit ${formatMoneyRange(transitRange.min, transitRange.max)} only — parking cost not estimated.`,
    sourceNotes: rules.ruleNote || PARK_AND_RIDE_UI_COPY.unknownRulesNote,
  };
}

export function buildParkAndRideAccessFromParking(
  parking: ParkingOption,
  tripData: TripData,
  airportCode: string,
  trafficEstimate?: TrafficEstimate,
): AccessStrategyOption {
  const overnight = isOvernightAirportParkingTrip(tripData);
  const rules = resolveParkAndRideRules(parking);
  const recommendedForTrip = isParkAndRideRecommendedForTrip(rules, tripData);
  const canEstimateParkingCost = canEstimateParkAndRideParkingCost(rules, tripData);
  const transitRange = transitFareRange(tripData);
  const driveMinutes = estimateDriveMinutes(parking, trafficEstimate);
  const walkMinutes = parking.walkingMinutes ?? 8;
  const transitMinutes =
    parking.transferToTerminalMinutes ?? parking.shuttleMinutes ?? 35;
  const terminalReadyMinutes = driveMinutes + walkMinutes + transitMinutes;

  const pricing = canEstimateParkingCost
    ? buildSameDayPricing(parking, tripData, transitRange, rules)
    : buildOvernightUnknownPricing(transitRange, rules);

  const overnightCaveat = overnight
    ? recommendedForTrip
      ? rules.ruleNote || PARK_AND_RIDE_UI_COPY.verifyRules
      : `${PARK_AND_RIDE_UI_COPY.notRecommendedOvernight}. ${PARK_AND_RIDE_UI_COPY.verifyRules}`
    : `${PARK_AND_RIDE_UI_COPY.sameDayCaveat}. ${PARK_AND_RIDE_UI_COPY.verifyRules}`;

  return {
    id: `park-and-ride-${parking.id}`,
    airportCode: airportCode.toUpperCase(),
    displayName: parking.name,
    strategyType: 'park_and_ride_transit',
    sourceKind: 'parking',
    sourceOption: parking,
    parkAndRideRules: rules,
    recommendedForTrip,
    notRecommendedReason: recommendedForTrip
      ? undefined
      : PARK_AND_RIDE_UI_COPY.notRecommendedOvernight,
    pricing,
    timing: {
      terminalReadyMinutes,
      driveMinutes,
      walkMinutes,
      transitMinutes,
      assumptions: [
        `Drive to ${parking.name}`,
        'Walk or transfer to transit',
        `Transit/light rail toward ${airportCode}`,
        canEstimateParkingCost
          ? 'Parking cost shown for same-day use only unless overnight rules are confirmed.'
          : PARK_AND_RIDE_UI_COPY.overnightCostUnavailable,
        trafficEstimate?.trustStatus === 'live'
          ? 'Drive time partially informed by route data'
          : 'Drive time uses typical estimate',
      ],
    },
    easeScore: overnight ? (recommendedForTrip ? 58 : 42) : 68,
    stressScore: overnight ? (recommendedForTrip ? 64 : 72) : 52,
    confidenceScore: rules.ruleConfidence === 'confirmed' ? 72 : 45,
    overnightCaveat,
    explanation:
      'Park-and-ride access uses station or transit-center parking plus rail or transit to reach the airport. This is not standard airport parking.',
    bestFor: ['Park & Ride', 'Transit + parking', ...(parking.bestFor || [])].filter(
      (tag, index, tags) => tags.indexOf(tag) === index,
    ),
    isHiddenGem: false,
    sourceNotes: rules.ruleNote || parking.sourceName || 'Park-and-ride listing',
    mapLink:
      parking.mapLink ||
      parking.sourceLink ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parking.name)}`,
    sourceLink: 'https://www.soundtransit.org',
  };
}

export function buildParkAndRideAccessOptionsFromParking(
  parkingOptions: ParkingOption[],
  tripData: TripData,
  airportCode: string,
  trafficEstimate?: TrafficEstimate,
): AccessStrategyOption[] {
  return parkingOptions
    .filter(isParkAndRideParkingOption)
    .map((parking) =>
      buildParkAndRideAccessFromParking(parking, tripData, airportCode, trafficEstimate),
    );
}

export function partitionParkingByAccessKind(parkingOptions: ParkingOption[]): {
  standardParking: ParkingOption[];
  parkAndRideParking: ParkingOption[];
} {
  const parkAndRideParking = parkingOptions.filter(isParkAndRideParkingOption);
  const standardParking = parkingOptions.filter(
    (option) => !isParkAndRideParkingOption(option),
  );

  return { standardParking, parkAndRideParking };
}

export function partitionParkAndRideAccessOptions(
  options: AccessStrategyOption[],
  isOvernightTrip = false,
): {
  recommended: AccessStrategyOption[];
  notRecommendedForOvernight: AccessStrategyOption[];
} {
  const recommended = options.filter((option) => {
    if (isOvernightTrip) {
      return option.recommendedForTrip === true;
    }
    return option.recommendedForTrip !== false;
  });
  const notRecommendedForOvernight = options.filter((option) => {
    if (isOvernightTrip) {
      return option.recommendedForTrip !== true;
    }
    return option.recommendedForTrip === false;
  });

  return { recommended, notRecommendedForOvernight };
}
