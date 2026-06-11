import type { ParkingOption, TripData, TrustStatus } from '../types';
import { getParkingTotalPrice } from './priceDisplay';
import { streetParkingScorePenalty } from './googleParkingOptionsSignals';
import {
  buildParkingDriveContextFromOption,
  getParkingTerminalTimeMinutes,
  resolveParkingDriveMinutesDetailed,
} from './routeMinutes';
import { isParkingRouteUnavailable } from './routeStatus';
import { resolveTripParkingContext } from '../trip/tripContext';
import {
  cheapestBadgeExplanation,
  getParkingPriceTier,
  parkingComparableCostWithReliability,
  qualifiesForCheapestBadge,
} from './priceReliability';
import { debugLog } from '../utils/debug';

export type ParkingSortMode = 'best' | 'easiest' | 'cheapest' | 'fastest';

export type ParkingSortContext = {
  /** Treat route-unavailable options as worst in every mode. */
  isUnavailable?: (option: ParkingOption) => boolean;
  /** Total estimated parking cost; free parking should resolve to 0. */
  totalCost?: (option: ParkingOption) => number;
  tripData?: TripData | null;
  /** Peer options used for cheapest badge/explanation comparisons. */
  peers?: ParkingOption[];
};

const BIG = 1_000_000;
const CHEAPEST_CLOSE_PRICE_DOLLARS = 2;

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Origin → parking lot drive time in minutes, using the best available signal. */
export function parkingDriveMinutes(option: ParkingOption): number {
  return resolveParkingDriveMinutesDetailed(
    option,
    buildParkingDriveContextFromOption(option),
  ).minutes;
}

/** Parking lot → final destination/terminal time (walk, shuttle, transfer) in minutes. */
export function parkingWalkTransferMinutes(option: ParkingOption): number {
  const shuttleWait =
    option.transferType === 'shuttle'
      ? num(option.shuttleWaitMinutes) ?? 8
      : 0;

  return (
    shuttleWait +
    (num(option.transferToTerminalMinutes) ?? 0) +
    (num(option.walkingMinutes) ?? 0) +
    (num(option.bufferRiskMinutes) ?? 0)
  );
}

/** Total door-to-terminal time including drive, park/check-in, shuttle, walk, and buffer. */
export function parkingTotalDoorMinutes(
  option: ParkingOption,
  tripData?: TripData | null,
): number {
  return getParkingTerminalTimeMinutes(
    option,
    buildParkingDriveContextFromOption(option),
    tripData ? resolveTripParkingContext(tripData) : 'airport_trip',
  );
}

/** Alias used by fastest ranking and UI totals. */
export function totalTimeToTerminalMinutes(
  option: ParkingOption,
  tripData?: TripData | null,
): number {
  return getParkingTotalTimeMinutes(option, tripData);
}

function trustPenalty(status: TrustStatus | undefined): number {
  switch (status) {
    case 'live':
    case 'verified-source':
      return 0;
    case 'estimated':
      return 10;
    case 'fallback':
      return 24;
    default:
      return 14;
  }
}

function transferPenalty(option: ParkingOption): number {
  if (option.transferType === 'walk' || option.transferType === 'airport-garage') return 0;
  if (!option.transferType && option.type === 'official') return 1;
  if (option.transferType === 'shuttle') return 12;
  if (option.transferType === 'transit') return 18;
  return 6;
}

function availabilityPenalty(option: ParkingOption): number {
  if (option.availabilityStatus === 'unavailable' || option.isAvailable === false) return 5000;
  if (option.availabilityStatus === 'unknown') return 18;

  const availability = num(option.availability);
  if (availability == null) return 12;
  return Math.max(0, (100 - availability) * 0.18);
}

function priceConfidencePenalty(option: ParkingOption): number {
  if (option.priceConfidence === 'high' || option.pricingConfidence === 'live') return 0;
  if (option.priceConfidence === 'medium' || option.pricingConfidence === 'recent') return 4;
  if (option.priceConfidence === 'low') return 14;
  return 8;
}

