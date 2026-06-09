import type { ParkingOption } from '../types';
import type { TripParkingContext } from '../trip/tripContext';
import { getParkingRouteCoordinates } from './parkingCoordinates';

const ROAD_DISTANCE_FACTOR = 1.25;
const AVERAGE_ROAD_SPEED_MPH = 35;
const SAME_PLACE_MILES = 0.15;

export type ParkingDriveSource = 'google-routes' | 'haversine-estimated' | 'same-place';

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateDriveMinutesFromStraightLineMiles(miles: number): number {
  if (!Number.isFinite(miles) || miles <= 0) return 0;

  const roadMiles = miles * ROAD_DISTANCE_FACTOR;
  const minutes = Math.round((roadMiles / AVERAGE_ROAD_SPEED_MPH) * 60);

  return Math.max(8, minutes);
}

type ParkingDriveCarrier = ParkingOption & {
  duration?: number | null;
  routeToParkingMinutes?: number | null;
  driveMinutes?: number | null;
  durationMinutes?: number | null;
  routeDurationMinutes?: number | null;
  distanceMinutes?: number | null;
  routeMinutes?: number | null;
  drivingMinutes?: number | null;
  driveTimeMinutes?: number | null;
  routeToLotMinutes?: number | null;
  originToParkingMinutes?: number | null;
  originDriveSource?: ParkingDriveSource;
  originLat?: number | null;
  originLng?: number | null;
  routesUsedCanonicalCoords?: boolean;
  routeTargetLat?: number | null;
  routeTargetLng?: number | null;
  coordinateSource?: ParkingOption['coordinateSource'];
};

const ROUTE_TARGET_COORD_TOLERANCE = 0.001;

export function parkingRouteMinutesAreTrusted(option: ParkingDriveCarrier): boolean {
  const minutes = resolveParkingDriveMinutes(option);
  if (minutes <= 0) return false;

  const routeCoords = getParkingRouteCoordinates(option);

  if (option.coordinateSource === 'google_place') {
    if (option.routesUsedCanonicalCoords !== true) {
      return false;
    }

    if (
      typeof option.routeTargetLat === 'number' &&
      typeof option.routeTargetLng === 'number' &&
      typeof routeCoords.lat === 'number' &&
      typeof routeCoords.lng === 'number'
    ) {
      return (
        Math.abs(option.routeTargetLat - routeCoords.lat) <= ROUTE_TARGET_COORD_TOLERANCE &&
        Math.abs(option.routeTargetLng - routeCoords.lng) <= ROUTE_TARGET_COORD_TOLERANCE
      );
    }
  }

  if (
    typeof option.routeTargetLat === 'number' &&
    typeof option.routeTargetLng === 'number' &&
    typeof routeCoords.lat === 'number' &&
    typeof routeCoords.lng === 'number'
  ) {
    return (
      Math.abs(option.routeTargetLat - routeCoords.lat) <= ROUTE_TARGET_COORD_TOLERANCE &&
      Math.abs(option.routeTargetLng - routeCoords.lng) <= ROUTE_TARGET_COORD_TOLERANCE
    );
  }

  return true;
}

export function areSameParkingOriginAndLot(args: {
  originLat?: number | null;
  originLng?: number | null;
  lotLat?: number | null;
  lotLng?: number | null;
}): boolean {
  const { originLat, originLng, lotLat, lotLng } = args;

  if (
    typeof originLat !== 'number' ||
    typeof originLng !== 'number' ||
    typeof lotLat !== 'number' ||
    typeof lotLng !== 'number'
  ) {
    return false;
  }

  return haversineMiles(originLat, originLng, lotLat, lotLng) <= SAME_PLACE_MILES;
}

export function resolveParkingDriveMinutes(option: ParkingDriveCarrier): number {
  const candidates = [option.originToParkingMinutes, option.routeToParkingMinutes];

  const valid = candidates.find(
    (minutes) =>
      typeof minutes === 'number' &&
      Number.isFinite(minutes) &&
      minutes > 0,
  );

  return valid ?? 0;
}

export type ParkingDriveContext = {
  originLat?: number | null;
  originLng?: number | null;
};

export function buildParkingDriveContextFromOption(
  option: ParkingOption,
): ParkingDriveContext {
  const extended = option as ParkingDriveCarrier;

  return {
    originLat: extended.originLat,
    originLng: extended.originLng,
  };
}

export function estimateParkingDriveMinutesFallback(args: {
  originLat?: number | null;
  originLng?: number | null;
  option: Pick<ParkingOption, 'lat' | 'lng' | 'canonicalLat' | 'canonicalLng' | 'distance'>;
}): number {
  const { originLat, originLng, option } = args;
  const routeCoords = getParkingRouteCoordinates(option);

  if (
    typeof originLat === 'number' &&
    typeof originLng === 'number' &&
    typeof routeCoords.lat === 'number' &&
    typeof routeCoords.lng === 'number'
  ) {
    if (areSameParkingOriginAndLot({
      originLat,
      originLng,
      lotLat: routeCoords.lat,
      lotLng: routeCoords.lng,
    })) {
      return 0;
    }

    const miles = haversineMiles(originLat, originLng, routeCoords.lat, routeCoords.lng);
    const estimate = estimateDriveMinutesFromStraightLineMiles(miles);
    if (estimate > 0) return estimate;
  }

  return 0;
}

