/** @jest-environment node */

const refreshParkingPricesMock = jest.fn();

jest.mock('../../../../lib/jobs/refreshParkingPrices', () => ({
  refreshParkingPrices: (...args: unknown[]) => refreshParkingPricesMock(...args),
}));

const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string): void {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    writable: true,
  });
}

describe('cron route authorization', () => {
  beforeEach(() => {
    jest.resetModules();
    refreshParkingPricesMock.mockReset();
    delete process.env.CRON_SECRET;
    delete process.env.BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    setNodeEnv(originalNodeEnv);
    delete process.env.CRON_SECRET;
    delete process.env.BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  test('discover-parking fails closed in production when CRON_SECRET is unset', async () => {
    setNodeEnv('production');
    const { GET } = await import('../discover-parking/route');

    const response = await GET(new Request('http://localhost/api/cron/discover-parking'));

    expect(response.status).toBe(401);
  });

  test('refresh-parking fails closed in production when CRON_SECRET is unset', async () => {
    setNodeEnv('production');
    const { GET } = await import('../refresh-parking/route');

    const response = await GET(new Request('http://localhost/api/cron/refresh-parking'));

    expect(response.status).toBe(401);
    expect(refreshParkingPricesMock).not.toHaveBeenCalled();
  });

  test('refresh-parking keeps local behavior without CRON_SECRET', async () => {
    setNodeEnv('development');
    refreshParkingPricesMock.mockResolvedValue({ refreshed: 2 });
    const { GET } = await import('../refresh-parking/route');

    const response = await GET(new Request('http://localhost/api/cron/refresh-parking'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, refreshed: 2 });
    expect(refreshParkingPricesMock).toHaveBeenCalledTimes(1);
  });
});
