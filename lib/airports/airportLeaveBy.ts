import { calculateAirportReadinessBuffer } from './airportReadiness';
import type { TripData } from '../types';
import { formatTimeFriendly, minutesToHHMM, parseHHMMToMinutes } from '../tripTime';

/** Small cushion when anchoring leave-by to a user-provided lot check-in time. */
export const PARKING_CHECK_IN_LEAVE_RISK_BUFFER_MINUTES = 5;

export type SelectedParkingTimingBreakdown = {
  totalMinutes: number;
  driveMinutes: number | null;
  parkingBufferMinutes: number | null;
  shuttleWalkMinutes: number | null;
};

export type ParkingCheckInSource = 'user' | 'recommended';

export type PrimaryAirportPlan = {
  leaveByTime: string | null;
  basisText: string | null;
  warningText: string | null;
  parkingCheckInTime: string | null;
  parkingCheckInSource: ParkingCheckInSource | null;
  recommendedParkingCheckInTime: string | null;
  selectedParkingName: string | null;
  travelMinutes: number | null;
  parkingBufferMinutes: number | null;
  shuttleWalkMinutes: number | null;
  securityTargetTime: string | null;
};

export function resolveAirportReadyBufferMinutes(
  tripData: TripData | null,
): number | null {
  if (!tripData || tripData.type !== 'one-way-departure') return null;

  const readiness = calculateAirportReadinessBuffer({
    bagPlan: tripData.bagPlan,
    checkingBags: !!tripData.checkingBags,
    securityOption: tripData.securityOption || 'standard',
    flightType: tripData.flightType || 'domestic',
    cabin: tripData.cabin || 'economy',
  });

  return readiness.bufferMinutes;
}

export function resolveSecurityTargetTime(
  tripData: TripData,
  airportReadyBufferMinutes: number,
): string | null {
  if (tripData.type !== 'one-way-departure') return null;

  const depMin = parseHHMMToMinutes(tripData.departureTime);
  if (depMin == null) return null;

  return minutesToHHMM(
    tripData.timeAnchor === 'airport-arrival'
      ? depMin
      : depMin - airportReadyBufferMinutes,
  );
}

export function hasUserProvidedParkingCheckIn(tripData: TripData): boolean {
  const checkInTime = tripData.parkingCheckInTime?.trim();
  const checkInDate = tripData.parkingCheckInDate?.trim();

  if (tripData.parkingCheckInUserOverride === true) return true;
  if (tripData.parkingCheckInUserOverride === false) return false;

  if (!checkInTime || !checkInDate) return false;

  if (tripData.type === 'one-way-departure') {
    if (checkInTime !== tripData.departureTime) return true;
    if (tripData.parkingCheckOutDate?.trim()) return true;
    if (tripData.parkingCheckOutTime?.trim() && tripData.parkingCheckOutTime !== tripData.departureTime) {
      return true;
    }
    return false;
  }

  return true;
}

export function resolveEffectiveDriveMinutes(
  timing: SelectedParkingTimingBreakdown | null,
): number | null {
  if (!timing) return null;

  if (timing.driveMinutes != null && timing.driveMinutes >= 0) {
    return timing.driveMinutes;
  }

  const parkingBuffer = timing.parkingBufferMinutes ?? 0;
  const shuttleWalk = timing.shuttleWalkMinutes ?? 0;
  const derived = timing.totalMinutes - parkingBuffer - shuttleWalk;

  return derived > 0 ? derived : null;
}

export function deriveRecommendedParkingCheckIn(args: {
  tripData: TripData;
  timing: SelectedParkingTimingBreakdown | null;
  airportReadyBufferMinutes: number;
}): string | null {
  const { tripData, timing, airportReadyBufferMinutes } = args;
  if (tripData.type !== 'one-way-departure') return null;

  const securityTarget = resolveSecurityTargetTime(tripData, airportReadyBufferMinutes);
  const securityTargetMin = securityTarget ? parseHHMMToMinutes(securityTarget) : null;
  if (securityTargetMin == null) return null;

  if (!timing) return minutesToHHMM(securityTargetMin);

  const accessAfterLot =
    (timing.parkingBufferMinutes ?? 0) + (timing.shuttleWalkMinutes ?? 0);

  return minutesToHHMM(securityTargetMin - accessAfterLot);
}

export function parkingCheckInWarning(args: {
  checkInTime: string;
  timing: SelectedParkingTimingBreakdown;
  securityTargetTime?: string | null;
}): string | null {
  const checkInMin = parseHHMMToMinutes(args.checkInTime);
  const securityTargetMin = args.securityTargetTime
    ? parseHHMMToMinutes(args.securityTargetTime)
    : null;

  if (checkInMin == null || securityTargetMin == null) return null;

  const terminalArrivalMin =
    checkInMin +
    (args.timing.parkingBufferMinutes ?? 0) +
    (args.timing.shuttleWalkMinutes ?? 0);

  if (terminalArrivalMin > securityTargetMin + 5) {
    return 'Your parking check-in may be too late for this flight.';
  }

  if (terminalArrivalMin < securityTargetMin - 45) {
    return 'Your parking check-in is earlier than needed.';
  }

  return null;
}

