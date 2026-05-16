import { ParkingOption } from '../types';

type ParkingOptionWithLegacyRouteFields = ParkingOption & {
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

export function getParkingDriveMinutes(option: ParkingOption): number {
  const optionWithRoute = option as ParkingOptionWithLegacyRouteFields;

  const candidates = [
    optionWithRoute.routeToParkingMinutes,
    optionWithRoute.originToParkingMinutes,
    optionWithRoute.routeToLotMinutes,
    optionWithRoute.driveTimeMinutes,
    optionWithRoute.drivingMinutes,
    optionWithRoute.routeMinutes,
    optionWithRoute.driveMinutes,
    optionWithRoute.durationMinutes,
    optionWithRoute.routeDurationMinutes,
    optionWithRoute.distanceMinutes,
    optionWithRoute.duration,
  ];

  const valid = candidates.find(
    (minutes) =>
      typeof minutes === 'number' &&
      Number.isFinite(minutes) &&
      minutes > 0
  );

  return valid ?? 0;
}

export function getParkingTotalMinutes(option: ParkingOption): number {
  const drive = getParkingDriveMinutes(option);
  const park =
    typeof option.parkingBufferMinutes === 'number'
      ? option.parkingBufferMinutes
      : 0;
  const transfer =
    typeof option.transferToTerminalMinutes === 'number'
      ? option.transferToTerminalMinutes
      : 0;

  return drive + park + transfer;
}