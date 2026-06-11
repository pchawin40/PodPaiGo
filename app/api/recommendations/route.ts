import { NextRequest, NextResponse } from 'next/server';
import { Recommendation, TripData } from '../../../lib/types';
import { RecommendationEngine } from '../../../lib/recommendationEngine';
import { runWithSearchBudget } from '../../../lib/apiUsage/searchBudget';
import { runWithPlacesRequestBudget } from '../../../lib/apiUsage/placesRequestBudget';
import {
  checkRecommendationsRateLimit,
  getRecommendationsCacheMaxEntries,
  getRecommendationsCacheTtlMs,
  hashRecommendationRequest,
} from '../../../lib/apiUsage/recommendationsGuard';
import { trackServerEvent } from '../../../lib/analytics/serverTrackEvent';
export const runtime = 'nodejs';

const recommendationInFlight = new Map<string, Promise<Recommendation>>();
const recommendationCache = new Map<string, { expiresAt: number; recommendation: Recommendation }>();

function pruneRecommendationCache(now = Date.now()): void {
  for (const [key, entry] of recommendationCache) {
    if (entry.expiresAt <= now) {
      recommendationCache.delete(key);
    }
  }

  const maxEntries = getRecommendationsCacheMaxEntries();
  while (recommendationCache.size > maxEntries) {
    const oldestKey = recommendationCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    recommendationCache.delete(oldestKey);
  }
}

function jsonError(
  status: number,
  error: string,
  message: string,
  cause?: unknown
) {
  return NextResponse.json(
    {
      error,
      message,
      stack:
        process.env.NODE_ENV === 'development' && cause instanceof Error
          ? cause.stack
          : undefined,
    },
    { status }
  );
}

function parseTripData(bodyText: string): TripData {
  if (!bodyText.trim()) {
    throw new Error('Request body is required.');
  }

  return JSON.parse(bodyText) as TripData;
}

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    let tripData: TripData;

    try {
      tripData = parseTripData(bodyText);
    } catch (error) {
      return jsonError(
        400,
        'invalid_request_body',
        error instanceof Error ? error.message : 'Invalid JSON request body.',
        error
      );
    }

    // Validate tripData
    if (!tripData.type || !tripData.origin || !tripData.destination) {
      return jsonError(400, 'invalid_trip_data', 'Invalid trip data');
    }

    const rateLimit = checkRecommendationsRateLimit(request);
    if (rateLimit.limited) {
      void trackServerEvent(
        'rate_limit_hit',
        {
          tripType: tripData.type,
          airportCode: tripData.airportCode || undefined,
          sourcePage: 'api_recommendations',
          windowMs: rateLimit.windowMs,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        request,
      );

      return NextResponse.json(
        {
          error: 'rate_limited',
          message: 'Too many searches at once. Please wait a moment and try again.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const requestKey = hashRecommendationRequest(bodyText);
    const now = Date.now();
    pruneRecommendationCache(now);
    const cached = recommendationCache.get(requestKey);
    if (cached && cached.expiresAt > now) {
      void trackServerEvent(
        'cache_hit',
        {
          tripType: tripData.type,
          airportCode: tripData.airportCode || undefined,
          sourcePage: 'api_recommendations',
          cacheStatus: 'recommendation_cache',
        },
        request,
      );
      return NextResponse.json(cached.recommendation);
    }

    const existing = recommendationInFlight.get(requestKey);
    if (existing) {
      void trackServerEvent(
        'cache_hit',
        {
          tripType: tripData.type,
          airportCode: tripData.airportCode || undefined,
          sourcePage: 'api_recommendations',
          cacheStatus: 'in_flight_dedupe',
        },
        request,
      );
    } else {
      void trackServerEvent(
        'cache_miss',
        {
          tripType: tripData.type,
          airportCode: tripData.airportCode || undefined,
          sourcePage: 'api_recommendations',
          cacheStatus: 'miss',
        },
        request,
      );
    }

    const promise =
      existing ||
      runWithPlacesRequestBudget(requestKey, () =>
        runWithSearchBudget(requestKey, () =>
          RecommendationEngine.generateRecommendations(tripData),
        ),
      ).finally(() => {
        recommendationInFlight.delete(requestKey);
      });

    if (!existing) {
      recommendationInFlight.set(requestKey, promise);
    }

    const recommendation = await promise;
    const cacheTtlMs = getRecommendationsCacheTtlMs();
    if (cacheTtlMs > 0) {
      recommendationCache.set(requestKey, {
        expiresAt: Date.now() + cacheTtlMs,
        recommendation,
      });
      pruneRecommendationCache();
    }

    return NextResponse.json(recommendation);
  } catch (error) {
    console.error('Error generating recommendations:', error);

    return jsonError(
      500,
      'recommendations_failed',
      error instanceof Error ? error.message : String(error),
      error
    );
  }
}

export function resetRecommendationRouteStateForTests(): void {
  recommendationInFlight.clear();
  recommendationCache.clear();
}

export function getRecommendationCacheSizeForTests(): number {
  return recommendationCache.size;
}
