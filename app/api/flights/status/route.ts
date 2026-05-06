import { NextRequest, NextResponse } from 'next/server';
import { getMockFlightStatus } from '../../../../lib/flights/mockFlightStatus';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const flightInput = String(body.flightInput || body.flightNumber || '').trim();
    const airportCode = String(body.airportCode || 'SEA').trim().toUpperCase();
    const legType = body.legType === 'arrival' ? 'arrival' : 'departure';

    if (!flightInput) {
      return NextResponse.json(
        {
          error: 'Missing flightInput',
          flight: null,
        },
        { status: 400 }
      );
    }

    const flight = getMockFlightStatus(flightInput, airportCode, legType);

    return NextResponse.json({
      flight,
      source: 'mock',
    });
  } catch (error) {
    console.error('[flights/status] failed', error);

    return NextResponse.json(
      {
        error: 'Unable to fetch flight status',
        flight: null,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const flightInput = searchParams.get('flightInput') || searchParams.get('flightNumber') || '';
  const airportCode = (searchParams.get('airportCode') || 'SEA').toUpperCase();
  const legType = searchParams.get('legType') === 'arrival' ? 'arrival' : 'departure';

  if (!flightInput) {
    return NextResponse.json(
      {
        error: 'Missing flightInput',
        flight: null,
      },
      { status: 400 }
    );
  }

  const flight = getMockFlightStatus(flightInput, airportCode, legType);

  return NextResponse.json({
    flight,
    source: 'mock',
  });
}