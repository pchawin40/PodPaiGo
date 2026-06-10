import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { crawlAirportParkingReservationsSea } from '@/lib/providers/airportParkingReservationsCrawler';
import { saveAprPrices } from '@/lib/db/parkingCache';

export async function GET(request: Request) {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    const url = new URL(request.url);

    const checkInDate = url.searchParams.get('checkInDate') || '2026-04-28';
    const checkOutDate = url.searchParams.get('checkOutDate') || '2026-05-04';

    const lots = await crawlAirportParkingReservationsSea({
        checkInDate,
        checkOutDate,
        includeSoldOut: true,
    });

    const availableLots = lots.filter((lot) => !lot.isSoldOut);

    await saveAprPrices(
        lots.map((lot) => ({
            bookingUrl: lot.bookingUrl,
            lotId: String(lot.lotId ?? lot.bookingUrl),
            lotName: lot.lotName,
            airportCode: 'SEA',
            checkInDate,
            checkOutDate,
            livePrice: lot.isSoldOut ? null : lot.price,
            availabilityStatus: lot.isSoldOut
                ? 'unavailable'
                : lot.price
                    ? 'available'
                    : 'unknown',
            priceSource: 'apr-tracking',
            ttlHours: 12,
        }))
    );

    return NextResponse.json({
        saved: availableLots.length,
        checkInDate,
        checkOutDate,
        lots: availableLots,
    });
}
