import { recordApiUsage, resetApiUsageStateForTests } from '../../apiUsage/guard';
import {
  getGooglePlacesDailyCountsSnapshot,
  recordGooglePlacesDailyCall,
  resetGooglePlacesDailyBudgetForTests,
} from '../../apiUsage/googlePlacesDailyBudget';

describe('google_usage_summary daily counts reflect real routes/geocoding usage', () => {
  beforeEach(() => {
    resetApiUsageStateForTests();
    resetGooglePlacesDailyBudgetForTests();
  });

  afterEach(() => {
    resetApiUsageStateForTests();
    resetGooglePlacesDailyBudgetForTests();
  });

  test('routes/geocoding read 0 only when no route or geocode calls were recorded', () => {
    const counts = getGooglePlacesDailyCountsSnapshot();
    expect(counts.routes).toBe(0);
    expect(counts.geocoding).toBe(0);
  });

  test('recordApiUsage bumps the routes/geocoding daily counters', async () => {
    // Places daily-budget counters track searchText/getPlace/photoMedia directly.
    recordGooglePlacesDailyCall('searchText');

    // Routes + geocoding now flow through recordApiUsage into the same snapshot,
    // instead of being hard-zero values that hid real usage.
    await recordApiUsage('google_routes');
    await recordApiUsage('google_routes');
    await recordApiUsage('geocoding');

    const counts = getGooglePlacesDailyCountsSnapshot();
    expect(counts.searchText).toBe(1);
    expect(counts.routes).toBe(2);
    expect(counts.geocoding).toBe(1);
  });
});
