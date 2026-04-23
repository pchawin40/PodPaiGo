import { NextRequest, NextResponse } from 'next/server';
import { TripData, Recommendation } from '../../../lib/types';
import { RecommendationEngine } from '../../../lib/recommendationEngine';

export async function POST(request: NextRequest) {
  try {
    const tripData: TripData = await request.json();

    // Validate tripData
    if (!tripData.type || !tripData.destination) {
      return NextResponse.json({ error: 'Invalid trip data' }, { status: 400 });
    }

    const recommendation = await RecommendationEngine.generateRecommendations(tripData);

    return NextResponse.json(recommendation);
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}