import type { ParkingOption, TripData, TrustStatus } from '../types';
import { getParkingTotalPrice } from './priceDisplay';
import {
  buildParkingDriveContextFromOption,
  getParkingTerminalTimeMinutes,
  resolveParkingDriveMinutesDetailed,
} from './routeMinutes';
import { isParkingRouteUnavailable } from './routeStatus';
import { resolveTripParkingContext } from '../trip/tripContext';

export type ParkingSortMode = 'best' | 'easiest' | 'cheapest' | 'fastest';

export type ParkingSortContext = {
  /** Treat route-unavailable options as worst in every mode. */
  isUnavailable?: (option: ParkingOption) => boolean;
  /** Total estimated parking cost; free parking should resolve to 0. */
  totalCost?: (option: ParkingOption) => number;
  tripData?: TripData | null;
};

const BIG = 1_000_000;

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Origin → parking lot drive time in minutes, using the best available signal. */
export function parkingDriveMinutes(option: ParkingOption): number {
  return (
    num(option.originToParkingMinutes) ??
    num(option.routeToParkingMinutes) ??
    num(option.driveMinutes) ??
    num(option.duration) ??
    num(option.distance) ??
    0
  );
}

/** Parking lot → final destination/terminal time (walk, shuttle, transfer) in minutes. */
export function parkingWalkTransferMinutes(option: ParkingOption): number {
  return (
    num(option.walkingMinutes) ??
    num(option.transferToTerminalMinutes) ??
    num(option.shuttleMinutes) ??
    0
  );
}

/** Total door-to-destination time: drive + park/check-in buffer + walk/shuttle/transfer. */
export function parkingTotalDoorMinutes(option: ParkingOption): number {
  return (
    parkingDriveMinutes(option) +
    (num(option.parkingBufferMinutes) ?? 0) +
    parkingWalkTransferMinutes(option)
  );
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
  return cost == null ? BIG : cost;
}

function easiestKey(option: ParkingOption, tripData?: TripData | null): number {
  const totalTime = getParkingTotalTimeMinutes(option, tripData);
  const walkTransfer = parkingWalkTransferMinutes(option);

  return (
    totalTime +
    routePenalty(option, tripData) +
    transferPenalty(option) +
    availabilityPenalty(option) +
    trustPenalty(option.trustStatus) +
    priceConfidencePenalty(option) +
    unknownPricePenalty(option, tripData) +
    easiestConfidenceBonus(option) +
    walkTransfer * 0.6
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
  const costDiff = cheapestKey(a, tripData) - cheapestKey(b, tripData);
  if (costDiff !== 0) {
    if (Math.abs(costDiff) <= 3) {
      const livePreference =
        bookabilityBonus(a) - bookabilityBonus(b) ||
        priceConfidencePenalty(a) - priceConfidencePenalty(b);
      if (livePreference !== 0) return livePreference;
    }
    return costDiff;
  }

  return (
    unknownPricePenalty(a, tripData) - unknownPricePenalty(b, tripData) ||
    priceConfidencePenalty(a) - priceConfidencePenalty(b) ||
    getParkingTotalTimeMinutes(a, tripData) - getParkingTotalTimeMinutes(b, tripData)
  );
}

export function compareParkingByFastest(
  a: ParkingOption,
  b: ParkingOption,
  tripData?: TripData | null,
): number {
  return (
    getParkingTotalTimeMinutes(a, tripData) - getParkingTotalTimeMinutes(b, tripData) ||
    routePenalty(a, tripData) - routePenalty(b, tripData) ||
    unknownPricePenalty(a, tripData) - unknownPricePenalty(b, tripData) ||
    getParkingComparableCost(a, tripData) - getParkingComparableCost(b, tripData)
  );
}

/**
 * Deterministically sort parking options for a sort mode. Pure and side-effect free
 * so the visible parking list reorders predictably across easiest/cheapest/fastest.
 *
 * Rules:
 * - Route-unavailable options always sink to the bottom in every mode.
 * - "fastest" ranks by total door-to-destination time, but a missing/<=0 drive time
 *   is NOT treated as fast (it is pushed to the bottom) so a 0-minute fallback never wins.
 * - "cheapest" ranks by total cost (free first), then total time.
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

  return options
    .map((option, index) => ({ option, index }))
    .sort((a, b) => {
      const aUnavailable = isUnavailable(a.option);
      const bUnavailable = isUnavailable(b.option);
      if (aUnavailable !== bUnavailable) return aUnavailable ? 1 : -1;

      if (mode === 'cheapest') {
        const aCost = totalCost(a.option);
        const bCost = totalCost(b.option);
        if (aCost !== bCost) return aCost - bCost;
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

  if (mode === 'cheapest') return 'Lowest reliable total price';
  if (mode === 'fastest') return 'Shortest door-to-terminal time';

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
