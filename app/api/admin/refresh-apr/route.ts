import { NextResponse } from 'next/server';
import { crawlAirportParkingReservationsSea } from '@/lib/providers/airportParkingReservationsCrawler';
import { saveAprPrices } from '@/lib/db/parkingCache';

export async function GET(request: Request) {
    const url = new URL(request.url);

    const checkInDate = url.searchParams.get('checkInDate') || '2026-04-28';
    const checkOutDate = url.searchParams.get('checkOutDate') || '2026-05-04';

    const lots = await crawlAirportParkingReservationsSea({
        checkInDate,
        checkOutDate,
    });

    await saveAprPrices(
        lots.map((lot) => ({
            bookingUrl: lot.bookingUrl,
            lotId: String(lot.lotId ?? lot.bookingUrl),
            lotName: lot.lotName,
            airportCode: 'SEA',
            checkInDate,
            checkOutDate,
            livePrice: lot.price,
            priceSource: 'apr-tracking',
            ttlHours: 12,
        }))
    );

    return NextResponse.json({ saved: lots.length, checkInDate, checkOutDate, lots });
}