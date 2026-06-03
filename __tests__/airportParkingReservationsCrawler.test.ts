import { crawlAirportParkingReservationsSea } from '../lib/providers/airportParkingReservationsCrawler';

jest.mock('../lib/providers/airportParkingReservationsCrawler', () => ({
  crawlAirportParkingReservationsSea: jest.fn(),
}));

const crawlMock = crawlAirportParkingReservationsSea as jest.MockedFunction<
  typeof crawlAirportParkingReservationsSea
>;

describe('airport parking reservations crawler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns an array from the SEA crawler', async () => {
    crawlMock.mockResolvedValueOnce([
      {
        source: 'airportparkingreservations',
        lotName: 'WallyPark SEA',
        price: 12.99,
        priceUnit: 'per-day',
        bookingUrl: 'https://airportparkingreservations.com/example-lot',
        lastChecked: '2026-06-01T12:00:00.000Z',
      },
    ]);

    const lots = await crawlAirportParkingReservationsSea();

    expect(Array.isArray(lots)).toBe(true);
    expect(lots).toHaveLength(1);
    expect(lots[0]?.lotName).toBe('WallyPark SEA');
  });

  test('date-aware APR search excludes sold-out lots when possible', async () => {
    crawlMock.mockResolvedValueOnce([
      {
        source: 'airportparkingreservations',
        lotName: 'Open Lot',
        price: 10.5,
        priceUnit: 'per-day',
        bookingUrl: 'https://airportparkingreservations.com/open-lot',
        lastChecked: '2026-06-01T12:00:00.000Z',
        isSoldOut: false,
      },
    ]);

    const lots = await crawlAirportParkingReservationsSea({
      checkInDate: '2026-05-08',
      checkOutDate: '2026-05-15',
    });

    expect(Array.isArray(lots)).toBe(true);

    for (const lot of lots) {
      expect(lot.isSoldOut).not.toBe(true);
    }
  });
});

describe.skip('airport parking reservations raw fetch (manual integration only)', () => {
  test('prints APR html snippet', async () => {
    const res = await fetch('https://airportparkingreservations.com/sea/airport-parking', {
      headers: {
        'User-Agent': 'Mozilla/5.0 PodPaiGoBot/0.1 (+https://podpaigo.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const html = await res.text();

    console.log('APR status:', res.status);
    console.log('APR html length:', html.length);
    console.log('APR html snippet:', html.slice(0, 1000));
  });

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
    console.log('Date APR snippet:', html.slice(0, 2000));
  });
});
