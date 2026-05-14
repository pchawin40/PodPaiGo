import { NextResponse } from 'next/server';
import { getAirportById } from '@/lib/airports/catalog';
import { getLiveParkingOptions } from '@/lib/providers/parkingAggregator';
import type { ParkingOption } from '@/lib/types';

export const dynamic = 'force-dynamic';

type LiveRefreshResult = {
  fetchedAt: string;
  parking: ParkingOption[];
};

const liveRefreshInFlight = new Map<string, Promise<LiveRefreshResult>>();
const liveRefreshResultCache = new Map<string, LiveRefreshResult>();
const LIVE_REFRESH_CACHE_TTL_MS = 2 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const airportCode = (body.airportCode || 'SEA').toUpperCase();
    const airport = getAirportById(airportCode) || getAirportById('SEA');

    if (!airport) {
      return NextResponse.json(
        { status: 'error', error: 'Invalid airport', parking: [] },
        { status: 400 }
      );
    }

    const requestKey = JSON.stringify({
      airportCode: airport.id,
      destination: body.destination || airport.routingAddress,
      checkInDate: body.checkInDate || null,
      checkOutDate: body.checkOutDate || null,
    });

    const cached = liveRefreshResultCache.get(requestKey);
    if (
      cached &&
      Date.now() - new Date(cached.fetchedAt).getTime() < LIVE_REFRESH_CACHE_TTL_MS
    ) {
      return NextResponse.json({
        status: 'cached',
        fetchedAt: cached.fetchedAt,
        parking: cached.parking,
      });
    }

    const existing = liveRefreshInFlight.get(requestKey);
    const promise =
      existing ||
      getLiveParkingOptions({
        airportCode: airport.id,
        destination: body.destination || airport.routingAddress,
        checkInDate: body.checkInDate,
        checkOutDate: body.checkOutDate,
      }).then((parking) => ({
        fetchedAt: new Date().toISOString(),
        parking,
      })).finally(() => {
        liveRefreshInFlight.delete(requestKey);
      });

    if (!existing) {
      liveRefreshInFlight.set(requestKey, promise);
    }

    const result = await promise;
    liveRefreshResultCache.set(requestKey, result);

    return NextResponse.json({
      status: 'refreshed',
      fetchedAt: result.fetchedAt,
      parking: result.parking,
    });
  } catch (err) {
    console.error('live-refresh error', err);

    return NextResponse.json(
      { status: 'error', parking: [] },
      { status: 500 }
    );
  }
}
