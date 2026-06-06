import { parkingDbCacheDisabledByConfig } from '../client';

describe('parkingDbCacheDisabledByConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('skips DB cache for placeholder Supabase config', () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:password@postgres.<PROJECT_REF>.supabase.co:6543/postgres';

    expect(parkingDbCacheDisabledByConfig()).toBe(true);
  });

  test('skips DB cache when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    delete process.env.LOCAL_DATABASE_URL;

    expect(parkingDbCacheDisabledByConfig()).toBe(true);
  });
});
