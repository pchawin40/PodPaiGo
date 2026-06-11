import type { ParkingOption, PointToPointTiming, RideshareOption } from '../types';

type ConfidenceLevel = 'High' | 'Medium' | 'Low';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteMinutes(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}

export function resolveCustomerParkingTiming(input: {
  driveMinutes: number | null | undefined;
  confidence: ConfidenceLevel;
}): PointToPointTiming | null {
  const driveMinutes = finiteMinutes(input.driveMinutes);
  if (driveMinutes == null) {
    return null;
  }

  const parkingBufferMinutes =
    input.confidence === 'High' ? 1 : input.confidence === 'Medium' ? 2 : 4;
  const walkToDestinationMinutes =
    input.confidence === 'High' ? 0 : input.confidence === 'Medium' ? 1 : 1;

  return {
    driveMinutes,
    parkingBufferMinutes,
    walkToDestinationMinutes,
    pickupWaitMinutes: null,
    totalOptionMinutes: driveMinutes + parkingBufferMinutes + walkToDestinationMinutes,
  };
}

export function resolveCustomerParkingTravelMinutes(input: {
  driveMinutes: number | null | undefined;
  confidence: ConfidenceLevel;
}): number | null {
  return resolveCustomerParkingTiming(input)?.totalOptionMinutes ?? null;
}

export function resolveStreetMeterTiming(input: {
  driveMinutes: number | null | undefined;
  hasDestinationCoords?: boolean;
}): PointToPointTiming | null {
  const driveMinutes = finiteMinutes(input.driveMinutes);
  if (driveMinutes == null) {
    return null;
  }

  const parkingBufferMinutes = 7;
  const walkToDestinationMinutes = input.hasDestinationCoords ? 4 : 6;

  return {
    driveMinutes,
    parkingBufferMinutes,
    walkToDestinationMinutes,
    pickupWaitMinutes: null,
    totalOptionMinutes: driveMinutes + parkingBufferMinutes + walkToDestinationMinutes,
  };
}

export function resolveStreetMeterTravelMinutes(input: {
  driveMinutes: number | null | undefined;
  hasDestinationCoords?: boolean;
}): number | null {
  return resolveStreetMeterTiming(input)?.totalOptionMinutes ?? null;
}

export function resolvePaidGarageWalkMinutes(parking: ParkingOption | null | undefined): number {
  if (!parking) return 6;

  if (typeof parking.transferToTerminalMinutes === 'number' && parking.transferToTerminalMinutes > 0) {
    return parking.transferToTerminalMinutes;
  }

  if (typeof parking.walkingMinutes === 'number' && parking.walkingMinutes > 0) {
    return parking.walkingMinutes;
  }

  if (typeof parking.distance === 'number' && parking.distance < 0.15) {
    return 3;
  }

  return 6;
}

