import { NextRequest, NextResponse } from 'next/server';
import { getAirports, getAirportByIdDynamic } from '@/lib/airports/repository';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim();

  try {
    if (code) {
      const airport = await getAirportByIdDynamic(code);
      if (!airport) {
        return NextResponse.json({ airport: null, source: 'lookup-service' }, { status: 404 });
      }
      return NextResponse.json({ airport, source: 'lookup-service' });
    }

    const airports = await getAirports();
    return NextResponse.json({
      airports,
      source: 'lookup-service',
      count: airports.length,
    });
  } catch (error) {
    console.error('Airport list failed', error);
    return NextResponse.json(
      { airports: [], source: 'error', count: 0 },
      { status: 500 },
    );
  }
}
