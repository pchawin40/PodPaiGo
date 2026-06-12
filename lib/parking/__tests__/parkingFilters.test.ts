import type { ParkingOption } from '../../types';
import { filterParkingOptionsByFeatures, matchesParkingFeatureFilters, countParkingFeatureMatches } from '../parkingFilters';

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

  test('unverified EV charging does not pass strict EV filter', () => {
    const inferredEv: ParkingOption = {
      ...SAMPLE,
      id: 'inferred-ev',
      name: 'Electric Avenue Parking',
      sourceName: 'Google Places',
      providerSource: 'google-places',
      bestFor: [],
      assumptions: ['May have electric charging nearby'],
    };

    expect(matchesParkingFeatureFilters(inferredEv, { evCharging: true })).toBe(false);
  });

  test('provider-claimed shuttle passes strict shuttle filter', () => {
    const shuttleLot: ParkingOption = {
      ...SAMPLE,
      id: 'provider-shuttle',
      name: 'Airport Shuttle Lot',
      sourceName: 'AirportParkingReservations',
      bookingProvider: 'AirportParkingReservations',
      providerSource: 'airportparkingreservations',
      transferType: 'shuttle',
    };

    expect(matchesParkingFeatureFilters(shuttleLot, { shuttle: true })).toBe(true);
  });

  test('explicit unknown feature confidence does not pass strict filter', () => {
    const unknownCovered: ParkingOption = {
      ...SAMPLE,
      id: 'unknown-covered',
      covered: true,
      featureConfidence: {
        covered: 'unknown',
      },
    };

    expect(matchesParkingFeatureFilters(unknownCovered, { covered: true })).toBe(false);
  });

  test('countParkingFeatureMatches returns Excel-style counts on the base lot list', () => {
    const shuttleLot: ParkingOption = {
      ...SAMPLE,
      id: 'shuttle',
      name: 'Airport Shuttle Lot',
      covered: false,
      transferType: 'shuttle',
      sourceName: 'AirportParkingReservations',
      bookingProvider: 'AirportParkingReservations',
      providerSource: 'airportparkingreservations',
    };
    const openLot: ParkingOption = {
      ...SAMPLE,
      id: 'open',
      name: 'Open Economy Lot',
      covered: false,
      bestFor: [],
    };

    const lots = [SAMPLE, shuttleLot, openLot];
    const counts = countParkingFeatureMatches(lots);

    expect(counts.covered).toBeGreaterThanOrEqual(1);
    expect(counts.shuttle).toBe(1);
    expect(counts.selfPark).toBeGreaterThanOrEqual(2);
    expect(counts.evCharging).toBe(0);
  });

  test('feature filter counts ignore active filters (base list only)', () => {
    const shuttleLot: ParkingOption = {
      ...SAMPLE,
      id: 'shuttle-only',
      name: 'Shuttle Lot',
      covered: false,
      transferType: 'shuttle',
      sourceName: 'APR',
      bookingProvider: 'AirportParkingReservations',
      providerSource: 'airportparkingreservations',
    };
    const lots = [SAMPLE, shuttleLot];
    const filtered = filterParkingOptionsByFeatures(lots, { shuttle: true });

    expect(filtered).toHaveLength(1);
    expect(countParkingFeatureMatches(lots).shuttle).toBe(1);
    expect(countParkingFeatureMatches(filtered).shuttle).toBe(1);
  });
});