function unknownPricePenalty(option: ParkingOption, tripData?: TripData | null): number {
  const cost = getParkingComparableCost(option, tripData);
  if (cost >= BIG) return 120;
  if (option.priceDisplay === 'check-live' || option.priceDisplay === 'unavailable') return 36;
  if (option.priceDisplay === 'estimated' && option.priceConfidence !== 'high') return 18;
  return 0;
}

function bookabilityBonus(option: ParkingOption): number {
  if (option.priceDisplay === 'live' || option.pricingConfidence === 'live') return -14;
  if (option.priceSource === 'official-rate') return -8;
  if (option.sourceLink) return -4;
  return 0;
}

function easiestConfidenceBonus(option: ParkingOption): number {
  let bonus = bookabilityBonus(option);
  if (option.trustStatus === 'live' || option.routeTrustStatus === 'live') bonus -= 10;
  if (option.priceConfidence === 'high') bonus -= 6;
  if (option.transferType === 'walk' || option.transferType === 'airport-garage') bonus -= 8;
  if (option.transferType === 'shuttle') bonus += 6;
  if (option.availabilityStatus === 'unknown') bonus += 8;
  return bonus;
}

function routePenalty(option: ParkingOption, tripData?: TripData | null): number {
  if (isParkingRouteUnavailable(option)) return BIG;

  const context = buildParkingDriveContextFromOption(option);
  const drive = resolveParkingDriveMinutesDetailed(option, context);
  const samePlace = drive.source === 'same-place';

  if (drive.minutes <= 0 && !samePlace) return 5000;
  if (!tripData && drive.minutes <= 0 && !samePlace) return 2500;

  return (
    trustPenalty(option.routeTrustStatus ?? option.trustStatus) +
    (drive.source === 'haversine-estimated' ? 18 : 0)
  );
}

export function getParkingTotalTimeMinutes(
  option: ParkingOption,
  tripData?: TripData | null,
): number {
  if (isParkingRouteUnavailable(option)) return BIG;

  const drive = resolveParkingDriveMinutesDetailed(
    option,
    buildParkingDriveContextFromOption(option),
  );

  if (drive.minutes <= 0 && drive.source !== 'same-place') {
    return BIG;
  }

  const total = getParkingTerminalTimeMinutes(
    option,
    buildParkingDriveContextFromOption(option),
    tripData ? resolveTripParkingContext(tripData) : 'airport_trip',
  );

  return Number.isFinite(total) && total > 0 ? total : drive.source === 'same-place' ? 0 : BIG;
}

export function getParkingComparableCost(
  option: ParkingOption,
  tripData?: TripData | null,
): number {
  if (isParkingRouteUnavailable(option)) return BIG;

  if (
    option.validationStatus === 'free' ||
    (option.price === 0 && option.priceDisplay !== 'unavailable')
  ) {
    return 0;
  }

  const total = getParkingTotalPrice(option, tripData ?? null);
  if (typeof total === 'number' && Number.isFinite(total) && total >= 0) return total;

  const price = num(option.price);
  if (price == null || price <= 0) return BIG;

  if (option.priceUnit === 'total') return price;

  const duration = tripData?.parkingDuration;
  const days = Math.max(1, Math.ceil((duration ?? 24 * 60) / (24 * 60)));
  return Math.round(price * days * 100) / 100;
}

function cheapestKey(option: ParkingOption, tripData?: TripData | null): number {
  const cost = getParkingComparableCost(option, tripData);
  const base = cost == null ? BIG : cost;
  return (
    parkingComparableCostWithReliability(option, tripData ?? null, base) +
    streetParkingScorePenalty(option, tripData) * 0.05
  );
}

function hasUsableComparableCost(cost: number): boolean {
  return Number.isFinite(cost) && cost >= 0 && cost < BIG;
}

function cheapestPriceReliabilityClass(
  option: ParkingOption,
  tripData?: TripData | null,
): number {
  switch (getParkingPriceTier(option, tripData ?? null)) {
    case 'live_exact':
    case 'official':
    case 'provider_estimate':
      return 0;
    case 'estimated_range':
      return 1;
    case 'check_provider':
    case 'unknown':
    default:
      return 2;
  }
}

