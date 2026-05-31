import type { ParkingOption } from '../types';
import type { PriceFreshness } from '../providers/parking/types';
import {
  formatPricingConfidenceLabel,
  pricingConfidenceBadgeClass,
  resolvePricingConfidence,
} from '../access/pricingLadder';
import type { PricingConfidenceLabel } from '../access/types';

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

export function resolveParkingPricingBadge(option: ParkingOption): {
  label: string;
  className: string;
  confidence: PricingConfidenceLabel;
  providerSource?: string;
  fetchedAt?: string;
} {
  const confidence = resolvePricingConfidence(option);

  return {
    label: formatPricingConfidenceLabel(confidence),
    className: pricingConfidenceBadgeClass(confidence),
    confidence,
    providerSource: option.providerSource,
    fetchedAt: option.fetchedAt,
  };
}

export function resolveParkingFreshness(option: ParkingOption): {
  label: string;
  className: string;
  confidence: PricingConfidenceLabel;
  providerSource?: string;
  fetchedAt?: string;
} {
  return resolveParkingPricingBadge(option);
}
