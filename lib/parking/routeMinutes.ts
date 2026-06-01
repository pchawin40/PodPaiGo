import type { ParkingOption } from '../types';

const ROAD_DISTANCE_FACTOR = 1.25;
const AVERAGE_ROAD_SPEED_MPH = 35;

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
};

export function resolveParkingDriveMinutes(option: ParkingDriveCarrier): number {
  const candidates = [
    option.originToParkingMinutes,
    option.routeToParkingMinutes,
    option.routeToLotMinutes,
    option.driveTimeMinutes,
    option.drivingMinutes,
    option.routeMinutes,
    option.driveMinutes,
    option.durationMinutes,
    option.routeDurationMinutes,
    option.distanceMinutes,
    option.duration,
  ];

  const valid = candidates.find(
    (minutes) =>
      typeof minutes === 'number' &&
      Number.isFinite(minutes) &&
      minutes > 0,
  );

  return valid ?? 0;
}

export function estimateParkingDriveMinutesFallback(args: {
  originLat?: number | null;
  originLng?: number | null;
  option: Pick<ParkingOption, 'lat' | 'lng' | 'distance'>;
}): number {
  const { originLat, originLng, option } = args;

  if (
    typeof originLat === 'number' &&
    typeof originLng === 'number' &&
    typeof option.lat === 'number' &&
    typeof option.lng === 'number'
  ) {
    const miles = haversineMiles(originLat, originLng, option.lat, option.lng);
    const estimate = estimateDriveMinutesFromStraightLineMiles(miles);
    if (estimate > 0) return estimate;
  }

  // Provider `distance` is often a placeholder (e.g. miles from airport), not drive minutes.
  return 0;
}

export function applyParkingOriginDriveMinutes(
  option: ParkingOption,
  driveMinutes: number,
): ParkingOption {
  if (!Number.isFinite(driveMinutes) || driveMinutes <= 0) {
    return option;
  }

  return {
    ...option,
    originToParkingMinutes: driveMinutes,
    routeToParkingMinutes: driveMinutes,
    driveMinutes,
    distance: driveMinutes,
    duration: driveMinutes,
  };
}
