import { ParkingOption, TripData } from '../types';
import { estimateParkingDays } from '../tripTime';
import { formatMoney } from '../../app/utils/formatter';

type DisplayableParkingPriceOption = Pick<
  ParkingOption,
  | 'price'
  | 'priceDisplay'
  | 'priceSource'
  | 'bookingProvider'
  | 'sourceName'
  | 'type'
>;

export function canDisplayParkingPrice(option: DisplayableParkingPriceOption): boolean {
  if (typeof option.price !== 'number' || option.price <= 0) return false;
  if (
    option.priceDisplay === 'check-live' ||
    option.priceDisplay === 'unavailable' ||
    option.priceDisplay === 'mock'
  ) {
    return false;
  }

  const provider = `${option.bookingProvider || ''} ${option.sourceName || ''}`.toLowerCase();
  const isGooglePlacesFallback =
    option.priceSource === 'google-places' || option.sourceName === 'Google Places';
  const isProviderSelectedDate =
    option.priceSource === 'marketplace-link' ||
    provider.includes('parkwhiz') ||
    provider.includes('airportparkingreservations');
  const isOfficialKnownRate =
    option.type === 'official' ||
    option.priceSource === 'official-rate' ||
    option.priceSource === 'direct-lot-rate';

  if (isGooglePlacesFallback && !isProviderSelectedDate && !isOfficialKnownRate) {
    return false;
  }

  if (option.priceDisplay === 'live') return true;
  if (option.priceDisplay === 'from-per-day') {
    return isProviderSelectedDate || isOfficialKnownRate;
  }
  if (option.priceDisplay === 'estimated') {
    return isOfficialKnownRate;
  }

  return false;
}

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
  if (!canDisplayParkingPrice(option)) {
    return {
      primary: 'Check live price',
      secondary: option.priceNote || null,
    };
  }

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
  const isEstimated =
    option.priceDisplay === 'estimated' ||
    option.priceConfidence === 'low' ||
    option.priceConfidence === 'medium';
  const primaryPrefix =
    option.priceDisplay === 'from-per-day'
      ? 'From '
      : isEstimated
        ? 'Est. '
        : '';

  return {
    primary: `${primaryPrefix}${formatMoney(daily)}/day`,
    secondary: isTotalProviderPrice
      ? `${isEstimated ? 'Est. total' : 'Total'}: ${formatMoney(total)} for ${days} day(s)`
      : `Est. total: ${formatMoney(total)} for ${days} day(s)`,
  };
}