function pricesAreCloseForCheapest(aCost: number, bCost: number): boolean {
  if (!hasUsableComparableCost(aCost) || !hasUsableComparableCost(bCost)) {
    return false;
  }

  return (
    Math.round(aCost) === Math.round(bCost) ||
    Math.abs(aCost - bCost) <= CHEAPEST_CLOSE_PRICE_DOLLARS
  );
}

function parkingWalkProximityTieBreaker(option: ParkingOption): number {
  return (
    num(option.walkToDestinationMinutes) ??
    num(option.walkingMinutes) ??
    num(option.transferToTerminalMinutes) ??
    BIG
  );
}

function parkingDistanceProximityTieBreaker(option: ParkingOption): number {
  return (
    num(option.distanceToAirport) ??
    num(option.distance) ??
    BIG
  );
}

function compareParkingProximityTieBreakers(a: ParkingOption, b: ParkingOption): number {
  return (
    parkingWalkProximityTieBreaker(a) - parkingWalkProximityTieBreaker(b) ||
    parkingDistanceProximityTieBreaker(a) - parkingDistanceProximityTieBreaker(b)
  );
}

function reviewScoreTieBreaker(option: ParkingOption): number {
  const score = num(option.reviewScore);
  return score == null ? 6 : 5 - score;
}

function reviewCountTieBreaker(option: ParkingOption): number {
  const count = num(option.reviewCount);
  return count == null ? BIG : -count;
}

function compareCheapestNonPriceTieBreakers(
  a: ParkingOption,
  b: ParkingOption,
  tripData?: TripData | null,
): number {
  return (
    getParkingTotalTimeMinutes(a, tripData) - getParkingTotalTimeMinutes(b, tripData) ||
    compareParkingProximityTieBreakers(a, b) ||
    trustPenalty(a.trustStatus) - trustPenalty(b.trustStatus) ||
    trustPenalty(a.routeTrustStatus ?? a.trustStatus) -
      trustPenalty(b.routeTrustStatus ?? b.trustStatus) ||
    availabilityPenalty(a) - availabilityPenalty(b) ||
    priceConfidencePenalty(a) - priceConfidencePenalty(b) ||
    reviewScoreTieBreaker(a) - reviewScoreTieBreaker(b) ||
    reviewCountTieBreaker(a) - reviewCountTieBreaker(b)
  );
}

function frictionPenalty(option: ParkingOption): number {
  let penalty = transferPenalty(option);
  if (option.transferType === 'shuttle') {
    penalty += (num(option.shuttleWaitMinutes) ?? 8) * 0.75;
  }
  if (option.priceDisplay === 'check-live' || option.priceDisplay === 'unavailable') {
    penalty += 20;
  }
  return penalty;
}

function easiestKey(option: ParkingOption, tripData?: TripData | null): number {
  const totalTime = getParkingTotalTimeMinutes(option, tripData);

  return (
    totalTime * 0.4 +
    routePenalty(option, tripData) +
    frictionPenalty(option) +
    availabilityPenalty(option) +
    trustPenalty(option.trustStatus) +
    priceConfidencePenalty(option) +
    unknownPricePenalty(option, tripData) +
    easiestConfidenceBonus(option) +
    streetParkingScorePenalty(option, tripData)
  );
}

function bestKey(option: ParkingOption, tripData?: TripData | null): number {
  const totalTime = getParkingTotalTimeMinutes(option, tripData);
  const cost = cheapestKey(option, tripData);
  const cappedCost = cost >= BIG ? 90 : Math.min(90, cost);

  return (
    totalTime * 1.05 +
    cappedCost * 0.65 +
    routePenalty(option, tripData) +
    transferPenalty(option) +
    availabilityPenalty(option) +
    trustPenalty(option.trustStatus)
  );
}

export function compareParkingByEasiest(
  a: ParkingOption,
  b: ParkingOption,
  tripData?: TripData | null,
): number {
  return (
    easiestKey(a, tripData) - easiestKey(b, tripData) ||
    getParkingTotalTimeMinutes(a, tripData) - getParkingTotalTimeMinutes(b, tripData) ||
    getParkingComparableCost(a, tripData) - getParkingComparableCost(b, tripData)
  );
}

