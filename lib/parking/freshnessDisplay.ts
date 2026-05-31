import type { ParkingOption } from '../types';
import type { PriceFreshness } from '../providers/parking/types';

export function formatPriceFreshnessLabel(
  freshness: PriceFreshness | undefined,
): 'LIVE' | 'RECENT' | 'ESTIMATED' | 'UNKNOWN' {
  switch (freshness) {
    case 'live':
      return 'LIVE';
    case 'recent':
      return 'RECENT';
    case 'estimated':
      return 'ESTIMATED';
    default:
      return 'UNKNOWN';
  }
}

export function priceFreshnessBadgeClass(
  freshness: PriceFreshness | undefined,
): string {
  switch (freshness) {
    case 'live':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'recent':
      return 'border-blue-200 bg-blue-50 text-blue-800';
    case 'estimated':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    default:
      return 'border-zinc-200 bg-zinc-50 text-zinc-600';
  }
}

export function resolveParkingFreshness(option: ParkingOption): {
  label: 'LIVE' | 'RECENT' | 'ESTIMATED' | 'UNKNOWN';
  providerSource?: string;
  fetchedAt?: string;
} {
  return {
    label: formatPriceFreshnessLabel(option.priceFreshness),
    providerSource: option.providerSource,
    fetchedAt: option.fetchedAt,
  };
}
