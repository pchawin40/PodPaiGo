import { NextRequest, NextResponse } from 'next/server';
import {
  buildGoogleLiveParkingPhoto,
  getBestParkingPhoto,
} from '../../../lib/parking/parkingLotPhotos';
import { runWithPlacesRequestBudget } from '../../../lib/apiUsage/placesRequestBudget';
import {
  resolveParkingGooglePlace,
  type ParkingGooglePlaceCacheRecord,
} from '../../../lib/parking/googlePlacesCache';
import {
  buildParkingGoogleCacheKey,
  normalizeParkingLotName,
  shouldAttemptGooglePlaceMatch,
} from '../../../lib/parking/googlePlaceMatchUtils';
import {
  isGooglePlacePhotosLiveBlocked,
  isGooglePlacesLiveBlocked,
} from '../../../lib/parking/googlePlacesGuard';
import {
  getMaxGooglePlaceDetailsPerRequest,
  getMaxGooglePhotoMediaPerRequest,
  getMaxGooglePlacesCallsPerRequest,
  getMaxGoogleSearchTextPerRequest,
} from '../../../lib/apiUsage/placesRequestLimits';
import { GOOGLE_PHOTOS_SAFE_MODE_MESSAGE } from '../../../lib/parking/googlePlacesSafeMode';
import type {
  ParkingPhotoPriority,
  ParkingPhotoSelection,
} from '../../../lib/parking/parkingLotPhotoShared';
import type { TripParkingContext } from '../../../lib/trip/tripContext';
import { TimeoutError, withTimeout } from '../../../lib/utils/asyncTimeout';
import { debugLog } from '../../../lib/utils/debug';

const PHOTO_GOOGLE_MATCH_TIMEOUT_MS = Number(
  process.env.PARKING_LOT_PHOTO_GOOGLE_MATCH_TIMEOUT_MS || 5000,
);
const PHOTO_POSITIVE_CACHE_TTL_MS = Number(
  process.env.PARKING_LOT_PHOTO_POSITIVE_CACHE_TTL_MS || 24 * 60 * 60 * 1000,
);
const PHOTO_NEGATIVE_CACHE_TTL_MS = Number(
  process.env.PARKING_LOT_PHOTO_NEGATIVE_CACHE_TTL_MS || 6 * 60 * 60 * 1000,
);
const PHOTO_LIVE_LOOKUP_DAILY_LIMIT = Number(
  process.env.PARKING_LOT_PHOTO_LIVE_LOOKUP_DAILY_LIMIT || 10,
);

type PhotoCacheEntry = {
  selection: ParkingPhotoSelection;
  expiresAt: number;
  negative: boolean;
};

const photoSelectionCache = new Map<string, PhotoCacheEntry>();
const photoLookupInFlight = new Map<string, Promise<ParkingPhotoSelection>>();
let photoLiveLookupDayKey = '';
let photoLiveLookupDailyCount = 0;

function getString(value: string | null): string | null {
  if (!value?.trim()) return null;
  return value.trim();
}

function airportParkingContext(
  airportCode: string | null,
  fallbackContext: string | null,
): string | null {
  const code = airportCode?.trim().toUpperCase();

  if (code === 'SEA') return 'SeaTac WA airport parking';
  if (code) return `${code} airport parking`;

  return fallbackContext;
}

function googlePhotoNameCount(place: ParkingGooglePlaceCacheRecord | null): number {
  const names = new Set<string>();
  if (place?.photoName) names.add(place.photoName);
  place?.photoNames?.forEach((name) => {
    if (name) names.add(name);
  });
  return names.size;
}

function normalizePriority(value: string | null): ParkingPhotoPriority {
  if (
    value === 'smart-pick' ||
    value === 'top' ||
    value === 'visible' ||
    value === 'background' ||
    value === 'manual'
  ) {
    return value;
  }

  // Direct/debug calls should keep working unless the client explicitly marks
  // the request as background.
  return 'manual';
}

function isLiveLookupPriority(priority: ParkingPhotoPriority): boolean {
  return priority === 'smart-pick' || priority === 'top' || priority === 'manual';
}

