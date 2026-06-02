import { runPlaceSnapshotCoordBackfill } from '../scripts/backfill-place-snapshot-coords';

jest.mock('../lib/db/client', () => ({
  getDb: jest.fn(),
}));

jest.mock('../lib/env/googleMapsServerKey', () => ({
  getGoogleMapsServerApiKey: jest.fn(() => 'test-key'),
}));

const { getDb } = jest.requireMock('../lib/db/client') as {
  getDb: jest.Mock;
};

const { getGoogleMapsServerApiKey } = jest.requireMock('../lib/env/googleMapsServerKey') as {
  getGoogleMapsServerApiKey: jest.Mock;
};

describe('backfill place snapshot coords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.BACKFILL_DRY_RUN;
    delete process.env.BACKFILL_PLACE_SNAPSHOT_LIMIT;
    process.env.DATABASE_URL = 'postgres://example';
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
    getGoogleMapsServerApiKey.mockReturnValue('test-key');
    getDb.mockReset();
  });

  test('dry run scans rows without Google calls or updates', async () => {
    process.env.BACKFILL_DRY_RUN = 'true';

    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { cacheKey: 'k1', googlePlaceId: 'place-a' },
          { cacheKey: 'k2', googlePlaceId: 'place-b' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: '242' }] })
      .mockResolvedValueOnce({ rows: [{ cacheKey: 'k1', googlePlaceId: 'place-a' }] })
      .mockResolvedValueOnce({ rows: [{ cacheKey: 'k2', googlePlaceId: 'place-b' }] })
      .mockResolvedValueOnce({ rows: [{ count: '242' }] });

    getDb.mockReturnValue({ query });

    const fetchMock = jest.spyOn(global, 'fetch');
    const stats = await runPlaceSnapshotCoordBackfill();

    expect(stats.dryRun).toBe(true);
    expect(stats.rowsScanned).toBe(2);
    expect(stats.rowsUpdated).toBe(0);
    expect(stats.googleCallsMade).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('live run updates all rows for a place id and stops on Google error', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ cacheKey: 'k1', googlePlaceId: 'place-a' }] })
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ cacheKey: 'k1', googlePlaceId: 'place-a' }] })
      .mockResolvedValueOnce({ rows: [{ count: '4' }] });

    getDb.mockReturnValue({ query });

    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('quota exceeded'));

    const stats = await runPlaceSnapshotCoordBackfill();

    expect(stats.stoppedEarly).toBe(true);
    expect(stats.googleCallsMade).toBe(1);
    expect(stats.rowsUpdated).toBe(0);
    expect(stats.stopReason).toContain('quota exceeded');
  });
});
