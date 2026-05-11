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

  if (option.priceUnit === 'total' && option.price > 0 && days > 1) {
    const dailyPrice = option.price / days;

    return withStableParkingRouteStatus({
      ...option,
      price: Number(dailyPrice.toFixed(2)),
      priceUnit: 'per-day',
      priceNote:
        option.priceNote ||
        'Provider returned total trip price; converted to daily rate for comparison.',
    });
  }

  return withStableParkingRouteStatus(option);
}
