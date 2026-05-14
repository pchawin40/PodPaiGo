import { NextRequest, NextResponse } from 'next/server';
import { Recommendation, TripData } from '../../../lib/types';
import { RecommendationEngine } from '../../../lib/recommendationEngine';
export const runtime = 'nodejs';

const recommendationInFlight = new Map<string, Promise<Recommendation>>();

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

    const requestKey = JSON.stringify(tripData);
    const existing = recommendationInFlight.get(requestKey);
    const promise =
      existing ||
      RecommendationEngine.generateRecommendations(tripData).finally(() => {
        recommendationInFlight.delete(requestKey);
      });

    if (!existing) {
      recommendationInFlight.set(requestKey, promise);
    }

    const recommendation = await promise;

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
