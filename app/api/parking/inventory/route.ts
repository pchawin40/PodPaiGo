import { NextRequest, NextResponse } from 'next/server';
import { getParkingLotsByAirport } from '../../../../lib/parking/inventory';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    const airportCode = req.nextUrl.searchParams.get('airportCode') ?? 'SEA';

    const radiusMiles = Number(req.nextUrl.searchParams.get('radiusMiles') ?? 8);
    const lots = await getParkingLotsByAirport(airportCode, radiusMiles);

    return NextResponse.json({
        airportCode: airportCode.toUpperCase(),
        count: lots.length,
        lots,
        radiusMiles
    });
}