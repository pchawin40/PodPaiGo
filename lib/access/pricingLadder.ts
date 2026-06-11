import { estimateParkingDays } from '../tripTime';
import type { TripData } from '../types';
import type {
  DollarRange,
  ParkingPriceDisplayLine,
  PriceableParkingLike,
  PricingConfidenceLabel,
} from './types';

export const DEFAULT_UNKNOWN_DAILY_RANGE = { min: 12, max: 28 };
export const DEFAULT_OFFICIAL_UNKNOWN_DAILY_RANGE = { min: 25, max: 45 };
export const DEFAULT_PARK_RIDE_UNKNOWN_DAILY_RANGE = { min: 5, max: 15 };

function formatMoney(amount: number): string {
  return `$${Math.round(amount)}`;
}

function formatMoneyRange(min: number, max: number): string {
  if (min === max) return formatMoney(min);
  return `${formatMoney(min)}–${formatMoney(max)}`;
}

function isWithinDays(iso: string | undefined, days: number): boolean {
  if (!iso) return false;
  const fetched = Date.parse(iso);
  if (Number.isNaN(fetched)) return false;
  return Date.now() - fetched <= days * 24 * 60 * 60 * 1000;
}

export function formatPricingConfidenceLabel(
  confidence: PricingConfidenceLabel,
): string {
  switch (confidence) {
    case 'live':
      return 'Live';
    case 'recent':
      return 'Recent';
    case 'official':
      return 'Official';
    case 'estimated':
      return 'Estimated';
    case 'final_on_provider':
      return 'Check provider';
  }
}

