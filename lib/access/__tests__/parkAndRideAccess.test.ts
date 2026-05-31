import { isParkAndRideParkingOption } from '../parkAndRideAccess';
import type { ParkingOption } from '../../types';

function parkingOption(overrides: Partial<ParkingOption>): ParkingOption {
  return {
    id: 'test',
    name: 'Test',
    type: 'off-airport',
    price: 10,
    distance: 10,
    availability: 50,
    trustStatus: 'estimated',
    sourceName: 'Test',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    assumptions: [],
    ...overrides,
  };
}

describe('park and ride parking classification', () => {
  test('detects park-and-ride by type, transfer, and name patterns', () => {
    expect(isParkAndRideParkingOption(parkingOption({ type: 'park-and-ride', name: 'Lot A' }))).toBe(true);
    expect(isParkAndRideParkingOption(parkingOption({ transferType: 'transit', name: 'Station Lot' }))).toBe(true);
    expect(isParkAndRideParkingOption(parkingOption({ name: 'Narrows Park & Ride' }))).toBe(true);
    expect(isParkAndRideParkingOption(parkingOption({ name: 'Northgate Transit Center Parking' }))).toBe(true);
  });

  test('does not classify normal off-airport parking as park-and-ride', () => {
    expect(isParkAndRideParkingOption(parkingOption({ name: 'WallyPark SEA' }))).toBe(false);
    expect(isParkAndRideParkingOption(parkingOption({ name: 'SEA Airport Parking Garage' }))).toBe(false);
  });
});
