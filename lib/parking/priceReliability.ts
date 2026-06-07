import type { ParkingOption, TripData } from '../types';
import { getParkingTotalPrice } from './priceDisplay';
import { resolveParkingPriceTrust } from './priceTrust';

export type ParkingPriceTier =
  | 'live_exact'
  | 'official'
  | 'provider_estimate'
  | 'estimated_range'
  | 'check_provider'
  | 'unknown';

export function getParkingPriceTier(
  option: ParkingOption,
  tripData: TripData | null,
): ParkingPriceTier {
  const trust = resolveParkingPriceTrust(option, tripData);

  if (trust.kind === 'live_final_provider_price' || trust.kind === 'live_marketplace_price') {
    return 'live_exact';
  }

  if (trust.kind === 'official_rate') {
    return 'official';
  }

  if (trust.kind === 'baseline_estimate') {
    return 'provider_estimate';
  }

  if (trust.kind === 'estimated_range') {
    return 'estimated_range';
  }

  if (trust.kind === 'check_provider' || trust.kind === 'price_unknown') {
    return 'check_provider';
  }

  return 'unknown';
}

export function isReliableParkingTotal(
  option: ParkingOption,
  tripData: TripData | null,
): boolean {
  const tier = getParkingPriceTier(option, tripData);
  return tier === 'live_exact' || tier === 'official' || tier === 'provider_estimate';
}

export function getReliableParkingTotal(
  option: ParkingOption,
  tripData: TripData | null,
): number | null {
  if (!isReliableParkingTotal(option, tripData)) {
    return null;
  }

  const total = getParkingTotalPrice(option, tripData);
  return typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : null;
}

export function getEstimatedParkingTotal(
  option: ParkingOption,
  tripData: TripData | null,
): number | null {
  const tier = getParkingPriceTier(option, tripData);
  if (tier !== 'estimated_range') {
    return null;
  }

  const total = getParkingTotalPrice(option, tripData);
  return typeof total === 'number' && Number.isFinite(total) && total >= 0 ? total : null;
}

function priceTierSortPenalty(tier: ParkingPriceTier): number {
  switch (tier) {
    case 'live_exact':
      return 0;
    case 'official':
      return 1;
    case 'provider_estimate':
      return 2;
    case 'estimated_range':
      return 50_000;
    case 'check_provider':
      return 80_000;
    default:
      return 100_000;
  }
}

export function parkingComparableCostWithReliability(
  option: ParkingOption,
  tripData: TripData | null,
  baseCost: number,
): number {
  return baseCost + priceTierSortPenalty(getParkingPriceTier(option, tripData));
}

export function findLowestReliableParkingTotal(
  options: ParkingOption[],
  tripData: TripData | null,
): number | null {
  let lowest: number | null = null;

  for (const option of options) {
    const total = getReliableParkingTotal(option, tripData);
    if (total == null) continue;
    if (lowest == null || total < lowest) {
      lowest = total;
    }
  }

  return lowest;
}

export function qualifiesForCheapestBadge(args: {
  option: ParkingOption;
  peers: ParkingOption[];
  tripData: TripData | null;
}): boolean {
  const reliableTotal = getReliableParkingTotal(args.option, args.tripData);
  const lowestReliable = findLowestReliableParkingTotal(args.peers, args.tripData);

  if (reliableTotal != null && lowestReliable != null) {
    return reliableTotal <= lowestReliable + 0.01;
  }

  if (lowestReliable != null) {
    return false;
  }

  const estimatedTotal = getEstimatedParkingTotal(args.option, args.tripData);
  if (estimatedTotal == null) {
    return false;
  }

  let lowestEstimate: number | null = null;
  for (const peer of args.peers) {
    const peerEstimate = getEstimatedParkingTotal(peer, args.tripData);
    if (peerEstimate == null) continue;
    if (lowestEstimate == null || peerEstimate < lowestEstimate) {
      lowestEstimate = peerEstimate;
    }
  }

  return lowestEstimate != null && estimatedTotal <= lowestEstimate + 0.01;
}

export function cheapestBadgeExplanation(
  option: ParkingOption,
  peers: ParkingOption[],
  tripData: TripData | null,
): string {
  const reliableTotal = getReliableParkingTotal(option, tripData);
  const lowestReliable = findLowestReliableParkingTotal(peers, tripData);

  if (reliableTotal != null && lowestReliable != null && reliableTotal <= lowestReliable + 0.01) {
    return 'Lowest reliable live total';
  }

  return 'Lowest estimate among options without live prices';
}