export function compareParkingByCheapest(
  a: ParkingOption,
  b: ParkingOption,
  tripData?: TripData | null,
): number {
  const aClass = cheapestPriceReliabilityClass(a, tripData);
  const bClass = cheapestPriceReliabilityClass(b, tripData);
  if (aClass !== bClass) {
    return aClass - bClass;
  }

  const aCost = getParkingComparableCost(a, tripData);
  const bCost = getParkingComparableCost(b, tripData);
  const aHasCost = hasUsableComparableCost(aCost);
  const bHasCost = hasUsableComparableCost(bCost);

  if (aHasCost !== bHasCost) {
    return aHasCost ? -1 : 1;
  }

  if (aHasCost && bHasCost) {
    const closePrice = pricesAreCloseForCheapest(aCost, bCost);
    if ((aCost === 0 || bCost === 0) && aCost !== bCost) {
      return aCost - bCost;
    }

    if (!closePrice && aCost !== bCost) {
      return aCost - bCost;
    }

    const nonPriceTieBreak = compareCheapestNonPriceTieBreakers(a, b, tripData);
    if (nonPriceTieBreak !== 0) return nonPriceTieBreak;

    if (aCost !== bCost) return aCost - bCost;
  }

  return (
    unknownPricePenalty(a, tripData) - unknownPricePenalty(b, tripData) ||
    bookabilityBonus(a) - bookabilityBonus(b) ||
    priceConfidencePenalty(a) - priceConfidencePenalty(b) ||
    compareCheapestNonPriceTieBreakers(a, b, tripData) ||
    cheapestKey(a, tripData) - cheapestKey(b, tripData)
  );
}

export function compareParkingByFastest(
  a: ParkingOption,
  b: ParkingOption,
  tripData?: TripData | null,
): number {
  const aTotal = totalTimeToTerminalMinutes(a, tripData);
  const bTotal = totalTimeToTerminalMinutes(b, tripData);

  return (
    aTotal - bTotal ||
    routePenalty(a, tripData) - routePenalty(b, tripData) ||
    unknownPricePenalty(a, tripData) - unknownPricePenalty(b, tripData) ||
    getParkingComparableCost(a, tripData) - getParkingComparableCost(b, tripData)
  );
}

export type ParkingSortScoreSnapshot = {
  lotId: string;
  lotName: string;
  mode: ParkingSortMode;
  totalTimeToTerminalMinutes: number;
  driveMinutes: number;
  comparableCost: number;
  priceTier: string;
  cheapestKey: number;
  fastestKey: number;
  easiestKey: number;
  qualifiesForCheapestBadge: boolean;
};

export function buildParkingSortScoreSnapshot(
  option: ParkingOption,
  mode: ParkingSortMode,
  tripData?: TripData | null,
  peers: ParkingOption[] = [option],
): ParkingSortScoreSnapshot {
  const totalMinutes = totalTimeToTerminalMinutes(option, tripData);
  const cost = getParkingComparableCost(option, tripData);

  return {
    lotId: String(option.id || option.name || 'unknown'),
    lotName: option.name,
    mode,
    totalTimeToTerminalMinutes: totalMinutes,
    driveMinutes: parkingDriveMinutes(option),
    comparableCost: cost,
    priceTier: getParkingPriceTier(option, tripData ?? null),
    cheapestKey: cheapestKey(option, tripData),
    fastestKey: totalMinutes,
    easiestKey: easiestKey(option, tripData),
    qualifiesForCheapestBadge: qualifiesForCheapestBadge({
      option,
      peers,
      tripData: tripData ?? null,
    }),
  };
}

export function logParkingSortScores(
  options: ParkingOption[],
  mode: ParkingSortMode,
  tripData?: TripData | null,
): void {
  const peers = options.filter((option) => !isParkingRouteUnavailable(option));

  debugLog('[Parking sort scores]', {
    mode,
    options: peers.map((option) => buildParkingSortScoreSnapshot(option, mode, tripData, peers)),
  });
}

