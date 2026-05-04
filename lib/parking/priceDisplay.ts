import { ParkingOption, TripData } from '../types';
import { estimateParkingDays } from '../tripTime';
import { formatMoney } from '../../app/utils/formatter';

export function getParkingTotalPrice(
  option: ParkingOption,
  tripData: TripData | null
): number | null {
  if (typeof option.price !== 'number' || option.price <= 0) return null;

  const days = Math.max(1, estimateParkingDays(tripData));

  if (option.priceUnit === 'total') {
    return option.price;
  }

  return option.price * days;
}

export function getParkingDailyPrice(
  option: ParkingOption,
  tripData: TripData | null
): number | null {
  if (typeof option.price !== 'number' || option.price <= 0) return null;

  const days = Math.max(1, estimateParkingDays(tripData));

  if (option.priceUnit === 'total') {
    return option.price / days;
  }

  return option.price;
}

export function parkingPriceLine(
  option: ParkingOption,
  tripData: TripData | null
): { primary: string; secondary: string | null } {
  const days = Math.max(1, estimateParkingDays(tripData));
  const total = getParkingTotalPrice(option, tripData);
  const daily = getParkingDailyPrice(option, tripData);

  if (!total || !daily) {
    return {
      primary: 'Check live price',
      secondary: option.priceNote || null,
    };
  }

  const isTotalProviderPrice = option.priceUnit === 'total';

  return {
    primary: `${formatMoney(daily)}/day`,
    secondary: isTotalProviderPrice
      ? `Total: ${formatMoney(total)} for ${days} day(s)`
      : `Est. total: ${formatMoney(total)} for ${days} day(s)`,
  };
}