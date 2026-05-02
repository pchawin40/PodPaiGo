import { crawlAirportParkingReservationsSea } from '../lib/providers/airportParkingReservationsCrawler';

describe('airport parking reservations crawler', () => {
    test('tries to find SEA parking prices', async () => {
        const lots = await crawlAirportParkingReservationsSea();

        console.log('APR lots:', lots);

        expect(Array.isArray(lots)).toBe(true);
    });
});

describe('airport parking reservations raw fetch', () => {
    test('prints APR html snippet', async () => {
        const res = await fetch(
            'https://airportparkingreservations.com/sea/airport-parking',
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 PodPaiGoBot/0.1 (+https://podpaigo.com)',
                    Accept: 'text/html,application/xhtml+xml',
                },
            }
        );

        const html = await res.text();

        console.log('APR status:', res.status);
        console.log('APR html length:', html.length);
        console.log('APR html snippet:', html.slice(0, 1000));
        console.log('APR has dollar:', html.includes('$'));
        console.log('APR has parking:', html.toLowerCase().includes('parking'));

        const priceMatches = Array.from(
            html.matchAll(/\$[0-9]+(?:\.[0-9]{1,2})?/g)
        )
            .slice(0, 15)
            .map((m) => {
                const i = m.index ?? 0;
                return html.slice(
                    Math.max(0, i - 150),
                    Math.min(html.length, i + 150)
                );
            });

        console.log('APR price snippets:', priceMatches);
    });

    test('date-aware APR search excludes sold-out lots when possible', async () => {
        const lots = await crawlAirportParkingReservationsSea({
            checkInDate: '2026-05-08',
            checkOutDate: '2026-05-15',
        });

        console.log('Date-aware APR lots:', lots);

        expect(Array.isArray(lots)).toBe(true);

        for (const lot of lots) {
            expect(lot.isSoldOut).not.toBe(true);
        }
    }, 45000);

    test('prints date-aware APR search html snippet', async () => {
        const url =
            'https://airportparkingreservations.com/sea/airport-parking?checkindate=May+8%2C+2026&checkoutdate=May+15%2C+2026';

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 PodPaiGoBot/0.1 (+https://podpaigo.com)',
                Accept: 'text/html,application/xhtml+xml',
            },
        });

        const html = await res.text();

        console.log('Date APR status:', res.status);
        console.log('Date APR html length:', html.length);
        console.log('Date APR sold out?', html.toLowerCase().includes('sold out'));
        console.log('Date APR DoubleTree?', html.toLowerCase().includes('doubletree'));
        console.log('Date APR snippet:', html.slice(0, 2000));
    });
});
