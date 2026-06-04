import { NextResponse } from 'next/server';
import { getAirportById } from '@/lib/airports/catalog';
import {
  getDestinationParkingOptions,
  getLiveParkingOptions,
} from '@/lib/providers/parkingAggregator';
import { LiveTrafficProvider } from '@/lib/providers';
import { runWithPlacesRequestBudget } from '@/lib/apiUsage/placesRequestBudget';
import type { ParkingOption } from '@/lib/types';
import { debugLog } from '@/lib/utils/debug';

export const dynamic = 'force-dynamic';

type LiveRefreshResult = {
  fetchedAt: string;
  parking: ParkingOption[];
};

const liveRefreshInFlight = new Map<string, Promise<LiveRefreshResult>>();
const liveRefreshResultCache = new Map<string, LiveRefreshResult>();
const LIVE_REFRESH_CACHE_TTL_MS = 2 * 60 * 1000;

function numberFromBody(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function roundedCoord(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function stringFromBody(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const destinationKind = typeof body.destinationKind === 'string'
      ? body.destinationKind
      : 'airport';
    const isAirportTrip = destinationKind === 'airport';

    const destination = stringFromBody(body.destination);
    const origin = stringFromBody(body.origin) || '';
    const checkInDate = stringFromBody(body.checkInDate);
    const checkOutDate = stringFromBody(body.checkOutDate);
    const checkInAt = stringFromBody(body.checkInAt);
    const checkOutAt = stringFromBody(body.checkOutAt);
    const dateTime = stringFromBody(body.dateTime) || checkInAt || new Date().toISOString();
    const parkingDurationMinutes = numberFromBody(body.parkingDurationMinutes);
    let destinationLat = numberFromBody(body.destinationLat);
    let destinationLng = numberFromBody(body.destinationLng);

    debugLog('live_refresh_start', {
      tripType: isAirportTrip ? 'airport' : 'general-trip',
      destinationKind,
      airportCode: isAirportTrip ? stringFromBody(body.airportCode)?.toUpperCase() || 'SEA' : null,
      destination,
      hasDestinationCoords:
        typeof destinationLat === 'number' && typeof destinationLng === 'number',
    });

    if (!destination && !isAirportTrip) {
      return NextResponse.json(
        { status: 'error', error: 'Missing destination', parking: [] },
        { status: 400 },
      );
    }

    const airportCode = isAirportTrip
      ? (stringFromBody(body.airportCode) || 'SEA').toUpperCase()
      : null;
    const airport = airportCode ? getAirportById(airportCode) : null;

    if (isAirportTrip && !airport) {
      return NextResponse.json(
        { status: 'error', error: 'Invalid airport', parking: [] },
        { status: 400 },
      );
    }

    const requestKey = JSON.stringify({
      destinationKind,
      airportCode: airport?.id ?? null,
      destination: destination || airport?.routingAddress || null,
      origin: isAirportTrip ? null : origin || null,
      destinationLat: roundedCoord(destinationLat),
      destinationLng: roundedCoord(destinationLng),
      dateTime,
      parkingDurationMinutes: parkingDurationMinutes ?? null,
      checkInDate: checkInDate || null,
      checkOutDate: checkOutDate || null,
    });

    const cached = liveRefreshResultCache.get(requestKey);
    if (
      cached &&
      Date.now() - new Date(cached.fetchedAt).getTime() < LIVE_REFRESH_CACHE_TTL_MS
    ) {
      debugLog('live_refresh_summary', {
        status: 'cached',
        destinationKind,
        airportCode: airport?.id ?? null,
        resultCount: cached.parking.length,
        cacheHit: true,
      });
      return NextResponse.json({
        status: 'cached',
        fetchedAt: cached.fetchedAt,
        parking: cached.parking,
      });
    }

    return runWithPlacesRequestBudget(`live-refresh:${requestKey}`, async () => {
      const existing = liveRefreshInFlight.get(requestKey);
      const promise =
        existing ||
        (async () => {
          if (isAirportTrip) {
            const parking = await getLiveParkingOptions({
              airportCode: airport!.id,
              airportCoordinates:
                typeof destinationLat === 'number' && typeof destinationLng === 'number'
                  ? { lat: destinationLat, lng: destinationLng }
                  : airport!.geoLocation,
              destination: destination || airport!.routingAddress,
              checkInDate,
              checkOutDate,
            });

            return {
              fetchedAt: new Date().toISOString(),
              parking,
            };
          }

          if (
            (typeof destinationLat !== 'number' || typeof destinationLng !== 'number') &&
            destination
          ) {
            const geocoded = await new LiveTrafficProvider().geocodeAddress(destination);
            destinationLat = geocoded?.lat;
            destinationLng = geocoded?.lng;
          }

          const parking = await getDestinationParkingOptions({
            origin,
            destination: destination!,
            dateTime,
            parkingDurationMinutes,
            destinationLat,
            destinationLng,
            checkInDate,
            checkOutDate,
            checkInAt,
            checkOutAt,
          });

          return {
            fetchedAt: new Date().toISOString(),
            parking,
          };
        })().finally(() => {
          liveRefreshInFlight.delete(requestKey);
        });

      if (!existing) {
        liveRefreshInFlight.set(requestKey, promise);
      }

      const result = await promise;
      liveRefreshResultCache.set(requestKey, result);
      debugLog('live_refresh_summary', {
        status: 'refreshed',
        destinationKind,
        airportCode: airport?.id ?? null,
        resultCount: result.parking.length,
        cacheHit: false,
        inFlightHit: Boolean(existing),
      });

      return NextResponse.json({
        status: 'refreshed',
        fetchedAt: result.fetchedAt,
        parking: result.parking,
      });
    });
  } catch (err) {
    debugLog('live_refresh_summary', {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
    console.error('live-refresh error', err);

    return NextResponse.json(
      {
        status: 'error',
        message: 'Parking data unavailable right now. Try again or open directions.',
        parking: [],
      },
      { status: 500 },
    );
  }
}
