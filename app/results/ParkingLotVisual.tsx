'use client';

import { useEffect, useMemo, useState } from 'react';
import { googlePlacePhotoImageUrl } from '../../lib/providers/parking/shared/urls';
import type { ParkingOption } from '../../lib/types';
import {
  buildPlaceholderParkingPhoto,
  isGooglePhotoProxyUrl,
  type ParkingPhotoPriority,
  type ParkingPhotoSelection,
} from '../../lib/parking/parkingLotPhotoShared';
import { normalizeParkingLotName } from '../../lib/parking/googlePlaceMatchUtils';
import type { TripParkingContext } from '../../lib/trip/tripContext';
import {
  GOOGLE_MAPS_ATTRIBUTION_LABEL,
  GOOGLE_MAPS_ATTRIBUTION_URL,
} from '../../lib/parking/googlePlacesSafeMode';
import { logParkingPhotoReviewTrace } from '../../lib/parking/photoReviewDebug';

type ParkingLike = {
    id?: string;
    name?: string;
    type?: string;
    category?: string;
    images?: string[];
    imageUrl?: string;
    photoAttributions?: string[];
    photoSource?: ParkingPhotoSelection['source'];
    photoAttribution?: string | null;
    photoAttributionUrl?: string | null;
    requiresGoogleAttribution?: boolean;
    providerLotId?: string;
    bookingProvider?: string;
    providerSource?: string;
    address?: string;
    normalizedAddress?: string;
    routeDestination?: string;
    googlePlaceId?: string;
    googlePhotoName?: string;
    googlePhotoNames?: string[];
    photoName?: string;
    photoNames?: string[];
    transferType?: string;
    covered?: boolean;
};

const photoSelectionCache = new Map<string, ParkingPhotoSelection>();
const photoRequestInFlight = new Map<string, Promise<ParkingPhotoSelection>>();

function parkingPhotoClientDebugLog(event: string, payload: Record<string, unknown>): void {
  if (
    process.env.DEBUG_LOGS === 'true' ||
    process.env.NEXT_PUBLIC_DEBUG_PARKING_PHOTO_REVIEW === 'true'
  ) {
    console.log(event, payload);
  }
}

