import { getParkingVisualBadgeLabel } from './parkingLabels';
import type { TripParkingContext } from '../trip/tripContext';

export type ParkingPhotoSource =
  | 'first_party'
  | 'partner'
  | 'provider'
  | 'google_live'
  | 'google_business'
  | 'placeholder';

export type ParkingPhotoSelection = {
  imageUrl: string | null;
  source: ParkingPhotoSource;
  attribution: string | null;
  attributionUrl: string | null;
  requiresGoogleAttribution: boolean;
  /** Set when a Google photo was requested but live PhotoMedia is blocked. */
  safeModeNotice?: string | null;
  /** Diagnostic reason when the selector had to fall back to a placeholder. */
  fallbackReason?: string | null;
};

export type ParkingPhotoPriority =
  | 'smart-pick'
  | 'top'
  | 'visible'
  | 'background'
  | 'manual';

export function parkingPhotoPriorityForMoreParkingRank(
  rank: number,
  collapsedParkingDisplayCount: number,
): ParkingPhotoPriority {
  if (rank <= 3) return 'top';
  if (rank <= collapsedParkingDisplayCount) return 'background';
  return 'visible';
}

export type ParkingLotPhotoLookup = {
  parkingLotId?: string | null;
  provider?: string | null;
  providerLotId?: string | null;
  googlePlaceId?: string | null;
  airportCode?: string | null;
  googlePhotoName?: string | null;
  lotName?: string | null;
  lotAddress?: string | null;
  lotType?: string | null;
  lotCategory?: string | null;
  covered?: boolean;
  transferType?: string | null;
  tripContext?: TripParkingContext;
};

export type ParkingPhotoFieldCarrier = {
  imageUrl?: string | null;
  images?: string[] | null;
  photoSource?: ParkingPhotoSource | string | null;
  photoAttribution?: string | null;
  photoAttributionUrl?: string | null;
  photoAttributions?: string[] | null;
  requiresGoogleAttribution?: boolean | null;
};

export function isGooglePhotoProxyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('/api/google-place-photo');
}

export function isPlaceholderParkingPhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return String(url).includes('/assets/parking/');
}

function photoUrlsFromCarrier(candidate: ParkingPhotoFieldCarrier): string[] {
  return Array.from(
    new Set(
      [candidate.imageUrl, ...(candidate.images || [])]
        .filter((url): url is string => typeof url === 'string')
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  );
}

function imageFieldsFromCandidate(
  candidate: ParkingPhotoFieldCarrier,
  imageUrl: string,
  realOnly: boolean,
) {
  const urls = photoUrlsFromCarrier(candidate).filter((url) =>
    realOnly ? !isPlaceholderParkingPhotoUrl(url) : isPlaceholderParkingPhotoUrl(url),
  );
  const images = Array.from(new Set([imageUrl, ...urls]));

  return {
    imageUrl,
    images,
    photoSource: candidate.photoSource as ParkingPhotoSource | undefined,
    photoAttribution: candidate.photoAttribution ?? candidate.photoAttributions?.[0] ?? undefined,
    photoAttributionUrl: candidate.photoAttributionUrl ?? undefined,
    photoAttributions: candidate.photoAttributions?.length
      ? candidate.photoAttributions
      : candidate.photoAttribution
        ? [candidate.photoAttribution]
        : undefined,
    requiresGoogleAttribution: candidate.requiresGoogleAttribution ?? undefined,
  };
}

export function selectBestParkingPhotoFields(
  ...candidates: ParkingPhotoFieldCarrier[]
): {
  imageUrl?: string;
  images?: string[];
  photoSource?: ParkingPhotoSource;
  photoAttribution?: string;
  photoAttributionUrl?: string;
  photoAttributions?: string[];
  requiresGoogleAttribution?: boolean;
} {
  for (const candidate of candidates) {
    if (candidate.photoSource === 'placeholder') continue;

    const imageUrl = photoUrlsFromCarrier(candidate).find(
      (url) => !isPlaceholderParkingPhotoUrl(url),
    );
    if (imageUrl) return imageFieldsFromCandidate(candidate, imageUrl, true);
  }

  for (const candidate of candidates) {
    const imageUrl = photoUrlsFromCarrier(candidate).find(isPlaceholderParkingPhotoUrl);
    if (imageUrl) return imageFieldsFromCandidate(candidate, imageUrl, false);
  }

  return {};
}

export function hasRealParkingPhoto(candidate: ParkingPhotoFieldCarrier | null | undefined): boolean {
  if (!candidate || candidate.photoSource === 'placeholder') return false;
  return photoUrlsFromCarrier(candidate).some((url) => !isPlaceholderParkingPhotoUrl(url));
}

function fallbackKind(option: ParkingLotPhotoLookup, context: TripParkingContext): string {
  const label = getParkingVisualBadgeLabel(
    {
      name: option.lotName ?? undefined,
      type: option.lotType ?? undefined,
      category: option.lotCategory ?? undefined,
      covered: option.covered,
      transferType: option.transferType as 'walk' | 'shuttle' | 'airport-garage' | 'transit' | undefined,
    },
    context,
  ).toLowerCase();

  if (label.includes('park & ride')) return 'park-and-ride';
  if (label.includes('hotel')) return 'hotel-parking';
  if (context === 'city_destination_trip') {
    if (label.includes('garage') || label.includes('covered')) return 'airport-garage';
    return 'airport-parking';
  }
  if (label.includes('garage')) return 'airport-garage';
  if (label.includes('shuttle')) return 'off-site-shuttle';
  return 'airport-parking';
}

export function buildPlaceholderParkingPhoto(
  lot: ParkingLotPhotoLookup,
  tripContext: TripParkingContext = 'airport_trip',
): ParkingPhotoSelection {
  const kind = fallbackKind(lot, tripContext);

  return {
    imageUrl: `/assets/parking/${kind}.svg`,
    source: 'placeholder',
    attribution: null,
    attributionUrl: null,
    requiresGoogleAttribution: false,
  };
}

export function applyParkingPhotoSelectionToOption<T extends Record<string, unknown>>(
  option: T,
  selection: ParkingPhotoSelection,
): T & {
  imageUrl?: string;
  images?: string[];
  photoAttributions?: string[];
  photoSource?: ParkingPhotoSelection['source'];
  photoAttribution?: string | null;
  photoAttributionUrl?: string | null;
  requiresGoogleAttribution?: boolean;
} {
  const next = {
    ...option,
    photoSource: selection.source,
    photoAttribution: selection.attribution,
    photoAttributionUrl: selection.attributionUrl,
    requiresGoogleAttribution: selection.requiresGoogleAttribution,
    photoAttributions: selection.attribution ? [selection.attribution] : [],
  };

  if (selection.imageUrl) {
    return {
      ...next,
      imageUrl: selection.imageUrl,
      images: [selection.imageUrl],
    };
  }

  return next;
}
