'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildPlaceholderParkingPhoto,
  isGooglePhotoProxyUrl,
  type ParkingPhotoSelection,
} from '../../lib/parking/parkingLotPhotoShared';
import type { TripParkingContext } from '../../lib/trip/tripContext';

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
    googlePlaceId?: string;
    transferType?: string;
    covered?: boolean;
};

function selectionFromOption(option: ParkingLike, tripContext: TripParkingContext): ParkingPhotoSelection | null {
  const imageUrl = option.images?.[0] || option.imageUrl || null;
  if (!imageUrl) return null;

  if (isGooglePhotoProxyUrl(imageUrl) && option.photoSource !== 'google_live') {
    return null;
  }

  return {
    imageUrl,
    source: option.photoSource ?? (isGooglePhotoProxyUrl(imageUrl) ? 'google_live' : 'provider'),
    attribution: option.photoAttribution ?? option.photoAttributions?.[0] ?? null,
    attributionUrl: option.photoAttributionUrl ?? null,
    requiresGoogleAttribution:
      option.requiresGoogleAttribution ?? isGooglePhotoProxyUrl(imageUrl),
  };
}

function buildPhotoQuery(option: ParkingLike, tripContext: TripParkingContext, airportCode?: string | null) {
  const params = new URLSearchParams();
  if (option.providerLotId || option.id) {
    params.set('providerLotId', option.providerLotId || option.id || '');
  }
  if (option.bookingProvider || option.providerSource) {
    params.set('provider', option.bookingProvider || option.providerSource || '');
  }
  if (option.googlePlaceId) params.set('googlePlaceId', option.googlePlaceId);
  if (airportCode) params.set('airportCode', airportCode);
  if (option.name) params.set('lotName', option.name);
  if (option.type) params.set('lotType', option.type);
  params.set('tripContext', tripContext);
  return params;
}

export default function ParkingLotVisual({
    option,
    tripContext = 'airport_trip',
    airportCode = null,
}: {
    option: ParkingLike;
    tripContext?: TripParkingContext;
    airportCode?: string | null;
}) {
    const initialSelection = useMemo(
      () => selectionFromOption(option, tripContext),
      [option, tripContext],
    );
    const [selection, setSelection] = useState<ParkingPhotoSelection | null>(initialSelection);
    const [failedSrc, setFailedSrc] = useState<string | null>(null);

    useEffect(() => {
      setSelection(initialSelection);
      setFailedSrc(null);
    }, [initialSelection]);

    useEffect(() => {
      if (initialSelection?.imageUrl) return;

      let cancelled = false;

      fetch(`/api/parking-lot-photo?${buildPhotoQuery(option, tripContext, airportCode).toString()}`)
        .then((response) => response.json())
        .then((data: ParkingPhotoSelection) => {
          if (!cancelled) setSelection(data);
        })
        .catch(() => {
          if (!cancelled) {
            setSelection(buildPlaceholderParkingPhoto(
              {
                lotName: option.name,
                lotType: option.type,
                lotCategory: option.category,
                covered: option.covered,
                transferType: option.transferType,
                tripContext,
              },
              tripContext,
            ));
          }
        });

      return () => {
        cancelled = true;
      };
    }, [airportCode, initialSelection?.imageUrl, option, tripContext]);

    const resolved =
      selection ??
      buildPlaceholderParkingPhoto(
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

    const src = resolved.imageUrl;
    const showAttribution = Boolean(resolved.attribution);

    if (src && failedSrc !== src) {
        return (
            <div
                className="group relative h-36 w-full overflow-hidden rounded-2xl bg-slate-100 text-left shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-40"
                aria-label={`${option.name ?? 'Parking lot'} photo`}
            >
                <img
                    src={src}
                    alt={`${option.name ?? 'Parking lot'} photo`}
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                    loading="lazy"
                    onError={() => setFailedSrc(src)}
                />

                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3">
                    <div className="flex items-end justify-between gap-3">
                      <span className="max-w-[60%] truncate rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-zinc-900 shadow-sm">
                        {resolved.source === 'placeholder'
                          ? 'Illustration'
                          : resolved.source === 'google_live'
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
                        {resolved.requiresGoogleAttribution
                          ? ' Confirm usage rules with Google before reusing this photo.'
                          : null}
                      </p>
                    ) : null}
                </div>
            </div>
        );
    }

    const fallbackSrc = buildPlaceholderParkingPhoto(
      {
        lotName: option.name,
        lotType: option.type,
        lotCategory: option.category,
        covered: option.covered,
        transferType: option.transferType,
        tripContext,
      },
      tripContext,
    ).imageUrl;

    return (
        <div className="relative h-36 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-40">
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