/**
 * Deterministically sort parking options for a sort mode. Pure and side-effect free
 * so the visible parking list reorders predictably across easiest/cheapest/fastest.
 *
 * Rules:
 * - Route-unavailable options always sink to the bottom in every mode.
 * - "fastest" ranks by total door-to-destination time, but a missing/<=0 drive time
 *   is NOT treated as fast (it is pushed to the bottom) so a 0-minute fallback never wins.
 * - "cheapest" ranks by reliable total cost (free first), then total time/proximity for close prices.
 * - "easiest" ranks by trust/availability, then total time, then walk/transfer.
 */
export function sortParkingOptionsForMode(
  options: ParkingOption[],
  mode: ParkingSortMode,
  context: ParkingSortContext = {},
): ParkingOption[] {
  const isUnavailable = context.isUnavailable ?? (() => false);
  const totalCost = context.totalCost ?? ((option) => getParkingComparableCost(option, context.tripData));
  const tripData = context.tripData ?? null;

  const sorted = options
    .map((option, index) => ({ option, index }))
    .sort((a, b) => {
      const aUnavailable = isUnavailable(a.option);
      const bUnavailable = isUnavailable(b.option);
      if (aUnavailable !== bUnavailable) return aUnavailable ? 1 : -1;

      if (mode === 'cheapest') {
        return compareParkingByCheapest(a.option, b.option, tripData) || a.index - b.index;
      }

      if (mode === 'fastest') {
        return compareParkingByFastest(a.option, b.option, tripData) || a.index - b.index;
      }

      if (mode === 'best') {
        return (
          bestKey(a.option, tripData) - bestKey(b.option, tripData) ||
          compareParkingByEasiest(a.option, b.option, tripData) ||
          a.index - b.index
        );
      }

      return compareParkingByEasiest(a.option, b.option, tripData) || a.index - b.index;
    })
    .map((entry) => entry.option);

  logParkingSortScores(sorted, mode, tripData);

  return sorted;
}

/** Short evidence label explaining why an option ranks well in the current mode. */
export function parkingRankEvidenceLabel(
  option: ParkingOption,
  mode: ParkingSortMode,
  context: ParkingSortContext = {},
): string | null {
  const totalCost = context.totalCost ?? ((parking) => getParkingComparableCost(parking, context.tripData));

  if ((option.validationStatus === 'free' || totalCost(option) === 0) && mode !== 'fastest') {
    return 'Verified free parking';
  }

  if (mode === 'cheapest') {
    const peers = context.peers ?? [option];
    return cheapestBadgeExplanation(option, peers, context.tripData ?? null);
  }
  if (mode === 'fastest') return 'Shortest door-to-terminal time';
  if (mode === 'best') return 'Best overall';

  const walk = parkingWalkTransferMinutes(option);
  if (walk > 0 && walk <= 6) return 'Low shuttle/walk friction';
  if (option.priceDisplay === 'live' || option.pricingConfidence === 'live') {
    return 'Live bookable price';
  }
  if (option.priceConfidence === 'high' || option.trustStatus === 'live') {
    return 'High confidence';
  }
  return 'Lower stress estimate';
}

/** One-line explanation matching the active sort mode. */
export function parkingRankExplanation(
  option: ParkingOption,
  mode: ParkingSortMode,
  tripData?: TripData | null,
  peers: ParkingOption[] = [option],
): string {
  const totalCost = getParkingComparableCost(option, tripData);
  const totalMinutes = getParkingTotalTimeMinutes(option, tripData);

  if (mode === 'cheapest') {
    if (totalCost === 0) {
      return 'Lowest reliable total among route-available options, including verified free parking.';
    }
    if (qualifiesForCheapestBadge({ option, peers, tripData: tripData ?? null })) {
      return 'Lowest reliable live total among comparable options with usable route timing.';
    }
    return 'Lowest estimate among options without live prices.';
  }

  if (mode === 'fastest') {
    return 'Shortest door-to-terminal time with a real drive route — official garages can win when walk access is direct.';
  }

  if (mode === 'best') {
    return 'Weighted balance of reliable price, total time, bookability, route confidence, and low-friction access.';
  }

  if (mode === 'easiest') {
    return 'Lowest-stress pick based on live price confidence, bookability, short access, and weather-friendly access.';
  }

  return `Balanced pick (${totalMinutes} min total, ${totalCost >= 1000000 ? 'price TBD' : `$${totalCost} total`}).`;
}
