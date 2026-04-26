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
});