export const DEFAULT_FORM_PARKING_ACCESS_MINUTES = 25;

export function deriveRecommendedParkingCheckInForForm(
  tripData: TripData,
): string | null {
  const airportReadyBufferMinutes = resolveAirportReadyBufferMinutes(tripData) ?? 75;

  return deriveRecommendedParkingCheckIn({
    tripData,
    timing: {
      totalMinutes: DEFAULT_FORM_PARKING_ACCESS_MINUTES,
      driveMinutes: 15,
      parkingBufferMinutes: 5,
      shuttleWalkMinutes: 5,
    },
    airportReadyBufferMinutes,
  });
}

export function computePrimaryAirportPlan(args: {
  intent: string;
  tripData: TripData;
  selectedParkingName: string | null;
  selectedTiming: SelectedParkingTimingBreakdown | null;
  fallbackLeaveByTime: string | null;
  airportReadyBufferMinutes?: number | null;
  securityTargetTime?: string | null;
}): PrimaryAirportPlan {
  const {
    intent,
    tripData,
    selectedParkingName,
    selectedTiming,
    fallbackLeaveByTime,
  } = args;

  const airportReadyBufferMinutes =
    args.airportReadyBufferMinutes ??
    resolveAirportReadyBufferMinutes(tripData) ??
    75;
  const securityTargetTime =
    args.securityTargetTime ??
    (tripData.type === 'one-way-departure'
      ? resolveSecurityTargetTime(tripData, airportReadyBufferMinutes)
      : null);

  const travelMinutes = resolveEffectiveDriveMinutes(selectedTiming);
  const parkingBufferMinutes = selectedTiming?.parkingBufferMinutes ?? null;
  const shuttleWalkMinutes = selectedTiming?.shuttleWalkMinutes ?? null;

  const recommendedParkingCheckInTime =
    tripData.type === 'one-way-departure'
      ? deriveRecommendedParkingCheckIn({
          tripData,
          timing: selectedTiming,
          airportReadyBufferMinutes,
        })
      : null;

  const base: PrimaryAirportPlan = {
    leaveByTime: fallbackLeaveByTime,
    basisText: null,
    warningText: null,
    parkingCheckInTime: null,
    parkingCheckInSource: null,
    recommendedParkingCheckInTime,
    selectedParkingName,
    travelMinutes,
    parkingBufferMinutes,
    shuttleWalkMinutes,
    securityTargetTime,
  };

  if (intent !== 'flying-out' || tripData.type !== 'one-way-departure') {
    return base;
  }

  const userProvided = hasUserProvidedParkingCheckIn(tripData);
  const effectiveCheckInTime = userProvided
    ? tripData.parkingCheckInTime || null
    : recommendedParkingCheckInTime;

  if (effectiveCheckInTime) {
    base.parkingCheckInTime = effectiveCheckInTime;
    base.parkingCheckInSource = userProvided ? 'user' : 'recommended';
  }

  if (userProvided && effectiveCheckInTime && travelMinutes != null) {
    const checkInMin = parseHHMMToMinutes(effectiveCheckInTime);
    const leaveByTime =
      checkInMin == null
        ? fallbackLeaveByTime
        : minutesToHHMM(
            checkInMin - travelMinutes - PARKING_CHECK_IN_LEAVE_RISK_BUFFER_MINUTES,
          );

    return {
      ...base,
      leaveByTime,
      basisText: `Based on your ${formatTimeFriendly(effectiveCheckInTime)} parking check-in${
        selectedParkingName ? ` at ${selectedParkingName}` : ''
      }.`,
      warningText:
        selectedTiming && effectiveCheckInTime
          ? parkingCheckInWarning({
              checkInTime: effectiveCheckInTime,
              timing: selectedTiming,
              securityTargetTime,
            })
          : null,
    };
  }

  if (selectedTiming?.totalMinutes && securityTargetTime) {
    const securityTargetMin = parseHHMMToMinutes(securityTargetTime);
    if (securityTargetMin != null) {
      const leaveByTime = minutesToHHMM(securityTargetMin - selectedTiming.totalMinutes);

      return {
        ...base,
        leaveByTime,
        basisText: recommendedParkingCheckInTime
          ? `Using PodPaiGo recommended parking check-in time (${formatTimeFriendly(
              recommendedParkingCheckInTime,
            )}).`
          : selectedParkingName
            ? `Based on ${selectedParkingName} and airport readiness.`
            : null,
        warningText: null,
      };
    }
  }

  return {
    ...base,
    basisText: recommendedParkingCheckInTime
      ? `Recommended parking check-in: ${formatTimeFriendly(recommendedParkingCheckInTime)}.`
      : null,
  };
}