export function resolveParkingDriveMinutesDetailed(
  option: ParkingDriveCarrier,
  context?: ParkingDriveContext,
): { minutes: number; source: ParkingDriveSource | null } {
  const originLat = context?.originLat ?? option.originLat;
  const originLng = context?.originLng ?? option.originLng;

  const routeCoords = getParkingRouteCoordinates(option);

  if (
    areSameParkingOriginAndLot({
      originLat,
      originLng,
      lotLat: routeCoords.lat,
      lotLng: routeCoords.lng,
    })
  ) {
    return { minutes: 0, source: 'same-place' };
  }

  const direct = resolveParkingDriveMinutes(option);
  if (direct > 0 && parkingRouteMinutesAreTrusted(option)) {
    return {
      minutes: direct,
      source: option.originDriveSource ?? 'google-routes',
    };
  }

  const estimated = estimateParkingDriveMinutesFallback({
    originLat,
    originLng,
    option,
  });

  if (estimated > 0) {
    return { minutes: estimated, source: 'haversine-estimated' };
  }

  if (option.routeUnavailable) {
    return { minutes: 0, source: null };
  }

  return { minutes: 0, source: null };
}

export function resolveParkingDriveMinutesWithFallback(
  option: ParkingDriveCarrier,
  context?: ParkingDriveContext,
): number {
  return resolveParkingDriveMinutesDetailed(option, context).minutes;
}

export function resolveWalkToDestinationMinutes(
  option: Pick<ParkingOption, 'walkToDestinationMinutes' | 'walkingMinutes' | 'transferToTerminalMinutes'>,
): number | null {
  const candidates = [
    option.walkToDestinationMinutes,
    option.walkingMinutes,
    option.transferToTerminalMinutes,
  ];

  const minutes = candidates.find(
    (value) => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );

  return minutes ?? null;
}

export function getParkingTerminalTimeMinutes(
  option: ParkingOption,
  context?: ParkingDriveContext,
  tripContext: TripParkingContext = 'airport_trip',
): number {
  const resolvedContext = context ?? buildParkingDriveContextFromOption(option);
  const driveMinutes = resolveParkingDriveMinutesWithFallback(option, resolvedContext);
  const parkingBufferMinutes = option.parkingBufferMinutes ?? 0;

  if (tripContext === 'city_destination_trip') {
    const walkToDestination = resolveWalkToDestinationMinutes(option) ?? 8;

    return driveMinutes + parkingBufferMinutes + walkToDestination;
  }

  const transferToTerminalMinutes = option.transferToTerminalMinutes ?? 0;
  const shuttleWait =
    option.transferType === 'shuttle'
      ? typeof option.shuttleWaitMinutes === 'number'
        ? option.shuttleWaitMinutes
        : 8
      : 0;
  const walkInside =
    typeof option.walkingMinutes === 'number'
      ? option.walkingMinutes
      : option.transferType === 'airport-garage'
        ? 5
        : 3;
  const bufferRisk =
    typeof option.bufferRiskMinutes === 'number'
      ? option.bufferRiskMinutes
      : option.transferType === 'shuttle'
        ? 5
        : 0;

  return (
    driveMinutes +
    parkingBufferMinutes +
    shuttleWait +
    transferToTerminalMinutes +
    walkInside +
    bufferRisk
  );
}

export function applyParkingOriginDriveMinutes(
  option: ParkingOption,
  driveMinutes: number,
  source: ParkingDriveSource = 'google-routes',
  routeTarget?: { lat: number; lng: number; usedCanonicalCoords?: boolean },
): ParkingOption {
  if (!Number.isFinite(driveMinutes) || driveMinutes < 0) {
    return option;
  }

  if (driveMinutes === 0) {
    return {
      ...option,
      originDriveSource: source,
      ...(routeTarget
        ? {
            routeTargetLat: routeTarget.lat,
            routeTargetLng: routeTarget.lng,
            routesUsedCanonicalCoords: routeTarget.usedCanonicalCoords === true,
          }
        : {}),
    };
  }

  return {
    ...option,
    originToParkingMinutes: driveMinutes,
    routeToParkingMinutes: driveMinutes,
    originDriveSource: source,
    ...(routeTarget
      ? {
          routeTargetLat: routeTarget.lat,
          routeTargetLng: routeTarget.lng,
          routesUsedCanonicalCoords: routeTarget.usedCanonicalCoords === true,
        }
      : {}),
  };
}

export function formatDriveToLotMinutes(
  minutes: number,
  source: ParkingDriveSource | null,
): string {
  if (source === 'same-place') {
    return '0m';
  }

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return source === 'haversine-estimated' ? 'est. pending' : '—';
  }

  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (source === 'haversine-estimated') {
    if (hours > 0 && mins > 0) return `~${hours}h ${mins}m`;
    if (hours > 0) return `~${hours}h`;
    return `~${mins}m`;
  }

  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export function logMissingParkingDriveDiagnostic(args: {
  lotName: string;
  origin?: string;
  hasOriginCoords: boolean;
  hasLotCoords: boolean;
  routeDestination?: string;
  routeFailed?: boolean;
  googleRoutesCalled?: boolean;
}): void {
  if (process.env.NODE_ENV !== 'development') return;

  console.warn('[Parking drive] originToParkingMinutes missing after enrichment', args);
}
