import { saveAprPrices } from '../db/parkingCache';
import { crawlAirportParkingReservationsSea } from '../providers/airportParkingReservationsCrawler';

const AIRPORT_CODE = 'SEA';

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function toYYYYMMDD(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export async function refreshParkingPrices() {
    const today = new Date();

    const stayLengths = [1, 2, 3, 5, 6, 7];

    const dateRanges = stayLengths.map((days) => ({
        checkInDate: toYYYYMMDD(addDays(today, 1)),
        checkOutDate: toYYYYMMDD(addDays(today, 1 + days)),
    }));

    const summary = [];

    for (const range of dateRanges) {
        const lots = await crawlAirportParkingReservationsSea(range);

        await saveAprPrices(
            lots.map((lot) => ({
                bookingUrl: lot.bookingUrl,
                lotId: String(lot.lotId ?? lot.bookingUrl),
                lotName: lot.lotName,
                airportCode: AIRPORT_CODE,
                checkInDate: range.checkInDate,
                checkOutDate: range.checkOutDate,
                livePrice: lot.price ?? null,
                priceSource: 'scheduled-refresh',
                ttlHours: 12,
            })),
        );

        summary.push({
            ...range,
            lotsSaved: lots.length,
        });
    }

    return {
        airportCode: AIRPORT_CODE,
        refreshedAt: new Date().toISOString(),
        summary,
    };
}