export function resolvePaidGarageTiming(input: {
  driveMinutes: number | null | undefined;
  parkingMinutes: number | null | undefined;
  parking: ParkingOption | null | undefined;
  /** Known main origin→destination drive minutes, used as an honesty guard. */
  mainDriveMinutes?: number | null;
  /** True when the origin→lot drive leg came from a confirmed route. */
  driveRouteConfirmed?: boolean;
}): PointToPointTiming | null {
  let driveMinutes = finiteMinutes(input.driveMinutes);
  const parkingMinutes = finiteMinutes(input.parkingMinutes);
  const mainDriveMinutes = finiteMinutes(input.mainDriveMinutes);
  let driveSource: PointToPointTiming['driveSource'];

  if (driveMinutes == null) {
    if (mainDriveMinutes != null) {
      // Destination parking sits near the destination, so the main
      // origin→destination drive is an honest estimated stand-in for the
      // missing origin→lot leg.
      driveMinutes = mainDriveMinutes;
      driveSource = 'main-drive-estimate';
    } else if (parkingMinutes != null) {
      // Only the local parking/check-in/walk leg is known. Never present that
      // partial leg as a trip total (e.g. "12 min" for a 6h+ trip).
      return {
        driveMinutes: null,
        parkingBufferMinutes: null,
        walkToDestinationMinutes: null,
        pickupWaitMinutes: null,
        totalOptionMinutes: null,
        partial: true,
      };
    } else {
      return null;
    }
  }

  const parkingBufferMinutes = clamp(input.parking?.parkingBufferMinutes ?? 8, 5, 10);
  const walkToDestinationMinutes = resolvePaidGarageWalkMinutes(input.parking);

  // Driving to a lot near the destination cannot make the full chain faster
  // than the known main drive route unless the origin→lot leg is
  // route-confirmed. A drastically shorter unconfirmed leg is a stale/local
  // partial value, so re-base it on the main drive.
  if (
    mainDriveMinutes != null &&
    input.driveRouteConfirmed !== true &&
    driveMinutes + parkingBufferMinutes + walkToDestinationMinutes < mainDriveMinutes
  ) {
    driveMinutes = mainDriveMinutes;
    driveSource = 'main-drive-estimate';
  }

  const computedMinutes = driveMinutes + parkingBufferMinutes + walkToDestinationMinutes;
  let totalOptionMinutes = computedMinutes;

  if (parkingMinutes != null) {
    const minimumPaidMinutes = driveMinutes + parkingBufferMinutes + 3;
    if (parkingMinutes >= minimumPaidMinutes) {
      totalOptionMinutes = parkingMinutes;
    }
  }

  return {
    driveMinutes,
    parkingBufferMinutes,
    walkToDestinationMinutes,
    pickupWaitMinutes: null,
    totalOptionMinutes,
    ...(driveSource ? { driveSource } : {}),
  };
}

export function resolvePaidGarageTravelMinutes(input: {
  driveMinutes: number | null | undefined;
  parkingMinutes: number | null | undefined;
  parking: ParkingOption | null | undefined;
  mainDriveMinutes?: number | null;
  driveRouteConfirmed?: boolean;
}): number | null {
  return resolvePaidGarageTiming(input)?.totalOptionMinutes ?? null;
}

export function resolveRideshareTiming(input: {
  driveMinutes: number | null | undefined;
  rideshare: RideshareOption | null | undefined;
}): PointToPointTiming | null {
  const ride = input.rideshare;
  if (!ride) {
    return null;
  }

  const mainDrive = finiteMinutes(input.driveMinutes);
  const optionDrive = finiteMinutes(ride.driveMinutes);
  const optionTotal = finiteMinutes(ride.totalOptionMinutes ?? ride.duration);
  const pickupWaitMinutes = finiteMinutes(ride.pickupWaitMinutes) ?? 5;
  const scope = ride.rideshareTripScope === 'round-trip' ? 2 : 1;
  // Absent flag means confirmed for backward compatibility; only the
  // distance-band fallback marks routeConfirmed === false.
  const routeConfirmed = ride.routeConfirmed !== false;

  // The option's own drive leg, backing the pickup wait out of a total when no
  // explicit drive leg is provided.
  const optionDriveLeg =
    optionDrive ??
    (optionTotal != null ? Math.max(0, optionTotal - pickupWaitMinutes) : null);

  // A rideshare ride is a car drive, so it can never reach the destination
  // faster than the known main origin→destination drive route.
  let driveMinutes: number | null;
  if (mainDrive != null) {
    // Re-base on the main drive route; the option can only be slower.
    driveMinutes = optionDriveLeg != null ? Math.max(mainDrive, optionDriveLeg) : mainDrive;
  } else if (routeConfirmed) {
    // No main drive route, but the option came from a real route: trust it.
    driveMinutes = optionDriveLeg;
  } else {
    // No main drive route and the option used a distance-band fallback: do not
    // show a fake precise duration. The UI falls back to "Open app".
    return null;
  }

  if (driveMinutes == null) {
    return null;
  }

  return {
    driveMinutes,
    parkingBufferMinutes: null,
    walkToDestinationMinutes: null,
    pickupWaitMinutes,
    totalOptionMinutes: (driveMinutes + pickupWaitMinutes) * scope,
  };
}
