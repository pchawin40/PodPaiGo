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

export type ParkingCheckInTimingStatus = 'early' | 'good' | 'late' | 'unknown';

export type ParkingCheckInTimingMessage = {
  status: ParkingCheckInTimingStatus;
  title: string;
  body: string;
  basis: string;
  deltaMinutes: number | null;
  absoluteDeltaLabel: string | null;
  recommendedCheckInTime: string | null;
  selectedCheckInTime: string | null;
};

const PARKING_CHECK_IN_TIMING_GOOD_THRESHOLD_MINUTES = 15;

export function formatParkingCheckInDeltaDuration(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  if (abs < 60) return `${abs} min`;

  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

export type PrimaryAirportPlan = {
  leaveByTime: string | null;
  basisText: string | null;
  /** @deprecated Prefer parkingCheckInTiming for UI copy. */
  warningText: string | null;
  parkingCheckInTiming: ParkingCheckInTimingMessage | null;
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

function buildUnknownParkingCheckInTimingMessage(
  selectedCheckInTime: string | null,
): ParkingCheckInTimingMessage {
  return {
    status: 'unknown',
    title: 'Parking check-in timing unavailable',
    body: 'PodPaiGo could not compare your parking check-in to a recommended time yet.',
    basis: '',
    deltaMinutes: null,
    absoluteDeltaLabel: null,
    recommendedCheckInTime: null,
    selectedCheckInTime,
  };
}

export function resolveParkingCheckInTimingMessage(args: {
  checkInTime: string;
  timing: SelectedParkingTimingBreakdown;
  securityTargetTime?: string | null;
  checkInSource?: ParkingCheckInSource | null;
  recommendedCheckInTime?: string | null;
}): ParkingCheckInTimingMessage | null {
  const selectedCheckInTime = args.checkInTime?.trim() || null;
  const recommendedCheckInTime = args.recommendedCheckInTime?.trim() || null;
  const selectedMin = selectedCheckInTime ? parseHHMMToMinutes(selectedCheckInTime) : null;
  const recommendedMin = recommendedCheckInTime
    ? parseHHMMToMinutes(recommendedCheckInTime)
    : null;

  if (selectedMin == null) return null;

  if (recommendedMin == null) {
    return buildUnknownParkingCheckInTimingMessage(selectedCheckInTime);
  }

  const deltaMinutes = recommendedMin - selectedMin;
  const absoluteDeltaLabel = formatParkingCheckInDeltaDuration(deltaMinutes);
  const formattedSelected = formatTimeFriendly(args.checkInTime);

  if (deltaMinutes >= PARKING_CHECK_IN_TIMING_GOOD_THRESHOLD_MINUTES) {
    return {
      status: 'early',
      title: `You have ${absoluteDeltaLabel} extra airport cushion`,
      body: `Your ${formattedSelected} parking check-in is earlier than PodPaiGo estimates you need. That's okay if you want a relaxed airport arrival.`,
      basis: 'Based on your selected parking check-in.',
      deltaMinutes,
      absoluteDeltaLabel,
      recommendedCheckInTime,
      selectedCheckInTime,
    };
  }

  if (deltaMinutes <= -PARKING_CHECK_IN_TIMING_GOOD_THRESHOLD_MINUTES) {
    return {
      status: 'late',
      title: `Parking check-in may be tight by ${absoluteDeltaLabel}`,
      body: 'Your selected parking check-in may leave less time than recommended for parking, shuttle/walk, security, and boarding.',
      basis: 'Consider moving check-in earlier or choosing a faster parking option.',
      deltaMinutes,
      absoluteDeltaLabel,
      recommendedCheckInTime,
      selectedCheckInTime,
    };
  }

  return {
    status: 'good',
    title: 'Parking time looks good',
    body: 'Your parking check-in lines up with your flight timing and airport buffer.',
    basis: '',
    deltaMinutes,
    absoluteDeltaLabel,
    recommendedCheckInTime,
    selectedCheckInTime,
  };
}

/** @deprecated Use resolveParkingCheckInTimingMessage for UI copy. */
export function parkingCheckInWarning(args: {
  checkInTime: string;
  timing: SelectedParkingTimingBreakdown;
  securityTargetTime?: string | null;
}): string | null {
  const message = resolveParkingCheckInTimingMessage(args);
  if (!message || message.status === 'good') return null;
  return message.title;
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
    parkingCheckInTiming: null,
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

    const parkingCheckInTiming =
      selectedTiming && effectiveCheckInTime
        ? resolveParkingCheckInTimingMessage({
            checkInTime: effectiveCheckInTime,
            timing: selectedTiming,
            securityTargetTime,
            checkInSource: 'user',
            recommendedCheckInTime: recommendedParkingCheckInTime,
          })
        : null;

    return {
      ...base,
      leaveByTime,
      basisText: `Based on your ${formatTimeFriendly(effectiveCheckInTime)} parking check-in${
        selectedParkingName ? ` at ${selectedParkingName}` : ''
      }.`,
      parkingCheckInTiming,
      warningText:
        parkingCheckInTiming && parkingCheckInTiming.status !== 'good'
          ? parkingCheckInTiming.title
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
