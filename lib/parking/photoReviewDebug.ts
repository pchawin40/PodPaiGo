import type { ParkingOption } from '../types';

type ParkingDebugLike = Partial<ParkingOption> & {
  appParkingId?: string | number | null;
  cacheKey?: string | null;
  displayName?: string | null;
  googlePhotoName?: string | null;
  googlePhotoNames?: string[] | null;
  googleReviews?: unknown[] | null;
  imageUrl?: string | null;
  images?: string[] | null;
  lotName?: string | null;
  parkingLotId?: string | number | null;
  parking_lot_id?: string | number | null;
  photoName?: string | null;
  photoNames?: string[] | null;
  provider?: string | null;
  providerLotId?: string | number | null;
  rating?: number | null;
  reviewCount?: number | null;
  reviews?: unknown[] | null;
  source?: string | null;
  sourceId?: string | number | null;
  userRatingCount?: number | null;
};

type PhotoReviewDebugExtra = {
  selectedVisualSource?: 'google photo' | 'provider image' | 'illustration' | 'none' | string | null;
  illustrationReason?: string | null;
  reason?: string | null;
  [key: string]: unknown;
};

function isDevTraceEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.DEBUG_LOGS === 'true' ||
    process.env.NEXT_PUBLIC_DEBUG_PARKING_PHOTO_REVIEW === 'true'
  );
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function isGooglePhotoProxyUrl(url: string | null | undefined): boolean {
  return Boolean(url?.includes('/api/google-place-photo'));
}

export function isParkingPhotoReviewDebugTarget(option: ParkingDebugLike | null | undefined): boolean {
  if (!option) return false;
  if (process.env.DEBUG_PARKING_PHOTO_REVIEW_ALL === 'true') return true;
  if (process.env.NEXT_PUBLIC_DEBUG_PARKING_PHOTO_REVIEW_ALL === 'true') return true;

  const text = [
    option.name,
    option.lotName,
    option.displayName,
    option.googlePlaceName,
    option.googlePlaceAddress,
    option.googleMapsUri,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return text.includes('jiffy');
}

export function parkingPhotoReviewDebugPayload(
  option: ParkingDebugLike,
  extra: PhotoReviewDebugExtra = {},
): Record<string, unknown> {
  const googlePhotoNames = [
    ...asStringArray(option.googlePhotoNames),
    ...asStringArray(option.photoNames),
  ];
  const googlePhotoName = firstString(option.googlePhotoName, option.photoName, googlePhotoNames[0]);
  const imageUrl = firstString(option.imageUrl, option.images?.[0]);
  const providerImageUrl = imageUrl && !isGooglePhotoProxyUrl(imageUrl) ? imageUrl : null;
  const reviews = Array.isArray(option.googleReviews)
    ? option.googleReviews
    : Array.isArray(option.reviews)
      ? option.reviews
      : [];

  return {
    stageNote: extra.stageNote ?? null,
    displayName: firstString(option.displayName, option.googlePlaceName, option.lotName, option.name),
    name: firstString(option.name, option.lotName),
    appParkingId: option.appParkingId ?? option.id ?? null,
    provider: firstString(
      option.provider,
      option.bookingProvider,
      option.providerSource,
      option.sourceName,
      option.source,
    ),
    providerLotId: option.providerLotId ?? option.sourceId ?? null,
    parkingLotId: option.parkingLotId ?? option.parking_lot_id ?? null,
    supabaseParkingLotId: option.parkingLotId ?? option.parking_lot_id ?? null,
    cacheKey: option.cacheKey ?? null,
    googlePlaceId: option.googlePlaceId ?? null,
    googlePhotoNamePresent: Boolean(googlePhotoName),
    googlePhotoName: googlePhotoName ? '[present]' : null,
    googlePhotoNamesCount: googlePhotoNames.length || (googlePhotoName ? 1 : 0),
    providerImageUrlPresent: Boolean(providerImageUrl),
    providerImageUrl: providerImageUrl ? '[present]' : null,
    imageUrlPresent: Boolean(imageUrl),
    imageUrlIsGoogleProxy: isGooglePhotoProxyUrl(imageUrl),
    rating: firstNumber(option.reviewScore, option.rating),
    reviewCount: firstNumber(option.reviewCount, option.userRatingCount),
    userRatingCount: firstNumber(option.userRatingCount, option.reviewCount),
    googleReviewsCount: reviews.length,
    reviewSourceUrl: firstString(option.googleMapsUri, option.mapLink, option.sourceLink),
    selectedVisualSource: extra.selectedVisualSource ?? null,
    reasonIllustrationUsed: extra.illustrationReason ?? extra.reason ?? null,
    ...extra,
  };
}

export function logParkingPhotoReviewTrace(
  stage: string,
  option: ParkingDebugLike | null | undefined,
  extra: PhotoReviewDebugExtra = {},
): void {
  if (!isDevTraceEnabled() || !option || !isParkingPhotoReviewDebugTarget(option)) return;

  console.log(`[parking-photo-review] ${stage} ${JSON.stringify(parkingPhotoReviewDebugPayload(option, extra))}`);
}