function liveGoogleQuotaGuardAllows(args: {
  hasGooglePlaceId: boolean;
}): boolean {
  if (isGooglePlacesLiveBlocked()) return false;
  if (isGooglePlacePhotosLiveBlocked()) return false;
  if (getMaxGooglePlacesCallsPerRequest() <= 0) return false;
  if (getMaxGooglePhotoMediaPerRequest() <= 0) return false;
  if (!args.hasGooglePlaceId && getMaxGoogleSearchTextPerRequest() <= 0) return false;
  if (getMaxGooglePlaceDetailsPerRequest() <= 0) return false;
  return true;
}

function currentUtcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function canConsumePhotoLiveLookupQuota(): boolean {
  const limit = Number.isFinite(PHOTO_LIVE_LOOKUP_DAILY_LIMIT)
    ? Math.max(0, Math.floor(PHOTO_LIVE_LOOKUP_DAILY_LIMIT))
    : 0;
  if (limit <= 0) return false;

  const today = currentUtcDayKey();
  if (photoLiveLookupDayKey !== today) {
    photoLiveLookupDayKey = today;
    photoLiveLookupDailyCount = 0;
  }

  if (photoLiveLookupDailyCount >= limit) return false;
  photoLiveLookupDailyCount += 1;
  return true;
}

function getCachedSelection(stableKey: string | null): PhotoCacheEntry | null {
  if (!stableKey) return null;

  const cached = photoSelectionCache.get(stableKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    photoSelectionCache.delete(stableKey);
    return null;
  }

  return cached;
}

function cacheSelection(
  stableKey: string | null,
  selection: ParkingPhotoSelection,
  options?: { negative?: boolean },
): void {
  if (!stableKey) return;

  const negative = options?.negative ?? selection.source === 'placeholder';
  const ttl = negative ? PHOTO_NEGATIVE_CACHE_TTL_MS : PHOTO_POSITIVE_CACHE_TTL_MS;
  if (!Number.isFinite(ttl) || ttl <= 0) return;

  photoSelectionCache.set(stableKey, {
    selection,
    negative,
    expiresAt: Date.now() + ttl,
  });
}

function logParkingPhotoEvent(
  event: string,
  payload: {
    stableKey: string | null;
    lotName: string | null;
    priority: ParkingPhotoPriority;
    source?: string | null;
    fallbackReason?: string | null;
    liveGoogleCalled: boolean;
    [key: string]: unknown;
  },
): void {
  debugLog(event, payload);
}

export function resetParkingLotPhotoRouteCacheForTests(): void {
  photoSelectionCache.clear();
  photoLookupInFlight.clear();
  photoLiveLookupDayKey = '';
  photoLiveLookupDailyCount = 0;
}

function shouldTryGooglePhotoMatch(args: {
  lotName: string | null;
  lotAddress: string | null;
  provider: string | null;
  airportCode: string | null;
}): boolean {
  if (!args.lotName) return false;

  return shouldAttemptGooglePlaceMatch({
    lotName: args.lotName,
    lotAddress: args.lotAddress,
    provider: args.provider,
    source: args.provider,
    airportCode: args.airportCode,
  });
}

async function resolveGooglePhotoMatch(args: {
  parkingLotId: string | null;
  googlePlaceId: string | null;
  provider: string | null;
  lotName: string;
  lotAddress: string | null;
  airportCode: string | null;
  airportContext: string | null;
  cacheKey: string;
}): Promise<{
  place: ParkingGooglePlaceCacheRecord | null;
  fallbackReason: string | null;
}> {
  if (isGooglePlacesLiveBlocked()) {
    return { place: null, fallbackReason: 'google_places_live_disabled' };
  }

  try {
    const place = await runWithPlacesRequestBudget(
      `parking-lot-photo:${args.cacheKey}`,
      () =>
        withTimeout(
          resolveParkingGooglePlace({
            airportCode: args.airportCode,
            parkingLotId: args.parkingLotId,
            lotName: args.lotName,
            lotAddress: args.lotAddress,
            googlePlaceId: args.googlePlaceId,
            airportContext: args.airportContext,
            provider: args.provider,
            source: args.provider,
          }),
          PHOTO_GOOGLE_MATCH_TIMEOUT_MS,
          'Parking lot photo Google match',
        ),
    );

    return {
      place,
      fallbackReason: place ? null : 'google_place_match_unavailable',
    };
  } catch (error) {
    if (error instanceof TimeoutError) {
      return { place: null, fallbackReason: 'google_place_match_timeout' };
    }

    return {
      place: null,
      fallbackReason:
        process.env.NODE_ENV === 'development' && error instanceof Error
          ? `google_place_match_failed:${error.message}`
          : 'google_place_match_failed',
    };
  }
}

