import type { RecommendationStatus } from '../recommendationStatusBadge';
import type { AccessStrategyOption } from '../access/types';
import type { ParkingOption, RideshareOption, TransitOption, TripData } from '../types';
import {
  buildParkingOptionsHints,
  inferParkingCategoryFromSignals,
  streetParkingScorePenalty,
} from './googleParkingOptionsSignals';
import { evaluateLocalStreetParkingRules } from './localParkingRules';
import { getParkingTotalPrice } from './priceDisplay';
import { isParkingRouteUnavailable } from './routeStatus';

export type PointAbModeKey = 'parking' | 'rideshare' | 'transit' | 'park-ride';
export type PointAbSortMode = 'easiest' | 'cheapest' | 'fastest';

export type PointAbModeCandidate = {
  key: PointAbModeKey;
  label: string;
  cost: number;
  minutes: number;
  reliable: boolean;
  confidence: 'High' | 'Medium' | 'Low';
};

export type PointAbModePresentation = {
  key: PointAbModeKey;
  label: string;
  name: string;
  cost: string;
  costNote?: string;
  time: string;
  confidence: 'High' | 'Medium' | 'Low';
  pros: string[];
  cons: string[];
  status: RecommendationStatus;
  unavailable: boolean;
  hiddenByPreference: boolean;
};

export type PointAbRankingResult = {
  modes: PointAbModePresentation[];
  recommendationMode: PointAbModeKey | 'compare';
  recommendedTitle: string;
  recommendedReason: string;
  cheapestMode: { key: PointAbModeKey; label: string; cost: number } | null;
  fastestMode: { key: PointAbModeKey; label: string; minutes: number } | null;
  objectiveBestMode: PointAbModeKey | null;
};

type RankPointAbModesInput = {
  tripData: TripData;
  sort: PointAbSortMode;
  destinationLabel: string;
  noParkingPreferred: boolean;
  bestParking: ParkingOption | null;
  parkingTotal: number | null;
  parkingMinutes: number | null;
  bestRideOption: RideshareOption | null;
  ridePrice: number | null;
  rideDuration: number | null;
  bestTransitOption: TransitOption | null;
  transitCost: number | null;
  transitDuration: number | null;
  transitCostDisplay?: string | null;
  hasReliableTransit: boolean;
  bestParkRideAccess: AccessStrategyOption | null;
  parkRideCost: number | null;
  parkRideDuration: number | null;
  parkRideReliable: boolean;
};

const BIG = 999_999;

function finiteOr(value: number | null | undefined, fallback = BIG): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatMoney(value: number): string {
  return `$${Math.round(value)}`;
}

