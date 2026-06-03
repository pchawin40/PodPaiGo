import type { ParkingOption } from '../types';
import { filterParkingOptionsByFeatures, matchesParkingFeatureFilters } from '../parkingFilters';

const SAMPLE: ParkingOption = {
  id: 'garage',
  name: 'SEA Covered Garage',
  type: 'official',
  price: 30,
  distance: 10,
  availability: 80,
  trustStatus: 'estimated',
  sourceName: 'Test',
  lastUpdated: '2026-01-01T00:00:00.000Z',
  assumptions: [],
  covered: true,
  transferType: 'walk',
  bestFor: ['Covered', 'Self-park'],
};

describe('parkingFilters', () => {
  test('covered filter matches garage options', () => {
    expect(matchesParkingFeatureFilters(SAMPLE, { covered: true })).toBe(true);
    expect(
      matchesParkingFeatureFilters(
        { ...SAMPLE, covered: false, name: 'Open Economy Lot', bestFor: [] },
        { covered: true },
      ),
    ).toBe(false);
  });

  test('filterParkingOptionsByFeatures returns only matching lots', () => {
    const shuttleLot: ParkingOption = {
      ...SAMPLE,
      id: 'shuttle',
      name: 'Airport Shuttle Lot',
      covered: false,
      transferType: 'shuttle',
    };

    const filtered = filterParkingOptionsByFeatures([SAMPLE, shuttleLot], { shuttle: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('shuttle');
  });
});