function logParkingLotPhotoLookup(payload: Record<string, unknown>) {
  debugLog('parking_lot_photo_lookup', payload);
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const params = req.nextUrl.searchParams;

  const tripContext = getString(params.get('tripContext'));
  const normalizedContext: TripParkingContext =
    tripContext === 'city_destination_trip' ? 'city_destination_trip' : 'airport_trip';
  const parkingLotId = getString(params.get('parkingLotId'));
  const provider = getString(params.get('provider'));
  const providerLotId = getString(params.get('providerLotId'));
  const googlePlaceId = getString(params.get('googlePlaceId'));
  const airportCode = getString(params.get('airportCode'))?.toUpperCase() || null;
  const googlePhotoName = getString(params.get('googlePhotoName'));
  const lotName = getString(params.get('lotName'));
  const lotAddress =
    getString(params.get('lotAddress')) ||
    getString(params.get('address')) ||
    null;
  const lotType = getString(params.get('lotType'));
  const priority = normalizePriority(params.get('priority'));
  const normalizedLotName = lotName ? normalizeParkingLotName(lotName) : null;
  const googleMatchCacheKey = lotName
    ? buildParkingGoogleCacheKey({
        airportCode,
        parkingLotId,
        lotName,
        lotAddress,
      })
    : null;
  const triedProviderImage = Boolean(
    parkingLotId ||
    (provider && providerLotId) ||
    googlePlaceId,
  );

  const selection = await getBestParkingPhoto({
    parkingLotId,
    provider,
    providerLotId,
    googlePlaceId,
    airportCode,
    googlePhotoName,
    lotName,
    lotAddress,
    lotType,
    tripContext: normalizedContext,
  });

  if (selection.source !== 'placeholder') {
    logParkingLotPhotoLookup({
      rawLotName: lotName,
      normalizedLotName,
      provider,
      providerLotId,
      airportCode,
      cacheKey: googleMatchCacheKey,
      triedProviderImage,
      triedCachedGoogleMatch: Boolean(googlePhotoName || googlePlaceId),
      triedLiveGoogleMatch: false,
      matchedGooglePlaceId: googlePlaceId,
      googlePhotoNamesCount: googlePhotoName ? 1 : 0,
          finalSource: selection.source,
          fallbackReason: null,
          elapsedMs: Date.now() - startedAt,
        });
    cacheSelection(googleMatchCacheKey, selection, { negative: false });
    logParkingPhotoEvent('parking_photo_final_source', {
      stableKey: googleMatchCacheKey,
      lotName,
      priority,
      source: selection.source,
      fallbackReason: null,
      liveGoogleCalled: false,
    });
    return NextResponse.json(selection);
  }

  const canAttemptGoogleMatch = shouldTryGooglePhotoMatch({
    lotName,
    lotAddress,
    provider,
    airportCode,
  });
  let place: ParkingGooglePlaceCacheRecord | null = null;
  let fallbackReason =
    selection.safeModeNotice ? 'google_photo_safe_mode' : 'placeholder_after_provider_lookup';

  const cached = getCachedSelection(googleMatchCacheKey);
  if (cached) {
    logParkingPhotoEvent(
      cached.negative ? 'parking_photo_server_negative_cache_hit' : 'parking_photo_server_cache_hit',
      {
        stableKey: googleMatchCacheKey,
        lotName,
        priority,
        source: cached.selection.source,
        fallbackReason: cached.selection.fallbackReason ?? null,
        liveGoogleCalled: false,
      },
    );
    logParkingPhotoEvent('parking_photo_final_source', {
      stableKey: googleMatchCacheKey,
      lotName,
      priority,
      source: cached.selection.source,
      fallbackReason: cached.selection.fallbackReason ?? null,
      liveGoogleCalled: false,
    });
    return NextResponse.json(cached.selection);
  }

  if (lotName && canAttemptGoogleMatch && googleMatchCacheKey && !isLiveLookupPriority(priority)) {
    fallbackReason = 'live_lookup_skipped_priority';
    const response = {
      ...selection,
      fallbackReason,
    };
    logParkingPhotoEvent('parking_photo_live_lookup_skipped_priority', {
      stableKey: googleMatchCacheKey,
      lotName,
      priority,
      source: response.source,
      fallbackReason,
      liveGoogleCalled: false,
    });
    logParkingPhotoEvent('parking_photo_final_source', {
      stableKey: googleMatchCacheKey,
      lotName,
      priority,
      source: response.source,
      fallbackReason,
      liveGoogleCalled: false,
    });
    return NextResponse.json(response);
  }

  if (
    lotName &&
    canAttemptGoogleMatch &&
    googleMatchCacheKey &&
    !liveGoogleQuotaGuardAllows({ hasGooglePlaceId: Boolean(googlePlaceId) })
  ) {
    fallbackReason = 'photo_lookup_skipped_quota_guard';
    const response = {
      ...selection,
      safeModeNotice: isGooglePlacePhotosLiveBlocked()
        ? GOOGLE_PHOTOS_SAFE_MODE_MESSAGE
        : selection.safeModeNotice,
      fallbackReason,
    };
    cacheSelection(googleMatchCacheKey, response, { negative: true });
    logParkingPhotoEvent('parking_photo_live_lookup_skipped_quota_guard', {
      stableKey: googleMatchCacheKey,
      lotName,
      priority,
      source: response.source,
      fallbackReason,
      liveGoogleCalled: false,
    });
    logParkingPhotoEvent('parking_photo_final_source', {
      stableKey: googleMatchCacheKey,
      lotName,
      priority,
      source: response.source,
      fallbackReason,
      liveGoogleCalled: false,
    });
    return NextResponse.json(response);
  }

  if (lotName && canAttemptGoogleMatch && googleMatchCacheKey) {
    const existing = photoLookupInFlight.get(googleMatchCacheKey);
    if (!existing && !canConsumePhotoLiveLookupQuota()) {
      fallbackReason = 'photo_lookup_skipped_quota_guard';
      const response = {
        ...selection,
        fallbackReason,
      };
      cacheSelection(googleMatchCacheKey, response, { negative: true });
      logParkingPhotoEvent('parking_photo_live_lookup_skipped_quota_guard', {
        stableKey: googleMatchCacheKey,
        lotName,
        priority,
        source: response.source,
        fallbackReason,
        liveGoogleCalled: false,
        dailyLimit: PHOTO_LIVE_LOOKUP_DAILY_LIMIT,
      });
      logParkingPhotoEvent('parking_photo_final_source', {
        stableKey: googleMatchCacheKey,
        lotName,
        priority,
        source: response.source,
        fallbackReason,
        liveGoogleCalled: false,
      });
      return NextResponse.json(response);
    }

    const lookup =
      existing ||
      (async () => {
        logParkingPhotoEvent('parking_photo_live_lookup_start', {
          stableKey: googleMatchCacheKey,
          lotName,
          priority,
          source: null,
          fallbackReason: null,
          liveGoogleCalled: true,
        });
        const resolved = await resolveGooglePhotoMatch({
          parkingLotId,
          googlePlaceId,
          provider,
          lotName,
          lotAddress,
          airportCode,
          airportContext: airportParkingContext(airportCode, params.get('airportContext')),
          cacheKey: googleMatchCacheKey,
        });
        place = resolved.place;
        fallbackReason = resolved.fallbackReason || fallbackReason;

        const resolvedPhotoName = place?.photoName || place?.photoNames?.[0] || null;
        if (resolvedPhotoName) {
          const googleSelection = buildGoogleLiveParkingPhoto(resolvedPhotoName);
          if (googleSelection?.imageUrl) {
            const response = {
              ...googleSelection,
              fallbackReason: null,
            };
            cacheSelection(googleMatchCacheKey, response, { negative: false });
            logParkingPhotoEvent('parking_photo_live_lookup_success', {
              stableKey: googleMatchCacheKey,
              lotName,
              priority,
              source: response.source,
              fallbackReason: null,
              matchedGooglePlaceId: place?.googlePlaceId || null,
              googlePhotoNamesCount: googlePhotoNameCount(place),
              liveGoogleCalled: true,
            });
            logParkingLotPhotoLookup({
              rawLotName: lotName,
              normalizedLotName,
              provider,
              providerLotId,
              airportCode,
              cacheKey: googleMatchCacheKey,
              triedProviderImage,
              triedCachedGoogleMatch: true,
              triedLiveGoogleMatch: true,
              matchedGooglePlaceId: place?.googlePlaceId || null,
              googlePhotoNamesCount: googlePhotoNameCount(place),
              finalSource: response.source,
              fallbackReason: null,
              elapsedMs: Date.now() - startedAt,
            });
            return response;
          }

          fallbackReason = isGooglePlacePhotosLiveBlocked()
            ? 'google_photo_proxy_blocked'
            : 'google_photo_proxy_url_unavailable';
        } else if (place) {
          fallbackReason = 'google_place_match_without_photo';
        }

        const response = {
          ...selection,
          safeModeNotice:
            fallbackReason === 'google_photo_proxy_blocked'
              ? GOOGLE_PHOTOS_SAFE_MODE_MESSAGE
              : selection.safeModeNotice,
          fallbackReason,
        };
        cacheSelection(googleMatchCacheKey, response, { negative: true });
        logParkingPhotoEvent('parking_photo_live_lookup_no_photo', {
          stableKey: googleMatchCacheKey,
          lotName,
          priority,
          source: response.source,
          fallbackReason,
          matchedGooglePlaceId: place?.googlePlaceId || null,
          googlePhotoNamesCount: googlePhotoNameCount(place),
          liveGoogleCalled: true,
        });
        return response;
      })();

    if (!existing) {
      photoLookupInFlight.set(googleMatchCacheKey, lookup);
    }

    try {
      const response = await lookup;
      logParkingPhotoEvent('parking_photo_final_source', {
        stableKey: googleMatchCacheKey,
        lotName,
        priority,
        source: response.source,
        fallbackReason: response.fallbackReason ?? null,
        liveGoogleCalled: true,
      });
      return NextResponse.json(response);
    } finally {
      if (photoLookupInFlight.get(googleMatchCacheKey) === lookup) {
        photoLookupInFlight.delete(googleMatchCacheKey);
      }
    }
  } else if (!lotName) {
    fallbackReason = 'missing_lot_name';
  } else if (!canAttemptGoogleMatch) {
    fallbackReason = 'google_place_match_skipped_non_parking';
  }

  const response = {
    ...selection,
    safeModeNotice:
      fallbackReason === 'google_photo_proxy_blocked'
        ? GOOGLE_PHOTOS_SAFE_MODE_MESSAGE
        : selection.safeModeNotice,
    fallbackReason,
  };
  logParkingLotPhotoLookup({
    rawLotName: lotName,
    normalizedLotName,
    provider,
    providerLotId,
    airportCode,
    cacheKey: googleMatchCacheKey,
    triedProviderImage,
    triedCachedGoogleMatch: Boolean(lotName && canAttemptGoogleMatch && googleMatchCacheKey),
    triedLiveGoogleMatch: false,
    matchedGooglePlaceId: null,
    googlePhotoNamesCount: 0,
    finalSource: response.source,
    fallbackReason,
    elapsedMs: Date.now() - startedAt,
  });
  cacheSelection(googleMatchCacheKey, response, { negative: response.source === 'placeholder' });
  logParkingPhotoEvent('parking_photo_final_source', {
    stableKey: googleMatchCacheKey,
    lotName,
    priority,
    source: response.source,
    fallbackReason,
    liveGoogleCalled: false,
  });

  return NextResponse.json(response);
}
