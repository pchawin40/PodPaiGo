import type { ParkingOption } from '../../../types';
import { isLiveParkWhizOption } from '../../../parking/parkWhizMatch';
import { logParkingPhotoReviewTrace } from '../../../parking/photoReviewDebug';

export function normalizeLotName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function parkingOptionRank(option: ParkingOption): number {
  if (isLiveParkWhizOption(option)) return 100;
  if (option.priceDisplay === 'live') return 80;
  if (option.pricingConfidence === 'live') return 70;
  if (option.priceSource === 'official-rate') return 60;
  return 0;
}

function pickPositive(...values: Array<number | null | undefined>): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

function mergeParkingDuplicates(primary: ParkingOption, secondary: ParkingOption): ParkingOption {
  const driveMinutes = pickPositive(
    primary.originToParkingMinutes,
    secondary.originToParkingMinutes,
  );

  const coordSource =
    primary.coordinateSource === 'google_place'
      ? primary
      : secondary.coordinateSource === 'google_place'
        ? secondary
        : primary.coordinateSource === 'geocoded_address'
          ? primary
          : secondary.coordinateSource === 'geocoded_address'
            ? secondary
            : primary;

  return {
    ...secondary,
    ...primary,
    id: primary.id || secondary.id,
    originToParkingMinutes: driveMinutes,
    routeToParkingMinutes: driveMinutes,
    originDriveSource: primary.originDriveSource ?? secondary.originDriveSource,
    routesUsedCanonicalCoords:
      primary.routesUsedCanonicalCoords ?? secondary.routesUsedCanonicalCoords,
    routeTargetLat: primary.routeTargetLat ?? secondary.routeTargetLat,
    routeTargetLng: primary.routeTargetLng ?? secondary.routeTargetLng,
    providerLat: primary.providerLat ?? secondary.providerLat,
    providerLng: primary.providerLng ?? secondary.providerLng,
    canonicalLat: coordSource.canonicalLat ?? primary.canonicalLat ?? secondary.canonicalLat,
    canonicalLng: coordSource.canonicalLng ?? primary.canonicalLng ?? secondary.canonicalLng,
    canonicalAddress:
      coordSource.canonicalAddress ?? primary.canonicalAddress ?? secondary.canonicalAddress,
    coordinateSource:
      coordSource.coordinateSource ?? primary.coordinateSource ?? secondary.coordinateSource,
    lat: coordSource.lat ?? primary.lat ?? secondary.lat,
    lng: coordSource.lng ?? primary.lng ?? secondary.lng,
    googlePlaceId: primary.googlePlaceId ?? secondary.googlePlaceId,
    googleMapsUri: primary.googleMapsUri ?? secondary.googleMapsUri,
    googlePhotoName: primary.googlePhotoName ?? secondary.googlePhotoName,
    googlePhotoNames: primary.googlePhotoNames ?? secondary.googlePhotoNames,
    googleReviews: primary.googleReviews ?? secondary.googleReviews,
    googleReviewsFetchedAt: primary.googleReviewsFetchedAt ?? secondary.googleReviewsFetchedAt,
    googleReviewsExpiresAt: primary.googleReviewsExpiresAt ?? secondary.googleReviewsExpiresAt,
    googlePlaceName: primary.googlePlaceName ?? secondary.googlePlaceName,
    googlePlaceAddress: primary.googlePlaceAddress ?? secondary.googlePlaceAddress,
    parkingRouteDebug: primary.parkingRouteDebug ?? secondary.parkingRouteDebug,
    imageUrl: secondary.imageUrl ?? primary.imageUrl,
    images: secondary.images ?? primary.images,
    reviewScore: secondary.reviewScore ?? primary.reviewScore,
    reviewCount: secondary.reviewCount ?? primary.reviewCount,
    sourceLink: isLiveParkWhizOption(primary)
      ? primary.sourceLink
      : primary.sourceLink ?? secondary.sourceLink,
  };
}

export function dedupeParkingOptions(options: ParkingOption[]): ParkingOption[] {
  const byKey = new Map<string, ParkingOption>();

  for (const option of options) {
    const key = normalizeLotName(option.name);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, option);
      continue;
    }

    const primary =
      parkingOptionRank(option) >= parkingOptionRank(existing) ? option : existing;
    const secondary = primary === option ? existing : option;

    const merged = mergeParkingDuplicates(primary, secondary);
    logParkingPhotoReviewTrace('after_provider_merge_dedupe', merged, {
      stageNote: 'dedupe merged duplicate parking options',
      primaryName: primary.name,
      primaryProvider: primary.bookingProvider ?? primary.sourceName ?? null,
      secondaryName: secondary.name,
      secondaryProvider: secondary.bookingProvider ?? secondary.sourceName ?? null,
      selectedVisualSource:
        merged.googlePhotoName || merged.googlePhotoNames?.length
          ? 'google photo'
          : merged.imageUrl || merged.images?.length
            ? 'provider image'
            : 'illustration',
      illustrationReason:
        merged.googlePhotoName || merged.googlePhotoNames?.length || merged.imageUrl || merged.images?.length
          ? null
          : 'no_google_or_provider_photo_metadata_after_dedupe',
    });
    byKey.set(key, merged);
  }

  return Array.from(byKey.values());
}