function normalizeClientText(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLivePhotoPriority(priority: ParkingPhotoPriority): boolean {
  return (
    priority === 'smart-pick' ||
    priority === 'top' ||
    priority === 'visible' ||
    priority === 'manual'
  );
}

function canUseCachedPhotoSelection(
  priority: ParkingPhotoPriority,
  selection: ParkingPhotoSelection,
): boolean {
  return !(
    isLivePhotoPriority(priority) &&
    selection.source === 'placeholder' &&
    selection.fallbackReason === 'live_lookup_skipped_priority'
  );
}

function stablePhotoKey(option: ParkingLike, airportCode?: string | null): string {
  const lotName = option.name || '';
  const normalizedName = normalizeParkingLotName(lotName) || normalizeClientText(lotName);
  const address = option.address || option.normalizedAddress || option.routeDestination || '';
  const normalizedAddress = normalizeClientText(address);
  const provider = normalizeClientText(option.bookingProvider || option.providerSource || '');
  const airport = String(airportCode || '').trim().toUpperCase();

  return [
    airport || 'UNKNOWN',
    normalizedName ? `name:${normalizedName}` : `id:${option.id || option.providerLotId || 'unknown'}`,
    normalizedAddress ? `addr:${normalizedAddress}` : '',
    provider ? `provider:${provider}` : '',
  ].filter(Boolean).join('|');
}

export function resetParkingLotVisualPhotoCacheForTests(): void {
  photoSelectionCache.clear();
  photoRequestInFlight.clear();
}

function googlePhotoNameFromOption(option: ParkingLike): string | null {
  return (
    option.googlePhotoName ||
    option.googlePhotoNames?.[0] ||
    option.photoName ||
    option.photoNames?.[0] ||
    null
  );
}

function googleSelectionFromOption(option: ParkingLike): ParkingPhotoSelection | null {
  const imageUrl = googlePlacePhotoImageUrl(googlePhotoNameFromOption(option));
  if (!imageUrl) return null;

  return {
    imageUrl,
    source: option.photoSource === 'google_business' ? 'google_business' : 'google_live',
    attribution: option.photoAttribution ?? option.photoAttributions?.[0] ?? 'Photo © Google',
    attributionUrl: option.photoAttributionUrl ?? 'https://maps.google.com',
    requiresGoogleAttribution: true,
  };
}

function providerSelectionFromOption(option: ParkingLike): ParkingPhotoSelection | null {
  const imageUrl = option.images?.[0] || option.imageUrl || null;
  if (!imageUrl) return null;

  if (
    isGooglePhotoProxyUrl(imageUrl) &&
    option.photoSource !== 'google_live' &&
    option.photoSource !== 'google_business'
  ) {
    return null;
  }

  const source =
    option.photoSource ??
    (isGooglePhotoProxyUrl(imageUrl) ? 'google_live' : 'provider');

  return {
    imageUrl,
    source,
    attribution: option.photoAttribution ?? option.photoAttributions?.[0] ?? null,
    attributionUrl: option.photoAttributionUrl ?? null,
    requiresGoogleAttribution:
      option.requiresGoogleAttribution ?? isGooglePhotoProxyUrl(imageUrl),
  };
}

function selectionFromOption(option: ParkingLike): ParkingPhotoSelection | null {
  return googleSelectionFromOption(option) ?? providerSelectionFromOption(option);
}

function logPhotoFallback(
  option: ParkingLike,
  extra: {
    photoProxyUrlBuilt: boolean;
    imageLoadFailed: boolean;
    providerPhotoAvailable: boolean;
    reason: string;
  },
) {
  if (process.env.NODE_ENV !== 'development') return;

  console.warn('[parking-photo] Falling back to illustration', {
    lotName: option.name,
    hasGooglePhoto: Boolean(googlePhotoNameFromOption(option)),
    photoProxyUrlBuilt: extra.photoProxyUrlBuilt,
    imageLoadFailed: extra.imageLoadFailed,
    providerPhotoAvailable: extra.providerPhotoAvailable,
    reason: extra.reason,
  });
}

function buildPhotoQuery(
  option: ParkingLike,
  tripContext: TripParkingContext,
  airportCode: string | null | undefined,
  priority: ParkingPhotoPriority,
) {
  const params = new URLSearchParams();
  if (option.providerLotId || option.id) {
    params.set('providerLotId', option.providerLotId || option.id || '');
  }
  if (option.bookingProvider || option.providerSource) {
    params.set('provider', option.bookingProvider || option.providerSource || '');
  }
  if (option.googlePlaceId) params.set('googlePlaceId', option.googlePlaceId);
  const googlePhotoName =
    option.googlePhotoName ||
    option.googlePhotoNames?.[0] ||
    option.photoName ||
    option.photoNames?.[0];
  if (googlePhotoName) params.set('googlePhotoName', googlePhotoName);
  if (airportCode) params.set('airportCode', airportCode);
  if (option.name) params.set('lotName', option.name);
  if (option.address || option.normalizedAddress || option.routeDestination) {
    params.set('lotAddress', option.address || option.normalizedAddress || option.routeDestination || '');
  }
  if (option.type) params.set('lotType', option.type);
  params.set('tripContext', tripContext);
  params.set('priority', priority);
  return params;
}

export default function ParkingLotVisual({
    option,
    tripContext = 'airport_trip',
    airportCode = null,
    photoPriority = 'background',
}: {
    option: ParkingLike;
    tripContext?: TripParkingContext;
    airportCode?: string | null;
    photoPriority?: ParkingPhotoPriority;
}) {
    const initialSelection = useMemo(
      () => selectionFromOption(option),
      [option],
    );
    const providerFallbackSelection = useMemo(
      () => providerSelectionFromOption(option),
      [option],
    );
    const [selection, setSelection] = useState<ParkingPhotoSelection | null>(initialSelection);
    const [failedSrcs, setFailedSrcs] = useState<string[]>([]);
    const photoKey = useMemo(
      () => stablePhotoKey(option, airportCode),
      [
        airportCode,
        option.address,
        option.bookingProvider,
        option.id,
        option.name,
        option.normalizedAddress,
        option.providerLotId,
        option.providerSource,
        option.routeDestination,
      ],
    );
    const photoQuery = useMemo(
      () => buildPhotoQuery(option, tripContext, airportCode, photoPriority).toString(),
      [
        airportCode,
        option.address,
        option.bookingProvider,
        option.googlePhotoName,
        option.googlePlaceId,
        option.id,
        option.name,
        option.normalizedAddress,
        option.photoName,
        option.providerLotId,
        option.providerSource,
        option.routeDestination,
        option.type,
        photoPriority,
        tripContext,
      ],
    );

    useEffect(() => {
      setSelection(initialSelection);
      setFailedSrcs([]);
    }, [initialSelection]);

    useEffect(() => {
      if (initialSelection?.imageUrl) return;

      let cancelled = false;
      const cached = photoSelectionCache.get(photoKey);

      if (cached && canUseCachedPhotoSelection(photoPriority, cached)) {
        parkingPhotoClientDebugLog('parking_photo_client_cache_hit', {
          stableKey: photoKey,
          lotName: option.name,
          priority: photoPriority,
          source: cached.source,
          fallbackReason: cached.fallbackReason ?? null,
          liveGoogleCalled: false,
        });
        setSelection(cached);
        return;
      }

      const inFlightKey = `${photoKey}|${isLivePhotoPriority(photoPriority) ? 'live' : 'cache-only'}`;
      const inFlight = photoRequestInFlight.get(inFlightKey);
      if (inFlight) {
        parkingPhotoClientDebugLog('parking_photo_client_request_deduped', {
          stableKey: photoKey,
          lotName: option.name,
          priority: photoPriority,
          source: null,
          fallbackReason: null,
          liveGoogleCalled: isLivePhotoPriority(photoPriority),
        });

        void inFlight.then((data) => {
          if (!cancelled) setSelection(data);
        });

        return () => {
          cancelled = true;
        };
      }

      if (!isLivePhotoPriority(photoPriority)) {
        const fallback = {
          ...buildPlaceholderParkingPhoto(
            {
              lotName: option.name,
              lotType: option.type,
              lotCategory: option.category,
              covered: option.covered,
              transferType: option.transferType,
              tripContext,
            },
            tripContext,
          ),
          fallbackReason: 'live_lookup_skipped_priority',
        };
        photoSelectionCache.set(photoKey, fallback);
        parkingPhotoClientDebugLog('parking_photo_client_cache_hit', {
          stableKey: photoKey,
          lotName: option.name,
          priority: photoPriority,
          source: fallback.source,
          fallbackReason: fallback.fallbackReason,
          liveGoogleCalled: false,
        });
        setSelection(fallback);
        return;
      }

      parkingPhotoClientDebugLog('parking_photo_client_request_start', {
        stableKey: photoKey,
        lotName: option.name,
        priority: photoPriority,
        source: null,
        fallbackReason: null,
        liveGoogleCalled: isLivePhotoPriority(photoPriority),
      });

      const request = fetch(`/api/parking-lot-photo?${photoQuery}`)
        .then((response) => response.json())
        .then((data: ParkingPhotoSelection) => {
          photoSelectionCache.set(photoKey, data);
          if (
            process.env.NODE_ENV === 'development' &&
            data.source === 'placeholder' &&
            (option.googlePhotoName || option.googlePhotoNames?.length)
          ) {
            logPhotoFallback(option, {
              photoProxyUrlBuilt: Boolean(googlePlacePhotoImageUrl(googlePhotoNameFromOption(option))),
              imageLoadFailed: false,
              providerPhotoAvailable: Boolean(providerFallbackSelection?.imageUrl),
              reason: data.safeModeNotice || 'photo_selector_placeholder',
            });
          }
          return data;
        })
        .catch(() => {
          const fallback = {
            ...buildPlaceholderParkingPhoto(
              {
                lotName: option.name,
                lotType: option.type,
                lotCategory: option.category,
                covered: option.covered,
                transferType: option.transferType,
                tripContext,
              },
              tripContext,
            ),
            fallbackReason: 'client_photo_request_failed',
          };
          photoSelectionCache.set(photoKey, fallback);
          return fallback;
        })
        .finally(() => {
          if (photoRequestInFlight.get(inFlightKey) === request) {
            photoRequestInFlight.delete(inFlightKey);
          }
        });

      photoRequestInFlight.set(inFlightKey, request);

      void request.then((data) => {
        if (!cancelled) setSelection(data);
      });

      return () => {
        cancelled = true;
      };
    }, [
      initialSelection?.imageUrl,
      option.category,
      option.covered,
      option.googlePhotoName,
      option.googlePhotoNames,
      option.name,
      option.type,
      option.transferType,
      photoKey,
      photoPriority,
      photoQuery,
      providerFallbackSelection?.imageUrl,
      tripContext,
    ]);

    const placeholderSelection = buildPlaceholderParkingPhoto(
      {
        lotName: option.name,
        lotType: option.type,
        lotCategory: option.category,
        covered: option.covered,
        transferType: option.transferType,
        tripContext,
      },
      tripContext,
    );

    useEffect(() => {
      if (!selection) return;
      parkingPhotoClientDebugLog('parking_photo_final_source', {
        stableKey: photoKey,
        lotName: option.name,
        priority: photoPriority,
        source: selection.source,
        fallbackReason: selection.fallbackReason ?? null,
        liveGoogleCalled: isLivePhotoPriority(photoPriority),
      });
    }, [option.name, photoKey, photoPriority, selection]);

    const resolved =
      [selection, providerFallbackSelection, placeholderSelection].find(
        (candidate) => candidate?.imageUrl && !failedSrcs.includes(candidate.imageUrl),
      ) ??
      placeholderSelection;

    const src = resolved.imageUrl;
    const showAttribution = Boolean(resolved.attribution);
    const showGoogleMapsAttribution =
      resolved.requiresGoogleAttribution ||
      resolved.source === 'google_live' ||
      resolved.source === 'google_business';
    const googlePhotoName = googlePhotoNameFromOption(option);
    const googleProxyUrl = googlePlacePhotoImageUrl(googlePhotoName);
    const providerPhotoAvailable = Boolean(providerFallbackSelection?.imageUrl);
    const googlePhotoFailed = Boolean(googleProxyUrl && failedSrcs.includes(googleProxyUrl));
    const providerPhotoFailed = Boolean(
      providerFallbackSelection?.imageUrl &&
        failedSrcs.includes(providerFallbackSelection.imageUrl),
    );
    const selectedVisualSource =
      resolved.source === 'google_live'
        || resolved.source === 'google_business'
        ? 'google photo'
        : resolved.source === 'provider'
          ? 'provider image'
          : 'illustration';
    const illustrationReason =
      selectedVisualSource !== 'illustration'
        ? null
        : googlePhotoFailed
          ? 'google_photo_image_load_failed'
          : googlePhotoName
            ? 'google_photo_metadata_present_but_not_selected'
            : providerPhotoFailed
              ? 'provider_photo_image_load_failed'
              : providerPhotoAvailable
                ? 'provider_photo_available_but_not_selected'
                : 'no_google_or_provider_photo_metadata_inside_visual';

    useEffect(() => {
      logParkingPhotoReviewTrace('inside_parking_lot_visual', option as Partial<ParkingOption>, {
        stageNote: 'ParkingLotVisual resolved displayed image source',
        selectedVisualSource,
        illustrationReason,
        photoProxyUrlBuilt: Boolean(googleProxyUrl),
        imageLoadFailed: failedSrcs.length > 0,
        providerPhotoAvailable,
      });
    }, [
      option,
      selectedVisualSource,
      illustrationReason,
      googleProxyUrl,
      failedSrcs.length,
      providerPhotoAvailable,
    ]);

    if (src) {
        return (
            <div className="flex flex-col gap-2">
            {resolved.safeModeNotice ? (
              <p
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950"
                role="status"
              >
                {resolved.safeModeNotice}
              </p>
            ) : null}
            <div
                className="group relative h-36 w-full overflow-hidden rounded-2xl bg-muted text-left shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring sm:h-40"
                aria-label={`${option.name ?? 'Parking lot'} photo`}
            >
                <img
                    src={src}
                    alt={`${option.name ?? 'Parking lot'} photo`}
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                    loading="lazy"
                    onError={() => {
                      logPhotoFallback(option, {
                        photoProxyUrlBuilt: Boolean(googlePlacePhotoImageUrl(googlePhotoNameFromOption(option))),
                        imageLoadFailed: true,
                        providerPhotoAvailable: Boolean(providerFallbackSelection?.imageUrl),
                        reason: resolved.source === 'placeholder' ? 'placeholder_load_failed' : 'image_load_failed',
                      });
                      setFailedSrcs((current) =>
                        current.includes(src) ? current : [...current, src],
                      );
                    }}
                />

                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3">
                    <div className="flex items-end justify-between gap-3">
                      <span className="max-w-[60%] truncate rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-sm">
                        {resolved.source === 'placeholder'
                          ? 'Illustration'
                          : resolved.source === 'google_live' || resolved.source === 'google_business'
                            ? 'Google photo'
                            : 'Lot photo'}
                      </span>
                    </div>
                    {showAttribution ? (
                      <p className="text-[10px] leading-snug text-white/90">
                        {resolved.attributionUrl ? (
                          <a
                            href={resolved.attributionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-white/40 underline-offset-2"
                          >
                            {resolved.attribution}
                          </a>
                        ) : (
                          resolved.attribution
                        )}
                      </p>
                    ) : null}
                    {showGoogleMapsAttribution ? (
                      <p className="text-[10px] leading-snug text-white/90">
                        Photo via{' '}
                        <a
                          href={GOOGLE_MAPS_ATTRIBUTION_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-white/40 underline-offset-2"
                        >
                          {GOOGLE_MAPS_ATTRIBUTION_LABEL}
                        </a>
                      </p>
                    ) : null}
                </div>
            </div>
            </div>
        );
    }

    const fallbackSrc = placeholderSelection.imageUrl;

    return (
        <div className="relative h-36 w-full overflow-hidden rounded-2xl border border-border bg-muted sm:h-40">
            <img
                src={fallbackSrc || '/assets/parking/airport-parking.svg'}
                alt={`${option.name ?? 'Parking lot'} illustration`}
                className="h-full w-full object-cover"
                loading="lazy"
            />

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm">
                    Illustration
                </span>
            </div>
        </div>
    );
}