export function pricingConfidenceBadgeClass(
  confidence: PricingConfidenceLabel,
): string {
  switch (confidence) {
    case 'live':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'recent':
      return 'border-blue-200 bg-blue-50 text-blue-800';
    case 'official':
      return 'border-indigo-200 bg-indigo-50 text-indigo-800';
    case 'estimated':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'final_on_provider':
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

export function confidenceToScore(confidence: PricingConfidenceLabel): number {
  switch (confidence) {
    case 'live':
      return 100;
    case 'recent':
      return 85;
    case 'official':
      return 80;
    case 'estimated':
      return 55;
    case 'final_on_provider':
      return 45;
  }
}

export function resolvePricingConfidence(
  option: PriceableParkingLike,
): PricingConfidenceLabel {
  if (option.pricingConfidence === 'live') {
    return 'live';
  }

  const provider = `${option.bookingProvider || ''} ${option.sourceName || ''}`.toLowerCase();
  const isParkWhiz = provider.includes('parkwhiz');

  if (
    isParkWhiz &&
    option.priceDisplay === 'live' &&
    typeof option.price === 'number' &&
    option.price > 0
  ) {
    return 'live';
  }

  if (option.pricingConfidence) {
    return option.pricingConfidence;
  }

  if (option.trustStatus === 'live' && option.priceDisplay === 'live') {
    return 'live';
  }

  if (option.priceFreshness === 'live') {
    return 'live';
  }

  if (
    option.priceFreshness === 'recent' ||
    (option.providerSource === 'snapshot' && isWithinDays(option.fetchedAt, 7))
  ) {
    return 'recent';
  }

  if (option.type === 'official' || option.priceSource === 'official-rate') {
    return 'official';
  }

  const isProviderSelectedDate =
    option.priceSource === 'parkwhiz-live' ||
    option.priceSource === 'marketplace-link' ||
    provider.includes('parkwhiz') ||
    provider.includes('airportparkingreservations');

  if (option.priceDisplay === 'live' && isProviderSelectedDate) {
    return 'live';
  }

  if (
    option.trustStatus === 'live' &&
    isProviderSelectedDate &&
    (option.priceDisplay === 'from-per-day' || option.priceDisplay === 'live')
  ) {
    return 'live';
  }

  if (option.priceDisplay === 'estimated' && option.priceSource === 'direct-lot-rate') {
    return 'final_on_provider';
  }

  if (
    typeof option.price === 'number' &&
    option.price > 0 &&
    (option.priceDisplay === 'check-live' || option.priceDisplay === 'from-per-day') &&
    !isParkWhiz
  ) {
    return 'final_on_provider';
  }

  if (option.priceDisplay === 'estimated' || option.priceSource === 'google-places') {
    return 'estimated';
  }

  if (option.priceDisplay === 'unavailable') {
    return 'estimated';
  }

  return 'estimated';
}

export function deriveParkingDailyRange(
  option: PriceableParkingLike,
): DollarRange {
  if (
    typeof option.priceMin === 'number' &&
    typeof option.priceMax === 'number' &&
    option.priceMin > 0 &&
    option.priceMax > 0
  ) {
    return {
      min: Math.min(option.priceMin, option.priceMax),
      max: Math.max(option.priceMin, option.priceMax),
      currency: 'USD',
    };
  }

  if (typeof option.price === 'number' && option.price > 0) {
    if (option.priceUnit === 'total') {
      return {
        min: option.price,
        max: option.price,
        currency: 'USD',
      };
    }

    const confidence = resolvePricingConfidence(option);
    if (confidence === 'final_on_provider' || confidence === 'estimated') {
      const spread = Math.max(3, Math.round(option.price * 0.12));
      return {
        min: Math.max(1, option.price - spread),
        max: option.price + spread,
        currency: 'USD',
      };
    }

    return {
      min: option.price,
      max: option.price,
      currency: 'USD',
    };
  }

  return {
    min: option.type === 'official'
      ? DEFAULT_OFFICIAL_UNKNOWN_DAILY_RANGE.min
      : DEFAULT_UNKNOWN_DAILY_RANGE.min,
    max: option.type === 'official'
      ? DEFAULT_OFFICIAL_UNKNOWN_DAILY_RANGE.max
      : DEFAULT_UNKNOWN_DAILY_RANGE.max,
    currency: 'USD',
  };
}

export function deriveParkingTotalRange(
  option: PriceableParkingLike,
  tripData: TripData | null,
): DollarRange {
  const days = Math.max(1, estimateParkingDays(tripData));
  const daily = deriveParkingDailyRange(option);

  if (
    option.priceUnit === 'total' &&
    typeof option.priceMin === 'number' &&
    typeof option.priceMax === 'number' &&
    option.priceMin > 0 &&
    option.priceMax > 0
  ) {
    return {
      min: Math.min(option.priceMin, option.priceMax),
      max: Math.max(option.priceMin, option.priceMax),
      currency: 'USD',
    };
  }

  if (option.priceUnit === 'total' && typeof option.price === 'number' && option.price > 0) {
    return {
      min: option.price,
      max: option.price,
      currency: 'USD',
    };
  }

  return {
    min: daily.min * days,
    max: daily.max * days,
    currency: 'USD',
  };
}

export function canDisplayParkingPrice(option: PriceableParkingLike): boolean {
  const total = deriveParkingTotalRange(option, null);
  return total.min > 0 && total.max > 0;
}

export function formatParkingPriceLine(
  option: PriceableParkingLike,
  tripData: TripData | null,
): ParkingPriceDisplayLine {
  const confidence = resolvePricingConfidence(option);
  const days = Math.max(1, estimateParkingDays(tripData));
  const total = deriveParkingTotalRange(option, tripData);
  const label = formatPricingConfidenceLabel(confidence);

  const daily =
    option.priceUnit === 'total' &&
    typeof option.price === 'number' &&
    option.price > 0
      ? {
          min: Math.round(option.price / days),
          max: Math.round(option.price / days),
          currency: 'USD' as const,
        }
      : deriveParkingDailyRange(option);

  const dailyText = formatMoneyRange(daily.min, daily.max);
  const totalText = formatMoneyRange(total.min, total.max);
  const dailyIsExact = daily.min === daily.max;
  const totalIsExact = total.min === total.max;
  const showDailyApprox =
    !dailyIsExact || confidence === 'estimated' || !totalIsExact;
  const hasDisplayableTotal = total.min > 0 && total.max > 0;

  let primary: string;
  let badge: string | null = null;
  let officialRangeCaveat: string | null = null;

  if (confidence === 'live' && totalIsExact) {
    primary = `Live ${totalText} total`;
  } else if (confidence === 'official' && totalIsExact) {
    primary = `Official ${totalText} total`;
  } else if (confidence === 'official') {
    primary = `Estimated ${totalText} total`;
    badge = 'Official rate range';
    officialRangeCaveat =
      option.type === 'official'
        ? 'Final price depends on the garage and rate you choose. Confirm with the airport.'
        : 'Final price depends on the rate you choose. Confirm on the official site.';
  } else if (confidence === 'recent') {
    primary = totalIsExact ? `Recent ${totalText} total` : `Estimated ${totalText} total`;
  } else if (confidence === 'final_on_provider' && !hasDisplayableTotal) {
    primary = 'Check provider';
  } else if (confidence === 'estimated' || !totalIsExact) {
    primary = `Estimated ${totalText} total`;
    badge = 'Estimated range';
  } else if (confidence === 'final_on_provider') {
    primary = `Estimated ${totalText} total`;
    badge = 'Estimated range';
  } else {
    primary = `${label} ${totalText} total`;
  }

  const dailyPrefix = showDailyApprox && !dailyIsExact ? '~' : '';
  const baseSecondary = dailyIsExact
    ? `Based on ${dailyPrefix}${formatMoney(daily.min)}/day × ${days} day${days === 1 ? '' : 's'}`
    : `Based on ${dailyPrefix}${dailyText}/day × ${days} day${days === 1 ? '' : 's'}`;
  const secondary = officialRangeCaveat
    ? `${baseSecondary}. ${officialRangeCaveat}`
    : confidence === 'final_on_provider' || confidence === 'estimated' || badge === 'Estimated range'
      ? `${baseSecondary}. Provider controls final price.`
      : baseSecondary;

  return {
    primary,
    secondary,
    confidence,
    badge,
  };
}

export function formatOptionPrice(option: {
  price?: number;
  priceMin?: number;
  priceMax?: number;
  priceDisplay?: string;
  priceUnit?: string;
  priceSource?: string;
  type?: string;
  trustStatus?: string;
  priceFreshness?: string;
}): string {
  const line = formatParkingPriceLine(
    {
      price: option.price ?? 0,
      priceMin: option.priceMin,
      priceMax: option.priceMax,
      priceDisplay: option.priceDisplay as PriceableParkingLike['priceDisplay'],
      priceUnit: option.priceUnit as PriceableParkingLike['priceUnit'],
      priceSource: option.priceSource as PriceableParkingLike['priceSource'],
      type: option.type as PriceableParkingLike['type'],
      trustStatus: option.trustStatus as PriceableParkingLike['trustStatus'],
      priceFreshness: option.priceFreshness as PriceableParkingLike['priceFreshness'],
    },
    null,
  );

  return line.primary;
}

export function getParkingTotalFromRange(
  option: PriceableParkingLike,
  tripData: TripData | null,
): number {
  const total = deriveParkingTotalRange(option, tripData);
  return Math.round((total.min + total.max) / 2);
}

export function getParkingDailyFromRange(
  option: PriceableParkingLike,
  tripData: TripData | null,
): number {
  const daily = deriveParkingDailyRange(option);
  if (daily.min === daily.max) {
    if (option.priceUnit === 'total') {
      const days = Math.max(1, estimateParkingDays(tripData));
      return Math.round(daily.min / days);
    }
    return daily.min;
  }
  return Math.round((daily.min + daily.max) / 2);
}
