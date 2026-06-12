import { NextRequest, NextResponse } from 'next/server';
import {
  checkPublicEndpointRateLimit,
  publicRateLimitResponse,
} from '@/lib/apiUsage/publicRateLimit';
import { buildStaticEventVenueSignal } from '@/lib/events/eventParkingSignal';
import { lookupTicketmasterEventsNearTrip } from '@/lib/events/ticketmaster';
import { isEventVenueDestination } from '@/lib/parking/eventVenueDetection';
import type { EventParkingSignal } from '@/lib/types';

export const runtime = 'nodejs';

type EventParkingSignalRequest = {
  destination?: unknown;
  destinationName?: unknown;
  destinationKind?: unknown;
  origin?: unknown;
  airportCode?: unknown;
  destinationLat?: unknown;
  destinationLng?: unknown;
  parkingCheckInDate?: unknown;
  parkingCheckInTime?: unknown;
  arrivalDate?: unknown;
  arrivalTime?: unknown;
  date?: unknown;
  time?: unknown;
  timezone?: unknown;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readBody(value: unknown): EventParkingSignalRequest {
  return value && typeof value === 'object' ? (value as EventParkingSignalRequest) : {};
}

export async function POST(request: NextRequest) {
  const rateLimit = checkPublicEndpointRateLimit('/api/events/parking-signal', request);
  if (rateLimit.limited) {
    return publicRateLimitResponse(rateLimit);
  }

  let body: EventParkingSignalRequest;
  try {
    body = readBody(await request.json());
  } catch {
    return NextResponse.json({ signal: null });
  }

  const destination = readString(body.destination);
  const destinationName = readString(body.destinationName) || destination;
  const destinationKind = readString(body.destinationKind);
  const origin = readString(body.origin);
  const airportCode = readString(body.airportCode);

  if (destinationKind === 'airport' || airportCode) {
    return NextResponse.json({ signal: null });
  }

  const staticVenueSignal = isEventVenueDestination({
    destination: destinationName || destination,
    destinationKind,
    origin,
    airportCode,
  })
    ? buildStaticEventVenueSignal()
    : null;

  let dynamicSignal: EventParkingSignal | null = null;
  try {
    dynamicSignal = await lookupTicketmasterEventsNearTrip({
      destinationName: destinationName || destination,
      destinationLat: readNumber(body.destinationLat),
      destinationLng: readNumber(body.destinationLng),
      parkingCheckInDate: readString(body.parkingCheckInDate),
      parkingCheckInTime: readString(body.parkingCheckInTime),
      arrivalDate: readString(body.arrivalDate),
      arrivalTime: readString(body.arrivalTime),
      date: readString(body.date),
      time: readString(body.time),
      timezone: readString(body.timezone),
    });
  } catch {
    dynamicSignal = null;
  }

  return NextResponse.json({
    signal: dynamicSignal ?? staticVenueSignal,
  });
}
