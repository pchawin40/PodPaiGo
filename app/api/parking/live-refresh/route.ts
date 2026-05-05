import { NextResponse } from 'next/server';
import { getAirportById } from '@/lib/airports/catalog';
import { getLiveParkingOptions } from '@/lib/providers/parkingAggregator';

export const dynamic = 'force-dynamic';

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

    const parking = await getLiveParkingOptions({
      airportCode: airport.id,
      destination: body.destination || airport.routingAddress,
      checkInDate: body.checkInDate,
      checkOutDate: body.checkOutDate,
    });

    return NextResponse.json({
      status: 'refreshed',
      fetchedAt: new Date().toISOString(),
      parking,
    });
  } catch (err) {
    console.error('live-refresh error', err);

    return NextResponse.json(
      { status: 'error', parking: [] },
      { status: 500 }
    );
  }
}