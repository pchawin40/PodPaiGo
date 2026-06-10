import type { ParkingOption, TripData } from '../types';
import {
  getParkingComparableCost,
  parkingRankEvidenceLabel,
  type ParkingSortMode,
} from './sortParkingOptions';
import { isParkingRouteUnavailable } from './routeStatus';
import {
  getParkingPriceTier,
  qualifiesForCheapestBadge,
} from './priceReliability';
import { getParkingReviewSummary } from './reviewSummary';

export type ParkingPriorityBadge = {
  key: string;
  semanticKey?: string;
  label: string;
  className: string;
};

const DEFAULT_BADGE_CLASS =
  'border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100';
const POSITIVE_BADGE_CLASS =
  'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100';
const INFO_BADGE_CLASS =
  'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-100';
const WARN_BADGE_CLASS =
  'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100';

function ratingReviewSource(option: ParkingOption): 'google' | 'provider' {
  if (
    option.googlePlaceId ||
    option.googleMapsUri ||
    (option.googleReviews || []).length > 0
  ) {
    return 'google';
  }

  return 'provider';
}

export function getParkingRatingReviewBadgeSemanticKey(
  option: ParkingOption,
): string | null {
  const summary = getParkingReviewSummary(option);
  const hasRating = typeof summary.reviewScore === 'number';
  const hasReviewCount = typeof summary.reviewCount === 'number';
  if (!hasRating && !hasReviewCount) return null;

  return [
    ratingReviewSource(option),
    'rating-review',
    hasRating ? summary.reviewScore!.toFixed(1) : 'no-rating',
    hasReviewCount ? String(summary.reviewCount) : 'no-count',
  ].join(':');
}

function modeHeadlineBadge(
  option: ParkingOption,
  mode: ParkingSortMode,
  tripData: TripData | null,
  peers: ParkingOption[],
): ParkingPriorityBadge | null {
  if (mode === 'fastest') {
    return { key: 'mode-fastest', label: 'Fastest', className: POSITIVE_BADGE_CLASS };
  }

  if (mode === 'best') {
    return { key: 'mode-best', label: 'Best overall', className: POSITIVE_BADGE_CLASS };
  }

  if (mode === 'easiest') {
    return { key: 'mode-easiest', label: 'Easiest', className: POSITIVE_BADGE_CLASS };
  }

  if (mode !== 'cheapest') {
    return null;
  }

  if (qualifiesForCheapestBadge({ option, peers, tripData })) {
    return { key: 'mode-cheapest', label: 'Cheapest', className: POSITIVE_BADGE_CLASS };
  }

  const tier = getParkingPriceTier(option, tripData);
  if (tier === 'estimated_range') {
    return { key: 'estimated-range', label: 'Estimated range', className: WARN_BADGE_CLASS };
  }

  if (tier === 'check_provider' || tier === 'unknown') {
    return { key: 'check-provider', label: 'Check provider', className: DEFAULT_BADGE_CLASS };
  }

  return { key: 'possible-low-estimate', label: 'Possible low estimate', className: WARN_BADGE_CLASS };
}

function parkingReviewBadge(option: ParkingOption): ParkingPriorityBadge | null {
  const summary = getParkingReviewSummary(option);
  if (typeof summary.reviewScore !== 'number') return null;
  const semanticKey = getParkingRatingReviewBadgeSemanticKey(option);
  const rating = summary.reviewScore.toFixed(1);
  const count =
    typeof summary.reviewCount === 'number'
      ? ` · ${summary.reviewCount.toLocaleString()} reviews`
      : '';
  return {
    key: 'reviews',
    semanticKey: semanticKey ?? undefined,
    label: `★ ${rating}${count}`,
    className:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100',
  };
}

function transferBadge(option: ParkingOption): ParkingPriorityBadge | null {
  const walkMinutes =
    option.walkingMinutes ??
    option.transferToTerminalMinutes ??
    option.shuttleMinutes ??
    null;

  if (typeof walkMinutes === 'number' && walkMinutes > 0 && walkMinutes <= 6) {
    return { key: 'closest-walk', label: 'Closest walk', className: POSITIVE_BADGE_CLASS };
  }

  if (option.transferType === 'shuttle') {
    return { key: 'shuttle', label: 'Shuttle', className: DEFAULT_BADGE_CLASS };
  }

  return null;
}

export function buildParkingPriorityBadges(args: {
  option: ParkingOption;
  mode: ParkingSortMode;
  tripData?: TripData | null;
  peers?: ParkingOption[];
  maxBadges?: number;
  excludeSemanticKeys?: Array<string | null | undefined>;
}): ParkingPriorityBadge[] {
  const maxBadges = args.maxBadges ?? 4;
  const tripData = args.tripData ?? null;
  const peers = args.peers ?? [args.option];
  const totalCost = getParkingComparableCost(args.option, tripData);
  const priceTier = getParkingPriceTier(args.option, tripData);
  const excludedSemanticKeys = new Set(
    (args.excludeSemanticKeys || []).filter((key): key is string => Boolean(key)),
  );

  const candidates: Array<ParkingPriorityBadge | null> = [
    modeHeadlineBadge(args.option, args.mode, tripData, peers),
    totalCost === 0 ? { key: 'free', label: 'Verified free', className: POSITIVE_BADGE_CLASS } : null,
    args.mode !== 'cheapest'
      ? (() => {
          const evidence = parkingRankEvidenceLabel(args.option, args.mode, {
            isUnavailable: isParkingRouteUnavailable,
            totalCost: (parking) => getParkingComparableCost(parking, tripData),
            tripData,
            peers,
          });
          if (!evidence) return null;
          if (['Cheapest', 'Fastest', 'Easiest', 'Best overall'].includes(evidence)) return null;
          return { key: `evidence-${evidence}`, label: evidence, className: POSITIVE_BADGE_CLASS };
        })()
      : null,
    priceTier === 'live_exact'
      ? { key: 'live-price', label: 'Live price', className: INFO_BADGE_CLASS }
      : priceTier === 'official'
        ? { key: 'official-price', label: 'Official price', className: INFO_BADGE_CLASS }
        : null,
    transferBadge(args.option),
    parkingReviewBadge(args.option),
  ];

  const seen = new Set<string>();
  const seenSemantic = new Set<string>();
  const badges: ParkingPriorityBadge[] = [];

  for (const badge of candidates) {
    if (!badge || seen.has(badge.key)) continue;
    if (badge.semanticKey && excludedSemanticKeys.has(badge.semanticKey)) continue;
    if (badge.semanticKey && seenSemantic.has(badge.semanticKey)) continue;
    seen.add(badge.key);
    if (badge.semanticKey) seenSemantic.add(badge.semanticKey);
    badges.push(badge);
    if (badges.length >= maxBadges) break;
  }

  return badges;
}
