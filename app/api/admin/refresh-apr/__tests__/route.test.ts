import { NextRequest } from 'next/server';

describe('/api/admin/refresh-apr', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env.ADMIN_EMAILS = 'admin@example.com';
    delete process.env.ALLOW_LOCAL_ADMIN;
    delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;
  });

  test('signed-out user cannot refresh APR cache', async () => {
    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => null),
    }));

    const { GET } = await import('../route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/refresh-apr'),
    );

    expect(response.status).toBe(401);
  });

  test('admin user can refresh APR cache', async () => {
    const authClient = {
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: { id: 'admin-1', email: 'admin@example.com' } },
        })),
      },
    };
    const crawlAirportParkingReservationsSea = jest.fn(async () => [
      {
        bookingUrl: 'https://apr.example.com/lot-1',
        lotId: 'lot-1',
        lotName: 'APR Lot 1',
        price: 42,
        isSoldOut: false,
      },
      {
        bookingUrl: 'https://apr.example.com/lot-2',
        lotId: 'lot-2',
        lotName: 'APR Lot 2',
        price: null,
        isSoldOut: true,
      },
    ]);
    const saveAprPrices = jest.fn(async () => undefined);

    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => authClient),
    }));
    jest.doMock('@/lib/providers/airportParkingReservationsCrawler', () => ({
      crawlAirportParkingReservationsSea,
    }));
    jest.doMock('@/lib/db/parkingCache', () => ({
      saveAprPrices,
    }));

    const { GET } = await import('../route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/admin/refresh-apr?checkInDate=2026-06-01&checkOutDate=2026-06-02',
        { headers: { Authorization: 'Bearer admin-token' } },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      saved: 1,
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-02',
    });
    expect(crawlAirportParkingReservationsSea).toHaveBeenCalledWith({
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-02',
      includeSoldOut: true,
    });
    expect(saveAprPrices).toHaveBeenCalledWith([
      expect.objectContaining({ lotId: 'lot-1', livePrice: 42 }),
      expect.objectContaining({ lotId: 'lot-2', livePrice: null }),
    ]);
  });
});
