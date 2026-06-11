import type { ParkingOption } from '../types';

type ReviewSummaryCarrier = ParkingOption & {
  googleRating?: unknown;
  googleReviewCount?: unknown;
  rating?: unknown;
  placeRating?: unknown;
  userRatingsTotal?: unknown;
  userRatingCount?: unknown;
  reviewsSummary?: {
    rating?: unknown;
    reviewScore?: unknown;
    reviewCount?: unknown;
    userRatingsTotal?: unknown;
    userRatingCount?: unknown;
  } | null;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function ratingValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed != null && parsed > 0 && parsed <= 5) return parsed;
  }
  return undefined;
}

function countValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed != null && parsed >= 0) return Math.round(parsed);
  }
  return undefined;
}

export function getParkingReviewSummary(option: ParkingOption): {
  reviewScore?: number;
  reviewCount?: number;
} {
  const carrier = option as ReviewSummaryCarrier;
  const summary = carrier.reviewsSummary;

  return {
    reviewScore: ratingValue(
      carrier.reviewScore,
      carrier.googleRating,
      carrier.rating,
      carrier.placeRating,
      summary?.reviewScore,
      summary?.rating,
    ),
    reviewCount: countValue(
      carrier.reviewCount,
      carrier.googleReviewCount,
      carrier.userRatingsTotal,
      carrier.userRatingCount,
      summary?.reviewCount,
      summary?.userRatingsTotal,
      summary?.userRatingCount,
    ),
  };
}

export function normalizeParkingReviewSummary<T extends ParkingOption>(option: T): T {
  const summary = getParkingReviewSummary(option);

  if (
    summary.reviewScore === option.reviewScore &&
    summary.reviewCount === option.reviewCount
  ) {
    return option;
  }

  return {
    ...option,
    reviewScore: summary.reviewScore ?? option.reviewScore,
    reviewCount: summary.reviewCount ?? option.reviewCount,
  };
}
