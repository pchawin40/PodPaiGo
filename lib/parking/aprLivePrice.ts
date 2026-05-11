import { mergeParkingRouteStatus, withStableParkingRouteStatus } from './routeStatus';

type AprPricedOption = {
  sourceLink?: string;
  bestFor?: string[];
  price?: number;
  priceDisplay?: string;
  priceUnit?: string;
  trustStatus?: string;
  priceNote?: string;
  routeUnavailable?: boolean;
  routeTrustStatus?: 'live' | 'verified-source' | 'estimated' | 'fallback';
  routeUnavailableReason?: string;
};

export function getAprLivePrice(
  option: AprPricedOption,
  aprLivePrices: Record<string, number>
): number | null {
  const sourceLink = option.sourceLink;
  if (!sourceLink) return null;

  const livePrice = aprLivePrices[sourceLink];
  return typeof livePrice === 'number' && livePrice > 0 ? livePrice : null;
}

export function withAprLivePrice<T extends AprPricedOption>(
  option: T,
  aprLivePrices: Record<string, number>
): T {
  const livePrice = getAprLivePrice(option, aprLivePrices);
  if (livePrice == null) return withStableParkingRouteStatus(option) as T;

  return mergeParkingRouteStatus(option, {
    ...option,
    price: livePrice,
    priceDisplay: 'from-per-day',
    priceUnit: 'per-day',
    trustStatus: 'live',
    priceNote: 'APR listed price',
    bestFor: Array.from(new Set(['APR listed price', ...(option.bestFor || [])])),
  }) as T;
}
