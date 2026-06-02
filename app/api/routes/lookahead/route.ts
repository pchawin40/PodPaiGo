import { NextRequest, NextResponse } from 'next/server';
import { runWithSearchBudget } from '@/lib/apiUsage/searchBudget';
import {
  resolveLookaheadDestination,
  resolveRouteLookahead,
  type RouteLookaheadMode,
  type RouteLookaheadTravelMode,
} from '@/lib/routes/routeLookahead';

export const runtime = 'nodejs';

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readMode(value: unknown): RouteLookaheadMode | null {
  return value === 'depart_at' || value === 'arrive_by' ? value : null;
}

function readTravelMode(value: unknown): RouteLookaheadTravelMode {
  return value === 'DRIVE' ? 'DRIVE' : 'DRIVE';
}

function readLatLng(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== 'object') return null;

  const lat = Number((value as { lat?: unknown }).lat);
  const lng = Number((value as { lng?: unknown }).lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const origin = readString(body.origin);
  const destination = readString(body.destination);
  const mode = readMode(body.mode);
  const targetTime = readString(body.targetTime);
  const travelMode = readTravelMode(body.travelMode);
  const airportCode = readString(body.airportCode) || null;
  const destinationLatLng = readLatLng(body.destinationLatLng);

  if (!origin || !destination || !mode || !targetTime) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: 'origin, destination, mode, and targetTime are required.',
      },
      { status: 400 },
    );
  }

  const resolved = resolveLookaheadDestination(destination, airportCode);

  const result = await resolveRouteLookahead({
    origin,
    destination: resolved.destination,
    mode,
    targetTime,
    travelMode,
    destinationLatLng: destinationLatLng ?? resolved.destinationLatLng ?? null,
    airportCode,
  });

  return NextResponse.json(result);
}
