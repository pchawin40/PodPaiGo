import type { ParkingOption, TrustStatus } from '../types';

export const DEFAULT_ROUTE_UNAVAILABLE_REASON =
  'Route unavailable from this origin to this parking lot.';

type ParkingRouteStatusCarrier = {
  routeUnavailable?: boolean;
  routeTrustStatus?: TrustStatus;
  routeUnavailableReason?: string;
};

export function isParkingRouteUnavailable(
  option: Pick<ParkingOption, 'routeUnavailable'> | ParkingRouteStatusCarrier | null | undefined
): boolean {
  return option?.routeUnavailable === true;
}

export function parkingRouteUnavailableReason(
  option: Pick<ParkingOption, 'routeUnavailableReason'> | ParkingRouteStatusCarrier | null | undefined,
  fallback = DEFAULT_ROUTE_UNAVAILABLE_REASON
): string {
  return option?.routeUnavailableReason || fallback;
}

export function withStableParkingRouteStatus<T extends ParkingRouteStatusCarrier>(
  option: T
): T & { routeUnavailable: boolean } {
  return {
    ...option,
    routeUnavailable: isParkingRouteUnavailable(option),
  };
}

export function mergeParkingRouteStatus<
  T extends ParkingRouteStatusCarrier,
  U extends ParkingRouteStatusCarrier,
>(
  base: T,
  update: U
): T & U & { routeUnavailable: boolean } {
  const baseUnavailable = isParkingRouteUnavailable(base);
  const updateUnavailable = isParkingRouteUnavailable(update);
  const routeUnavailable = baseUnavailable || updateUnavailable;
  const merged = {
    ...base,
    ...update,
  } as T & U;

  return {
    ...merged,
    routeUnavailable,
    routeTrustStatus: routeUnavailable
      ? (baseUnavailable ? base.routeTrustStatus : undefined) ??
        (updateUnavailable ? update.routeTrustStatus : undefined) ??
        update.routeTrustStatus ??
        base.routeTrustStatus
      : update.routeTrustStatus ?? base.routeTrustStatus,
    routeUnavailableReason: routeUnavailable
      ? (baseUnavailable ? base.routeUnavailableReason : undefined) ??
        (updateUnavailable ? update.routeUnavailableReason : undefined) ??
        update.routeUnavailableReason ??
        base.routeUnavailableReason
      : update.routeUnavailableReason ?? base.routeUnavailableReason,
  };
}
