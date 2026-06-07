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
}): PointToPointTiming | null {
  const driveMinutes = finiteMinutes(input.driveMinutes);
  const parkingMinutes = finiteMinutes(input.parkingMinutes);

  if (driveMinutes == null) {
    if (parkingMinutes != null) {
      return {
        driveMinutes: null,
        parkingBufferMinutes: null,
        walkToDestinationMinutes: null,
        pickupWaitMinutes: null,
        totalOptionMinutes: parkingMinutes,
      };
    }
    return null;
  }

  const parkingBufferMinutes = clamp(input.parking?.parkingBufferMinutes ?? 8, 5, 10);
  const walkToDestinationMinutes = resolvePaidGarageWalkMinutes(input.parking);
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
  };
}

export function resolvePaidGarageTravelMinutes(input: {
  driveMinutes: number | null | undefined;
  parkingMinutes: number | null | undefined;
  parking: ParkingOption | null | undefined;
}): number | null {
  return resolvePaidGarageTiming(input)?.totalOptionMinutes ?? null;
}

export function resolveRideshareTiming(input: {
  driveMinutes: number | null | undefined;
  rideshare: RideshareOption | null | undefined;
}): PointToPointTiming | null {
  const optionTotal = finiteMinutes(input.rideshare?.totalOptionMinutes ?? input.rideshare?.duration);
  const explicitDrive = finiteMinutes(input.rideshare?.driveMinutes ?? input.driveMinutes);
  const pickupWaitMinutes = finiteMinutes(input.rideshare?.pickupWaitMinutes) ?? 5;
  const driveMinutes =
    explicitDrive ?? (optionTotal != null ? Math.max(0, optionTotal - pickupWaitMinutes) : null);

  if (driveMinutes == null && optionTotal == null) {
    return null;
  }

  return {
    driveMinutes,
    parkingBufferMinutes: null,
    walkToDestinationMinutes: null,
    pickupWaitMinutes,
    totalOptionMinutes: optionTotal ?? (driveMinutes! + pickupWaitMinutes),
  };
}