function formatMinutesLabel(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function preferenceBoostIsCapped(args: {
  parkingCost: number | null;
  rideshareCost: number | null;
}): boolean {
  const parking = args.parkingCost;
  const rideshare = args.rideshareCost;
  if (parking == null || rideshare == null) return false;
  if (parking <= 0) return rideshare > 25;
  return rideshare >= parking * 4 + 20;
}

export function computePointAbPreferenceBoost(args: {
  mode: PointAbModeKey;
  noParkingPreferred: boolean;
  parkingCost: number | null;
  rideshareCost: number | null;
}): number {
  if (!args.noParkingPreferred) return 0;

  const capped = preferenceBoostIsCapped({
    parkingCost: args.parkingCost,
    rideshareCost: args.rideshareCost,
  });

  if (args.mode === 'rideshare') return capped ? 8 : 28;
  if (args.mode === 'transit') return capped ? 6 : 18;
  if (args.mode === 'parking') return capped ? -8 : -28;
  return 0;
}

export function scorePointAbMode(args: {
  mode: PointAbModeCandidate;
  sort: PointAbSortMode;
  noParkingPreferred: boolean;
  parkingCost: number | null;
  rideshareCost: number | null;
  parkingBonus?: number;
}): number {
  let score = 100;

  if (!args.mode.reliable) score -= 80;

  if (args.sort === 'cheapest') {
    score -= args.mode.cost * 0.65;
    score -= args.mode.minutes * 0.12;
  } else if (args.sort === 'fastest') {
    score -= args.mode.minutes * 0.9;
    score -= args.mode.cost * 0.15;
  } else {
    score -= args.mode.minutes * 0.35;
    score -= args.mode.cost * 0.25;
    if (args.mode.key === 'rideshare') score += 12;
    if (args.mode.key === 'parking') score += 4;
    if (args.mode.key === 'transit') score -= 8;
    if (args.mode.key === 'park-ride') score -= 4;
  }

  score += computePointAbPreferenceBoost({
    mode: args.mode.key,
    noParkingPreferred: args.noParkingPreferred,
    parkingCost: args.parkingCost,
    rideshareCost: args.rideshareCost,
  });

  if (args.parkingBonus && args.mode.key === 'parking') {
    score += args.parkingBonus;
  }

  return score;
}

function parkingGoogleSignalsBonus(parking: ParkingOption | null): number {
  if (!parking?.googleParkingOptions) return 0;

  const hints = buildParkingOptionsHints(parking.googleParkingOptions, { airportTrip: false });
  let bonus = 0;

  if (parking.googleParkingOptions.freeParkingLot) bonus += 16;
  if (parking.googleParkingOptions.freeStreetParking) bonus += 8;
  if (hints.hints.some((hint) => hint.category === 'garage_paid')) bonus -= 4;

  return bonus;
}

function getTripArrivalContext(tripData: TripData): {
  arrivalDate?: string;
  arrivalTime?: string;
} {
  if (tripData.type === 'general-trip' || tripData.type === 'one-way-arrival') {
    return {
      arrivalDate: tripData.arrivalDate,
      arrivalTime: tripData.arrivalTime,
    };
  }

  if (tripData.type === 'one-way-departure' || tripData.type === 'round-trip') {
    return {
      arrivalDate: tripData.departureDate,
      arrivalTime: tripData.departureTime,
    };
  }

  if (tripData.type === 'dropoff-pickup') {
    return {
      arrivalDate: tripData.airportTripDate,
      arrivalTime: tripData.airportTripTime,
    };
  }

  return {};
}

function parkingLocalRulesBonus(
  parking: ParkingOption | null,
  tripData: TripData,
  destinationLabel: string,
): number {
  if (!parking) return 0;

  const category =
    parking.parkingCategory || inferParkingCategoryFromSignals(parking.googleParkingOptions);
  const durationMinutes = tripData.parkingDuration ?? 8 * 60;
  const arrivalContext = getTripArrivalContext(tripData);
  const streetPenalty =
    streetParkingScorePenalty(parking, tripData) +
    evaluateLocalStreetParkingRules({
      destination: destinationLabel,
      arrivalDate: arrivalContext.arrivalDate,
      arrivalTime: arrivalContext.arrivalTime,
      durationMinutes,
      isAirportTrip: false,
    }).penalty;

  if (category === 'street') {
    return -streetPenalty;
  }

  const localRules = evaluateLocalStreetParkingRules({
    destination: destinationLabel,
    arrivalDate: arrivalContext.arrivalDate,
    arrivalTime: arrivalContext.arrivalTime,
    durationMinutes,
    isAirportTrip: false,
  });

  return localRules.freeLikely ? 10 : 0;
}

export function formatPointAbRideshareCost(price: number | null): {
  primary: string;
  note?: string;
} {
  if (price == null) {
    return { primary: 'Check app' };
  }

  if (price >= 80) {
    return { primary: formatMoney(price), note: 'High cost' };
  }

  if (price >= 45) {
    return { primary: formatMoney(price), note: 'Convenience option' };
  }

  return { primary: formatMoney(price) };
}

function resolveModeStatus(args: {
  mode: PointAbModeKey;
  recommendationMode: PointAbModeKey | null;
  cheapestMode: PointAbModeKey | null;
  fastestMode: PointAbModeKey | null;
  unavailable: boolean;
  hiddenByPreference: boolean;
  verifyRules: boolean;
  hasReliableData: boolean;
}): RecommendationStatus {
  if (args.hiddenByPreference) return 'hidden_by_preference';
  if (args.unavailable) return 'unavailable';
  if (args.verifyRules) return 'verify_rules';
  if (!args.hasReliableData) return 'route_needed';
  if (args.mode === args.recommendationMode) return 'best_pick';
  if (args.mode === args.cheapestMode) return 'budget_option';
  if (args.mode === args.fastestMode) return 'fastest';
  return 'easy_backup';
}

export function rankPointAbModes(input: RankPointAbModesInput): PointAbRankingResult {
  const candidates: PointAbModeCandidate[] = [
    input.bestParking
      ? {
          key: 'parking',
          label: 'Destination parking',
          cost: finiteOr(input.parkingTotal),
          minutes: finiteOr(input.parkingMinutes),
          reliable: !isParkingRouteUnavailable(input.bestParking),
          confidence: input.bestParking.trustStatus === 'live' ? 'High' : 'Medium',
        }
      : null,
    input.bestRideOption
      ? {
          key: 'rideshare',
          label: 'Rideshare',
          cost: finiteOr(input.ridePrice),
          minutes: finiteOr(input.rideDuration),
          reliable: true,
          confidence: input.bestRideOption.trustStatus === 'live' ? 'High' : 'Medium',
        }
      : null,
    input.hasReliableTransit
      ? {
          key: 'transit',
          label: 'Transit',
          cost: finiteOr(input.transitCost),
          minutes: finiteOr(input.transitDuration),
          reliable: true,
          confidence: input.bestTransitOption?.trustStatus === 'verified-source' ? 'High' : 'Medium',
        }
      : null,
    input.bestParkRideAccess
      ? {
          key: 'park-ride',
          label: 'Park & Ride',
          cost: finiteOr(input.parkRideCost),
          minutes: finiteOr(input.parkRideDuration),
          reliable: input.parkRideReliable,
          confidence:
            (input.bestParkRideAccess.confidenceScore ?? 0) >= 70
              ? 'High'
              : (input.bestParkRideAccess.confidenceScore ?? 0) >= 50
                ? 'Medium'
                : 'Low',
        }
      : null,
  ].filter(Boolean) as PointAbModeCandidate[];

  const parkingBonus =
    parkingGoogleSignalsBonus(input.bestParking) +
    parkingLocalRulesBonus(input.bestParking, input.tripData, input.destinationLabel);

  const objectiveScored = candidates.map((mode) => ({
    mode,
    score: scorePointAbMode({
      mode,
      sort: input.sort,
      noParkingPreferred: false,
      parkingCost: input.parkingTotal,
      rideshareCost: input.ridePrice,
      parkingBonus: mode.key === 'parking' ? parkingBonus : 0,
    }),
  }));

  const preferenceScored = candidates.map((mode) => ({
    mode,
    score: scorePointAbMode({
      mode,
      sort: input.sort,
      noParkingPreferred: input.noParkingPreferred,
      parkingCost: input.parkingTotal,
      rideshareCost: input.ridePrice,
      parkingBonus: mode.key === 'parking' ? parkingBonus : 0,
    }),
  }));

  const objectiveBest =
    [...objectiveScored].sort((a, b) => b.score - a.score)[0]?.mode.key ?? null;
  const preferenceBest =
    [...preferenceScored].sort((a, b) => b.score - a.score)[0]?.mode.key ?? null;

  const extremeCostGap = preferenceBoostIsCapped({
    parkingCost: input.parkingTotal,
    rideshareCost: input.ridePrice,
  });

  const recommendationMode: PointAbModeKey | null =
    (input.noParkingPreferred && !extremeCostGap
      ? preferenceBest
      : objectiveBest ?? preferenceBest) ?? null;

  const cheapestMode =
    [...candidates]
      .filter((mode) => mode.reliable)
      .sort((a, b) => a.cost - b.cost)[0] ?? null;
  const fastestMode =
    [...candidates]
      .filter((mode) => mode.reliable)
      .sort((a, b) => a.minutes - b.minutes)[0] ?? null;

  const parkingHints = input.bestParking?.googleParkingOptions
    ? buildParkingOptionsHints(input.bestParking.googleParkingOptions, { airportTrip: false })
    : null;
  const rideshareCost = formatPointAbRideshareCost(input.ridePrice);
  const parkingCostDisplay =
    input.parkingTotal != null
      ? formatMoney(input.parkingTotal)
      : input.bestParking && getParkingTotalPrice(input.bestParking, input.tripData) == null
        ? 'Check provider'
        : 'Estimated range';

  const modes: PointAbModePresentation[] = [
    {
      key: 'parking',
      label: 'Destination parking',
      name: input.bestParking?.name || 'No parking option found',
      cost: parkingCostDisplay,
      costNote: parkingHints?.hints[0]?.label,
      time: input.parkingMinutes != null ? formatMinutesLabel(input.parkingMinutes) : 'Check route',
      confidence: input.bestParking ? (input.bestParking.trustStatus === 'live' ? 'High' : 'Medium') : 'Low',
      pros: input.bestParking
        ? [
            parkingHints?.hints[0]?.label || 'Parking near destination',
            input.bestParking.covered ? 'Covered garage/lot' : 'You keep your car with you',
          ]
        : ['No parking result available'],
      cons: input.bestParking
        ? [
            input.noParkingPreferred ? 'You marked parking as not needed' : 'May cost more than transit',
            isParkingRouteUnavailable(input.bestParking) ? 'Route timing unavailable' : '',
          ].filter(Boolean)
        : ['Open map or provider to verify'],
      status: 'unavailable',
      unavailable: !input.bestParking,
      hiddenByPreference: Boolean(
        input.noParkingPreferred &&
          input.bestParking &&
          !isParkingRouteUnavailable(input.bestParking),
      ),
    },
    {
      key: 'rideshare',
      label: 'Rideshare',
      name: input.bestRideOption?.name || 'Uber / Lyft',
      cost: rideshareCost.primary,
      costNote: rideshareCost.note,
      time: input.rideDuration != null ? formatMinutesLabel(input.rideDuration) : 'Check app',
      confidence: input.bestRideOption ? (input.bestRideOption.trustStatus === 'live' ? 'High' : 'Medium') : 'Low',
      pros: ['No parking required', 'Lowest walking burden'],
      cons: ['Surge pricing can change', rideshareCost.note ? 'Higher total cost than driving' : ''].filter(Boolean),
      status: 'easy_backup',
      unavailable: !input.bestRideOption,
      hiddenByPreference: false,
    },
    {
      key: 'transit',
      label: 'Transit',
      name: input.bestTransitOption?.name || 'Google Maps / Sound Transit',
      cost:
        input.transitCostDisplay && input.hasReliableTransit
          ? input.transitCostDisplay
          : input.hasReliableTransit && input.transitCost != null
            ? formatMoney(input.transitCost)
            : 'Check route',
      time:
        input.transitDuration != null && input.hasReliableTransit
          ? formatMinutesLabel(input.transitDuration)
          : 'Check route',
      confidence: input.hasReliableTransit ? 'Medium' : 'Low',
      pros: ['Usually low cost', 'Avoids parking search'],
      cons: ['More walking and waiting'],
      status: input.hasReliableTransit ? 'budget_option' : 'route_needed',
      unavailable: !input.hasReliableTransit,
      hiddenByPreference: false,
    },
    {
      key: 'park-ride',
      label: 'Park & Ride',
      name: input.bestParkRideAccess?.displayName || 'Only if lot rules allow it',
      cost: input.bestParkRideAccess
        ? input.bestParkRideAccess.pricing.displayPrimary
        : 'Varies',
      time:
        input.parkRideDuration != null
          ? formatMinutesLabel(input.parkRideDuration)
          : 'Depends',
      confidence:
        (input.bestParkRideAccess?.confidenceScore ?? 0) >= 70
          ? 'High'
          : (input.bestParkRideAccess?.confidenceScore ?? 0) >= 50
            ? 'Medium'
            : 'Low',
      pros: input.bestParkRideAccess?.bestFor?.slice(0, 2) || ['Good for same-day transit trips'],
      cons: [input.bestParkRideAccess?.overnightCaveat || 'Verify lot rules before leaving your car'],
      status: input.bestParkRideAccess?.recommendedForTrip === false ? 'not_recommended' : 'verify_rules',
      unavailable: !input.bestParkRideAccess || input.bestParkRideAccess.recommendedForTrip === false,
      hiddenByPreference: false,
    },
  ].map((row) => ({
    ...row,
    key: row.key as PointAbModeKey,
    confidence: row.confidence as PointAbModePresentation['confidence'],
    status: resolveModeStatus({
      mode: row.key as PointAbModeKey,
      recommendationMode,
      cheapestMode: cheapestMode?.key ?? null,
      fastestMode: fastestMode?.key ?? null,
      unavailable: row.unavailable,
      hiddenByPreference: row.hiddenByPreference,
      verifyRules: row.key === 'park-ride' && row.status === 'verify_rules',
      hasReliableData: !row.unavailable && row.status !== 'route_needed',
    }),
  })) as PointAbModePresentation[];

  const recommendedTitle =
    recommendationMode === 'parking'
      ? input.bestParking?.name
        ? `Park at ${input.bestParking.name}`
        : 'Park near your destination'
      : recommendationMode === 'rideshare'
        ? `Take ${input.bestRideOption?.name || 'rideshare'}`
        : recommendationMode === 'transit'
          ? 'Take transit'
          : recommendationMode === 'park-ride'
            ? 'Use Park & Ride'
            : 'Compare options';

  const recommendedReason =
    recommendationMode === 'parking' && input.noParkingPreferred && extremeCostGap
      ? 'Drive and parking are much cheaper than rideshare, even though you marked parking as not needed.'
      : recommendationMode === 'parking'
        ? 'Best fit if you want to drive and use parking near your destination.'
        : recommendationMode === 'rideshare'
          ? input.noParkingPreferred
            ? 'Best fit because you marked that parking is not needed for this trip.'
            : 'Best fit if you want the lowest effort and do not want to leave a car parked.'
          : recommendationMode === 'transit'
            ? 'Best fit if cost matters most and your schedule has enough buffer.'
            : recommendationMode === 'park-ride'
              ? 'Best fit when lot rules allow same-day Park & Ride plus transit.'
              : 'Open provider pricing before making a final decision.';

  return {
    modes,
    recommendationMode: recommendationMode ?? 'compare',
    recommendedTitle,
    recommendedReason,
    cheapestMode: cheapestMode
      ? { key: cheapestMode.key, label: cheapestMode.label, cost: cheapestMode.cost }
      : null,
    fastestMode: fastestMode
      ? { key: fastestMode.key, label: fastestMode.label, minutes: fastestMode.minutes }
      : null,
    objectiveBestMode: objectiveBest,
  };
}
