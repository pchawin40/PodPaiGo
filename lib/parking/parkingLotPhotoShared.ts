import { getParkingVisualBadgeLabel } from './parkingLabels';
import type { TripParkingContext } from '../trip/tripContext';

export type ParkingPhotoSource =
  | 'first_party'
  | 'partner'
  | 'provider'
  | 'google_live'
  | 'placeholder';

export type ParkingPhotoSelection = {
  imageUrl: string | null;
  source: ParkingPhotoSource;
  attribution: string | null;
  attributionUrl: string | null;
  requiresGoogleAttribution: boolean;
  /** Set when a Google photo was requested but live PhotoMedia is blocked. */
  safeModeNotice?: string | null;
};

export type ParkingLotPhotoLookup = {
  parkingLotId?: string | null;
  provider?: string | null;
  providerLotId?: string | null;
  googlePlaceId?: string | null;
  airportCode?: string | null;
  googlePhotoName?: string | null;
  lotName?: string | null;
  lotType?: string | null;
  lotCategory?: string | null;
  covered?: boolean;
  transferType?: string | null;
  tripContext?: TripParkingContext;
};

export function isGooglePhotoProxyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('/api/google-place-photo');
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
