import { TimeoutError } from '../lib/utils/asyncTimeout';
import {
  enqueueGooglePlacesCacheWrite,
  flushGooglePlacesCacheWriteQueueForTests,
  getGooglePlacesCacheWriteQueueStateForTests,
  getGooglePlacesCacheWriteTimeoutMs,
  incomingImprovesGooglePlacesCache,
  resetGooglePlacesCacheWriteForTests,
  shouldSkipGooglePlacesCacheWrite,
} from '../lib/parking/googlePlacesCacheWrite';

describe('googlePlacesCacheWrite', () => {
  beforeEach(() => {
    resetGooglePlacesCacheWriteForTests();
    delete process.env.GOOGLE_PLACES_CACHE_WRITE_TIMEOUT_MS;
    delete process.env.GOOGLE_PLACE_DB_WRITE_TIMEOUT_MS;
    delete process.env.GOOGLE_PLACES_CACHE_WRITE_MAX_PENDING;
  });

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  test('defaults write timeout to 10s outside production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    expect(getGooglePlacesCacheWriteTimeoutMs()).toBe(10_000);
    process.env.NODE_ENV = originalEnv;
  });

  test('respects GOOGLE_PLACES_CACHE_WRITE_TIMEOUT_MS', () => {
    process.env.GOOGLE_PLACES_CACHE_WRITE_TIMEOUT_MS = '15000';
    expect(getGooglePlacesCacheWriteTimeoutMs()).toBe(15_000);
  });

  test('skips fresh existing cache row with coords and photos', () => {
    const existing = {
      cacheKey: 'SEA|name:jiffy',
      googlePlaceId: 'place-1',
      lat: 47.4,
      lng: -122.3,
      photoNames: ['photos/1'],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    const incoming = {
      cacheKey: 'SEA|name:jiffy',
      googlePlaceId: 'place-1',
      lat: 47.4,
      lng: -122.3,
      photoNames: ['photos/1'],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    expect(shouldSkipGooglePlacesCacheWrite(existing, incoming)).toBe(true);
    expect(incomingImprovesGooglePlacesCache(existing, incoming)).toBe(false);
  });

  test('does not skip when incoming adds missing coords', () => {
    const existing = {
      cacheKey: 'SEA|name:jiffy',
      googlePlaceId: 'place-1',
      photoNames: ['photos/1'],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    const incoming = {
      cacheKey: 'SEA|name:jiffy',
      googlePlaceId: 'place-1',
      lat: 47.4,
      lng: -122.3,
      photoNames: ['photos/1'],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    expect(shouldSkipGooglePlacesCacheWrite(existing, incoming)).toBe(false);
  });

  test('cache write timeout is swallowed and does not throw to caller', async () => {
    const write = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      throw new TimeoutError('Google Places cache write');
    });

    await expect(
      enqueueGooglePlacesCacheWrite({
        cacheKey: 'SEA|name:timeout',
        incoming: { cacheKey: 'SEA|name:timeout' },
        write,
      }),
    ).resolves.toBeUndefined();

    expect(write).toHaveBeenCalledTimes(1);
  });

  test('limits concurrent cache writes to 2', async () => {
    let active = 0;
    let maxActive = 0;

    const write = jest.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 40));
      active -= 1;
    });

    const jobs = Array.from({ length: 5 }, (_, index) =>
      enqueueGooglePlacesCacheWrite({
        cacheKey: `SEA|name:lot-${index}`,
        incoming: { cacheKey: `SEA|name:lot-${index}` },
        write,
      }),
    );

    await Promise.all(jobs);
    await flushGooglePlacesCacheWriteQueueForTests();

    expect(write).toHaveBeenCalledTimes(5);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  test('does not retry a cache write immediately after timeout', async () => {
    const write = jest.fn(async () => {
      throw new TimeoutError('Google Places cache write');
    });

    await enqueueGooglePlacesCacheWrite({
      cacheKey: 'SEA|name:retry',
      incoming: { cacheKey: 'SEA|name:retry' },
      write,
    });
    await enqueueGooglePlacesCacheWrite({
      cacheKey: 'SEA|name:retry',
      incoming: { cacheKey: 'SEA|name:retry' },
      write,
    });
    await flushGooglePlacesCacheWriteQueueForTests();

    expect(write).toHaveBeenCalledTimes(1);
  });

  test('coalesces duplicate in-flight writes for the same cache key', async () => {
    const write = jest.fn(async () => {
      await delay(30);
    });

    const incoming = {
      cacheKey: 'SEA|name:dup',
      googlePlaceId: 'place-1',
      lat: 47.4,
      lng: -122.3,
    };

    const a = enqueueGooglePlacesCacheWrite({ cacheKey: 'SEA|name:dup', incoming, write });
    const b = enqueueGooglePlacesCacheWrite({ cacheKey: 'SEA|name:dup', incoming, write });
    const c = enqueueGooglePlacesCacheWrite({ cacheKey: 'SEA|name:dup', incoming, write });

    await Promise.all([a, b, c]);
    await flushGooglePlacesCacheWriteQueueForTests();

    expect(write).toHaveBeenCalledTimes(1);
    expect(getGooglePlacesCacheWriteQueueStateForTests().coalescedWrites).toBeGreaterThanOrEqual(2);
  });

  test('caps the queue and drops the lowest-priority pending write when full', async () => {
    process.env.GOOGLE_PLACES_CACHE_WRITE_MAX_PENDING = '1';

    const makeWrite = () =>
      jest.fn(async () => {
        await delay(40);
      });

    const w1 = makeWrite();
    const w2 = makeWrite();
    const wLow = makeWrite();
    const wHigh = makeWrite();

    const highValue = (cacheKey: string) => ({
      cacheKey,
      googlePlaceId: 'place',
      lat: 47.4,
      lng: -122.3,
      photoNames: ['photos/1'],
    });
    const lowValue = (cacheKey: string) => ({ cacheKey });

    // Two slow writes occupy the active slots (max concurrent = 2).
    const p1 = enqueueGooglePlacesCacheWrite({ cacheKey: 'k1', incoming: highValue('k1'), write: w1 });
    const p2 = enqueueGooglePlacesCacheWrite({ cacheKey: 'k2', incoming: highValue('k2'), write: w2 });
    // Low-priority write fills the single pending slot.
    const pLow = enqueueGooglePlacesCacheWrite({ cacheKey: 'k-low', incoming: lowValue('k-low'), write: wLow });
    // High-priority write arrives while the queue is full -> evicts the low one.
    const pHigh = enqueueGooglePlacesCacheWrite({ cacheKey: 'k-high', incoming: highValue('k-high'), write: wHigh });

    await Promise.all([p1, p2, pLow, pHigh]);
    await flushGooglePlacesCacheWriteQueueForTests();

    expect(wLow).not.toHaveBeenCalled();
    expect(w1).toHaveBeenCalledTimes(1);
    expect(w2).toHaveBeenCalledTimes(1);
    expect(wHigh).toHaveBeenCalledTimes(1);
    expect(getGooglePlacesCacheWriteQueueStateForTests().droppedWrites).toBeGreaterThanOrEqual(1);

    delete process.env.GOOGLE_PLACES_CACHE_WRITE_MAX_PENDING;
  });

  test('write failure is swallowed and does not reject the caller', async () => {
    const write = jest.fn(async () => {
      throw new Error('connection timeout exceeded when trying to connect');
    });

    await expect(
      enqueueGooglePlacesCacheWrite({
        cacheKey: 'SEA|name:fail',
        incoming: { cacheKey: 'SEA|name:fail' },
        write,
      }),
    ).resolves.toBeUndefined();
    await flushGooglePlacesCacheWriteQueueForTests();

    expect(write).toHaveBeenCalledTimes(1);
    expect(getGooglePlacesCacheWriteQueueStateForTests().failedWrites).toBeGreaterThanOrEqual(1);
  });

  test('skips enqueue when existing row is already fresh and complete', async () => {
    const write = jest.fn(async () => undefined);
    const existing = {
      cacheKey: 'SEA|name:cached',
      googlePlaceId: 'place-1',
      lat: 47.4,
      lng: -122.3,
      photoNames: ['photos/1'],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    await enqueueGooglePlacesCacheWrite({
      cacheKey: existing.cacheKey,
      incoming: existing,
      existing,
      write,
    });
    await flushGooglePlacesCacheWriteQueueForTests();

    expect(write).not.toHaveBeenCalled();
    expect(getGooglePlacesCacheWriteQueueStateForTests().activeWrites).toBe(0);
  });
});
