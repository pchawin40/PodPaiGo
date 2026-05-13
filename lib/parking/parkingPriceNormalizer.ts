import { ParkingOption } from '../types';
import { withStableParkingRouteStatus } from './routeStatus';

function estimateParkingDaysFromDates(checkInDate?: string, checkOutDate?: string): number {
  if (!checkInDate || !checkOutDate) return 1;

  const start = new Date(`${checkInDate}T12:00:00`);
  const end = new Date(`${checkOutDate}T12:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;

  const diffDays = Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );

  return Math.max(1, diffDays);
}

export function normalizeParkingPriceForTrip(
  option: ParkingOption,
  checkInDate?: string,
  checkOutDate?: string,
): ParkingOption {
  const days = estimateParkingDaysFromDates(checkInDate, checkOutDate);

  // Important:
  // Do NOT convert total trip prices into per-day prices here.
  // The display helper already understands priceUnit === 'total'.
  // Converting here can cause double multiplication later, like:
  // $210/day · $1470 for 7 days.
  if (option.priceUnit === 'total' && option.price > 0 && days > 1) {
    return withStableParkingRouteStatus({
      ...option,
      priceUnit: 'total',
      priceNote:
        option.priceNote ||
        'Provider returned total trip price. Daily rate is estimated from the trip total.',
    });
  }

  return withStableParkingRouteStatus(option);
}