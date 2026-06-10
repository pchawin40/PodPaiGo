// app/api/weather/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  checkPublicEndpointRateLimit,
  publicRateLimitResponse,
} from '../../../lib/apiUsage/publicRateLimit';
import { getWeatherForAirport, getWeatherForPoint } from '../../../lib/weather/nws';

export async function GET(req: NextRequest) {
  const rateLimit = checkPublicEndpointRateLimit('/api/weather', req);
  if (rateLimit.limited) {
    return publicRateLimitResponse(rateLimit);
  }

  const { searchParams } = new URL(req.url);

  const airport = searchParams.get('airport') || 'SEA';
  const targetDateTime = searchParams.get('targetDateTime') || undefined;
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const weather = await getWeatherForPoint({
      lat,
      lng,
      targetDateTime,
      currentContext: 'current-destination-weather',
    });

    return NextResponse.json(weather);
  }

  const weather = await getWeatherForAirport({
    airportCode: airport,
    targetDateTime,
  });

  return NextResponse.json(weather);
}
