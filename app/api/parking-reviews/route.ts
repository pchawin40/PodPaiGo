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
) {
  const config = getEffectiveGooglePlacesConfig();

  return NextResponse.json({
    reviews: place?.reviews ?? [],
    source,
    message,
    liveReviewsEnabled: config.liveReviewsEnabled,
    place: place
      ? {
          googlePlaceId: place.googlePlaceId,
          name: place.googlePlaceName || place.lotName,
          rating: place.rating,
          reviewCount: place.reviewCount,
          address: place.googleFormattedAddress || place.lotAddress,
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

  return runWithPlacesRequestBudget(
    `parking-reviews:${args.placeId || args.name || 'unknown'}`,
    async () => {
      if (isGooglePlaceReviewsLiveBlocked()) {
        const cached = await getCachedParkingGoogleReviews(lookupArgs);
        if (cached?.reviews?.length) {
          return buildReviewResponse(
            cached,
            'supabase-cache',
            SHOWING_CACHED_PROVIDER_DATA_MESSAGE,
          );
        }

        return buildReviewResponse(cached, 'disabled', GOOGLE_REVIEWS_SAFE_MODE_MESSAGE);
      }

      const place = await resolveParkingGoogleReviews(lookupArgs);
      const budget = getActivePlacesRequestBudget();

      if (place?.reviews?.length) {
        return buildReviewResponse(
          place,
          place.source === 'supabase-cache' || place.source === 'stale-fallback'
            ? place.source
            : place.source || 'google-places',
          place.source === 'supabase-cache' || place.source === 'stale-fallback'
            ? SHOWING_CACHED_PROVIDER_DATA_MESSAGE
            : undefined,
        );
      }

      if (!place?.googlePlaceId) {
        return buildReviewResponse(place, 'no-listing', GOOGLE_LISTING_NOT_FOUND_MESSAGE);
      }

      if (budget && budget.blocked > 0) {
        return buildReviewResponse(place, 'cap-exceeded', GOOGLE_REVIEWS_CAP_EXCEEDED_MESSAGE);
      }

      return buildReviewResponse(place, 'no-reviews', GOOGLE_REVIEWS_NOT_AVAILABLE_MESSAGE);
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
      liveReviewsEnabled: getEffectiveGooglePlacesConfig().liveReviewsEnabled,
    });
  }

  return handleReviewLookup({ placeId, name, airport, address });
}
