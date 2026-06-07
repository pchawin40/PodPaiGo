import {
  buildParkingOptionsHints,
  inferParkingCategoryFromSignals,
  shouldDeprioritizeStreetParking,
  streetParkingScorePenalty,
} from '../googleParkingOptionsSignals';
import type { ParkingOption } from '../../types';

describe('googleParkingOptionsSignals', () => {
  test('metered street parking is a separate hint from paid lot or garage', () => {
    const bundle = buildParkingOptionsHints({
      paidStreetParking: true,
      paidParkingLot: true,
    });

    expect(bundle.hints.map((hint) => hint.label)).toEqual([
      'Paid parking likely',
      'Metered street parking may be nearby',
    ]);
  });

  test('builds customer lot and street hints for local trips', () => {
    const bundle = buildParkingOptionsHints(
      {
        freeParkingLot: true,
        freeStreetParking: true,
        paidGarageParking: true,
      },
      { airportTrip: false },
    );

    expect(bundle.hints.map((hint) => hint.label)).toEqual([
      'Free customer parking likely',
      'Free street parking may be available nearby',
      'Paid parking likely',
    ]);
    expect(bundle.verifyNotice).toContain('Verify posted signs');
  });

  test('does not recommend street parking hints for airport trips', () => {
    const bundle = buildParkingOptionsHints(
      { freeStreetParking: true, freeParkingLot: true },
      { airportTrip: true },
    );

    expect(bundle.hints.some((hint) => hint.category === 'street')).toBe(false);
  });

  test('street parking is heavily penalized for airport and long local stays', () => {
    const streetLot = {
      id: 'street',
      parkingCategory: 'street',
    } as ParkingOption;

    expect(inferParkingCategoryFromSignals({ freeStreetParking: true })).toBe('street');
    expect(
      shouldDeprioritizeStreetParking(streetLot, {
        type: 'one-way-departure',
        origin: 'Home',
        destination: 'SEA',
        departureDate: '2026-06-01',
        departureTime: '09:00',
        parkingDuration: 24 * 60,
      }),
    ).toBe(true);
    expect(
      streetParkingScorePenalty(streetLot, {
        type: 'general-trip',
        origin: 'Home',
        destination: 'Store',
        arrivalDate: '2026-06-01',
        arrivalTime: '09:00',
        parkingDuration: 8 * 60,
      }),
    ).toBeGreaterThan(30);
  });
});
