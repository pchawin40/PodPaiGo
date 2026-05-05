// app/api/weather/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getWeatherImpactForAirport } from '../../../lib/weather/nws';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const airport = searchParams.get('airport') || 'SEA';
  const targetDateTime = searchParams.get('targetDateTime') || undefined;

  const weatherImpact = await getWeatherImpactForAirport({
    airportCode: airport,
    targetDateTime,
  });

  return NextResponse.json({ weatherImpact });
}