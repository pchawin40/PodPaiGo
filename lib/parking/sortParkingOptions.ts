import type { ParkingOption } from '../types';

export type ParkingSortMode = 'easiest' | 'cheapest' | 'fastest';

export type ParkingSortContext = {
  /** Treat route-unavailable options as worst in every mode. */
  isUnavailable?: (option: ParkingOption) => boolean;
  /** Total estimated parking cost; free parking should resolve to 0. */
  totalCost?: (option: ParkingOption) => number;
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

function defaultTotalCost(option: ParkingOption): number {
  if (option.validationStatus === 'free' || option.price === 0) return 0;
  return num(option.price) ?? BIG;
}

/** Lower is more trusted/available; used to break ties for the "easiest" mode. */
function trustRank(option: ParkingOption): number {
  if (option.trustStatus === 'live' || option.trustStatus === 'verified-source') return 0;
  if (option.type === 'official') return 1;
  if (option.sourceLink) return 2;
  return 3;
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
  const totalCost = context.totalCost ?? defaultTotalCost;

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
        return parkingTotalDoorMinutes(a.option) - parkingTotalDoorMinutes(b.option) || a.index - b.index;
      }

      if (mode === 'fastest') {
        const aTime = fastestKey(a.option, aUnavailable);
        const bTime = fastestKey(b.option, bUnavailable);
        if (aTime !== bTime) return aTime - bTime;
        return totalCost(a.option) - totalCost(b.option) || a.index - b.index;
      }

      // easiest / default: trusted + closest.
      const aTrust = trustRank(a.option);
      const bTrust = trustRank(b.option);
      if (aTrust !== bTrust) return aTrust - bTrust;

      const aTotal = parkingTotalDoorMinutes(a.option);
      const bTotal = parkingTotalDoorMinutes(b.option);
      if (aTotal !== bTotal) return aTotal - bTotal;

      return (
        parkingWalkTransferMinutes(a.option) - parkingWalkTransferMinutes(b.option) ||
        a.index - b.index
      );
    })
    .map((entry) => entry.option);
}

/** A 0/missing drive time must not win "fastest"; push such options to the bottom. */
function fastestKey(option: ParkingOption, unavailable: boolean): number {
  const drive = parkingDriveMinutes(option);
  if (unavailable || drive <= 0) return BIG;
  const total = parkingTotalDoorMinutes(option);
  return total > 0 ? total : BIG;
}

/** Short evidence label explaining why an option ranks well in the current mode. */
export function parkingRankEvidenceLabel(
  option: ParkingOption,
  mode: ParkingSortMode,
  context: ParkingSortContext = {},
): string | null {
  const totalCost = context.totalCost ?? defaultTotalCost;

  if ((option.validationStatus === 'free' || totalCost(option) === 0) && mode !== 'fastest') {
    return 'Verified free parking';
  }

  if (mode === 'cheapest') return 'Lowest total price';
  if (mode === 'fastest') return 'Fastest door-to-destination';

  const walk = parkingWalkTransferMinutes(option);
  if (walk > 0 && walk <= 6) return 'Closest walk';
  return null;
}
