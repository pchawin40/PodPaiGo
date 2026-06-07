import { parkingDbCacheDisabledByConfig } from '../client';

describe('db client cache configuration', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalLocalDatabaseUrl = process.env.LOCAL_DATABASE_URL;
  const originalDisableParkingDbCache = process.env.DISABLE_PARKING_DB_CACHE;

  function restoreEnv(
    name: 'DATABASE_URL' | 'LOCAL_DATABASE_URL' | 'DISABLE_PARKING_DB_CACHE',
    value: string | undefined,
  ): void {
    if (typeof value === 'string') {
      process.env[name] = value;
      return;
    }

    delete process.env[name];
  }

  afterEach(() => {
    restoreEnv('DATABASE_URL', originalDatabaseUrl);
    restoreEnv('LOCAL_DATABASE_URL', originalLocalDatabaseUrl);
    restoreEnv('DISABLE_PARKING_DB_CACHE', originalDisableParkingDbCache);
  });

  test('placeholder Supabase still skips DB cache quickly', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env.DISABLE_PARKING_DB_CACHE = 'false';
    process.env.DATABASE_URL =
      'postgresql://postgres:<PASSWORD>@postgres.<PROJECT_REF>.supabase.co:6543/postgres';
    delete process.env.LOCAL_DATABASE_URL;

    try {
      expect(parkingDbCacheDisabledByConfig()).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
