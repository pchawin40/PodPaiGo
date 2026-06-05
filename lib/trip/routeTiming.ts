import { calculateAirportReadinessBuffer } from '../airports/airportReadiness';
import type { TripData } from '../types';
import { buildLocalDateTime, formatLocalYYYYMMDD } from '../tripTime';

export type RouteTimingPurpose = 'main_to_destination' | 'origin_to_parking';

export type TripRouteTiming = {
  /** Trip anchor used for weather, parking checkout, and display. */
  scheduledTripDateTime: string;
  /** ISO departure time sent to Google Routes for direct trips. */
  mainRouteDepartureIso: string;
  /** ISO departure time for origin → parking lot routing. */
  parkingRouteDepartureIso: string;
  /** Target terminal arrival when applicable. */
  targetTerminalArrivalIso?: string;
  /** Whether routing used current/near-current time. */
  usesNow: boolean;
  timingSource: 'now' | 'scheduled' | 'target_arrival_derived' | 'leave_by';
};

const DEFAULT_PRE_DRIVE_MINUTES = 75;
const DEFAULT_GENERAL_PRE_DRIVE_MINUTES = 30;
const SAME_DAY_NOW_WINDOW_MINUTES = 30;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toLocalIso(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function subtractMinutesFromIso(iso: string, minutes: number): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setMinutes(parsed.getMinutes() - minutes);
  return toLocalIso(parsed);
}

export function resolveScheduledTripDateTime(tripData: TripData): string | null {
  if (tripData.type === 'general-trip') {
    return `${tripData.arrivalDate}T${tripData.arrivalTime}`;
  }

  if (tripData.type === 'one-way-arrival') {
    return `${tripData.arrivalDate}T${tripData.arrivalTime}`;
  }

  if (tripData.type === 'round-trip') {
    return `${tripData.departureDate}T${tripData.departureTime}`;
  }

  if (tripData.type === 'one-way-departure') {
    return `${tripData.departureDate}T${tripData.departureTime}`;
  }

  if (tripData.type === 'dropoff-pickup') {
    return `${tripData.airportTripDate}T${tripData.airportTripTime}`;
  }

  return null;
}

export function resolveTargetTerminalArrivalIso(tripData: TripData): string | null {
  if (tripData.type !== 'one-way-departure') return null;

  if (tripData.timeAnchor === 'airport-arrival') {
    return `${tripData.departureDate}T${tripData.departureTime}`;
  }

  const readiness = calculateAirportReadinessBuffer({
    bagPlan: tripData.bagPlan,
    checkingBags: !!tripData.checkingBags,
    securityOption: tripData.securityOption || 'standard',
    flightType: tripData.flightType || 'domestic',
    cabin: tripData.cabin || 'economy',
  });

  const flightLocal = buildLocalDateTime(tripData.departureDate, tripData.departureTime);
  if (!flightLocal) return null;

  flightLocal.setMinutes(flightLocal.getMinutes() - readiness.bufferMinutes);
  return toLocalIso(flightLocal);
}

function isQuickGoTrip(tripData: TripData): boolean {
  return tripData.type === 'general-trip' && tripData.tripMode === 'quick-go';
}

export function shouldUseNowForRouting(scheduledIso: string, now: Date = new Date()): boolean {
  const scheduled = new Date(scheduledIso);
  if (Number.isNaN(scheduled.getTime())) return true;

  const today = formatLocalYYYYMMDD(now);
  const scheduledDay = formatLocalYYYYMMDD(scheduled);
  const diffMinutes = (scheduled.getTime() - now.getTime()) / 60000;

  if (scheduledDay !== today) {
    return false;
  }

  return diffMinutes <= SAME_DAY_NOW_WINDOW_MINUTES;
}

function resolveLeaveByIso(
  tripData: TripData,
  leaveByTime?: string | null,
): string | null {
  if (!leaveByTime) return null;

  const date =
    tripData.type === 'one-way-departure' || tripData.type === 'round-trip'
      ? tripData.departureDate
      : tripData.type === 'general-trip'
        ? tripData.arrivalDate
        : tripData.type === 'one-way-arrival'
          ? tripData.arrivalDate
          : tripData.type === 'dropoff-pickup'
            ? tripData.airportTripDate
            : null;

  if (!date) return null;

  return buildLocalDateTime(date, leaveByTime)
    ? toLocalIso(buildLocalDateTime(date, leaveByTime)!)
    : null;
}

export function resolveTripRouteTiming(
  tripData: TripData,
  options?: {
    leaveByTime?: string | null;
    now?: Date;
    purpose?: RouteTimingPurpose;
  },
): TripRouteTiming {
  const now = options?.now ?? new Date();
  const nowIso = toLocalIso(now);
  const scheduledTripDateTime = resolveScheduledTripDateTime(tripData) ?? nowIso;
  const leaveByIso = resolveLeaveByIso(tripData, options?.leaveByTime);
  const targetTerminalArrivalIso = resolveTargetTerminalArrivalIso(tripData) ?? undefined;

  if (leaveByIso) {
    return {
      scheduledTripDateTime,
      mainRouteDepartureIso: leaveByIso,
      parkingRouteDepartureIso: leaveByIso,
      targetTerminalArrivalIso,
      usesNow: false,
      timingSource: 'leave_by',
    };
  }

  if (targetTerminalArrivalIso) {
    const derivedDeparture =
      subtractMinutesFromIso(targetTerminalArrivalIso, DEFAULT_PRE_DRIVE_MINUTES) ??
      targetTerminalArrivalIso;

    const usesNow = shouldUseNowForRouting(targetTerminalArrivalIso, now);

    return {
      scheduledTripDateTime,
      mainRouteDepartureIso: usesNow ? nowIso : derivedDeparture,
      parkingRouteDepartureIso: usesNow ? nowIso : derivedDeparture,
      targetTerminalArrivalIso,
      usesNow,
      timingSource: usesNow ? 'now' : 'target_arrival_derived',
    };
  }

  if (tripData.type === 'general-trip' && !isQuickGoTrip(tripData)) {
    const derivedDeparture =
      subtractMinutesFromIso(scheduledTripDateTime, DEFAULT_GENERAL_PRE_DRIVE_MINUTES) ??
      scheduledTripDateTime;

    return {
      scheduledTripDateTime,
      mainRouteDepartureIso: derivedDeparture,
      parkingRouteDepartureIso: derivedDeparture,
      targetTerminalArrivalIso,
      usesNow: false,
      timingSource: 'target_arrival_derived',
    };
  }

  const usesNow = shouldUseNowForRouting(scheduledTripDateTime, now);

  return {
    scheduledTripDateTime,
    mainRouteDepartureIso: usesNow ? nowIso : scheduledTripDateTime,
    parkingRouteDepartureIso: usesNow ? nowIso : scheduledTripDateTime,
    targetTerminalArrivalIso,
    usesNow,
    timingSource: usesNow ? 'now' : 'scheduled',
  };
}

export function resolveRouteDepartureIsoForPurpose(
  timing: TripRouteTiming,
  purpose: RouteTimingPurpose,
): string {
  if (purpose === 'origin_to_parking') {
    return timing.parkingRouteDepartureIso;
  }

  return timing.mainRouteDepartureIso;
}

/** @deprecated Prefer resolveScheduledTripDateTime / resolveTripRouteTiming. */
export function buildTripDateTime(tripData: TripData): string {
  return resolveScheduledTripDateTime(tripData) ?? new Date().toISOString();
}
