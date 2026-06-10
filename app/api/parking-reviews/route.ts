import { NextRequest, NextResponse } from 'next/server';
import { getActivePlacesRequestBudget, runWithPlacesRequestBudget } from '../../../lib/apiUsage/placesRequestBudget';
import {
  getCachedParkingGoogleReviews,
  resolveParkingGoogleReviews,
} from '../../../lib/parking/googlePlacesCache';
import {
  getEffectiveGooglePlacesConfig,
} from '../../../lib/parking/googlePlacesConfig';
import { isGooglePlaceReviewsLiveBlocked } from '../../../lib/parking/googlePlacesGuard';
import {
  GOOGLE_LISTING_NOT_FOUND_MESSAGE,
  GOOGLE_REVIEWS_CAP_EXCEEDED_MESSAGE,
  GOOGLE_REVIEWS_NOT_AVAILABLE_MESSAGE,
  GOOGLE_REVIEWS_SAFE_MODE_MESSAGE,
  SHOWING_CACHED_PROVIDER_DATA_MESSAGE,
} from '../../../lib/parking/googlePlacesSafeMode';
import { debugLog } from '../../../lib/utils/debug';

const MISSING_GOOGLE_REVIEW_INPUT_MESSAGE = 'Missing Google place id or lot name.';

function getString(value: FormDataEntryValue | string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

type ReviewLookupArgs = {
  placeId: string | null;
  name: string | null;
  airport: string | null;
  address: string | null;
};

function buildReviewResponse(
  place: Awaited<ReturnType<typeof getCachedParkingGoogleReviews>>,
  source: string,
  message?: string,
  request?: Pick<ReviewLookupArgs, 'placeId' | 'name'>,
) {
  const config = getEffectiveGooglePlacesConfig();
  const reviews = place?.reviews ?? [];
  const placeId = place?.googlePlaceId;
  const googleMapsUri = place?.googleMapsUri;
  const liveFetchEnabled = config.liveReviewsEnabled && !isGooglePlaceReviewsLiveBlocked();

  if (process.env.NODE_ENV !== 'test') {
    console.log('[parking-reviews debug]', {
      placeId: request?.placeId ?? placeId ?? null,
      name: request?.name ?? place?.googlePlaceName ?? place?.lotName ?? null,
      resolvedPlaceId: placeId ?? null,
      resolvedName: place?.googlePlaceName || place?.lotName || null,
      rating: place?.rating ?? null,
      reviewCount: place?.reviewCount ?? null,
      reviewsLength: reviews.length,
      firstReview: reviews[0] ?? null,
      source,
      safeMode: !liveFetchEnabled,
      liveFetchEnabled,
    });
  }

  return NextResponse.json({
    reviews,
    source,
    message,
    liveReviewsEnabled: config.liveReviewsEnabled,
    placeId,
    googlePlaceId: placeId,
    rating: place?.rating,
    reviewCount: place?.reviewCount,
    googleMapsUri,
    googleMapsUrl: googleMapsUri,
    attribution: 'Google Maps',
    place: place
      ? {
          googlePlaceId: placeId,
          placeId,
          name: place.googlePlaceName || place.lotName,
          rating: place.rating,
          reviewCount: place.reviewCount,
          address: place.googleFormattedAddress || place.lotAddress,
          googleMapsUri,
          googleMapsUrl: googleMapsUri,
          attribution: 'Google Maps',
        }
      : null,
  });
}

async function handleReviewLookup(args: ReviewLookupArgs) {
  const lookupArgs = {
    airportCode: args.airport,
    lotName: args.name || args.placeId || 'Parking lot',
    lotAddress: args.address,
    googlePlaceId: args.placeId,
  };

  debugLog('review_match_attempt', {
    airportCode: args.airport,
    hasPlaceId: Boolean(args.placeId),
    lotName: args.name,
    hasAddress: Boolean(args.address),
  });

  return runWithPlacesRequestBudget(
    `parking-reviews:${args.placeId || args.name || 'unknown'}`,
    async () => {
      if (isGooglePlaceReviewsLiveBlocked()) {
        debugLog('review_live_blocked', {
          airportCode: args.airport,
          lotName: args.name,
          hasPlaceId: Boolean(args.placeId),
        });
        const cached = await getCachedParkingGoogleReviews(lookupArgs);
        if (cached?.reviews?.length) {
          debugLog('review_cache_hit', {
            airportCode: args.airport,
            lotName: args.name,
            googlePlaceId: cached.googlePlaceId,
            reviewCount: cached.reviews.length,
          });
          return buildReviewResponse(
            cached,
            'supabase-cache',
            SHOWING_CACHED_PROVIDER_DATA_MESSAGE,
            args,
          );
        }

        return buildReviewResponse(cached, 'disabled', GOOGLE_REVIEWS_SAFE_MODE_MESSAGE, args);
      }

      const place = await resolveParkingGoogleReviews(lookupArgs);
      const budget = getActivePlacesRequestBudget();

      if (place?.reviews?.length) {
        debugLog('review_match_success', {
          airportCode: args.airport,
          lotName: args.name,
          googlePlaceId: place.googlePlaceId,
          source: place.source,
          reviewCount: place.reviews.length,
        });
        return buildReviewResponse(
          place,
          place.source === 'supabase-cache' || place.source === 'stale-fallback'
            ? place.source
            : place.source || 'google-places',
          place.source === 'supabase-cache' || place.source === 'stale-fallback'
            ? SHOWING_CACHED_PROVIDER_DATA_MESSAGE
            : undefined,
          args,
        );
      }

      if (!place?.googlePlaceId) {
        debugLog('review_match_failed', {
          airportCode: args.airport,
          lotName: args.name,
          reason: 'no_listing_matched',
        });
        return buildReviewResponse(place, 'no-listing', GOOGLE_LISTING_NOT_FOUND_MESSAGE, args);
      }

      if (budget && budget.blocked > 0) {
        debugLog('review_match_failed', {
          airportCode: args.airport,
          lotName: args.name,
          googlePlaceId: place.googlePlaceId,
          reason: 'cap_exceeded',
        });
        return buildReviewResponse(place, 'cap-exceeded', GOOGLE_REVIEWS_CAP_EXCEEDED_MESSAGE, args);
      }

      debugLog('review_match_failed', {
        airportCode: args.airport,
        lotName: args.name,
        googlePlaceId: place.googlePlaceId,
        reason: 'no_reviews_available',
      });
      return buildReviewResponse(place, 'no-reviews', GOOGLE_REVIEWS_NOT_AVAILABLE_MESSAGE, args);
    },
    { route: '/api/parking-reviews' },
  );
}

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('placeId');
  const name = req.nextUrl.searchParams.get('name');
  const airport = req.nextUrl.searchParams.get('airport');
  const address = req.nextUrl.searchParams.get('address');

  if (!placeId && !name) {
    return NextResponse.json({
      reviews: [],
      source: 'missing-input',
      message: MISSING_GOOGLE_REVIEW_INPUT_MESSAGE,
      liveReviewsEnabled: getEffectiveGooglePlacesConfig().liveReviewsEnabled,
    });
  }

  return handleReviewLookup({ placeId, name, airport, address });
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);

  const placeId = getString(form?.get('placeId') ?? null);
  const name = getString(form?.get('name') ?? null);
  const airport = getString(form?.get('airport') ?? null);
  const address = getString(form?.get('address') ?? null);

  if (!placeId && !name) {
    return NextResponse.json({
      reviews: [],
      source: 'missing-input',
      message: MISSING_GOOGLE_REVIEW_INPUT_MESSAGE,
      liveReviewsEnabled: getEffectiveGooglePlacesConfig().liveReviewsEnabled,
    });
  }

  return handleReviewLookup({ placeId, name, airport, address });
}
