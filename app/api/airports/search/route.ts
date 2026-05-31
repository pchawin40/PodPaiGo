import { NextRequest, NextResponse } from 'next/server';
import { searchAirports } from '@/lib/airports/repository';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() || '';
  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get('limit') || 10), 1),
    25,
  );

  try {
    const airports = await searchAirports(query, limit);

    return NextResponse.json({
      airports,
      query,
      count: airports.length,
      source: 'lookup-service',
    });
  } catch (error) {
    console.error('Airport search failed', error);
    return NextResponse.json(
      { error: 'Airport search failed', airports: [], query, count: 0 },
      { status: 500 },
    );
  }
}
