import {
  buildParkAndRideAccessFromParking,
  isParkAndRideParkingOption,
} from '../parkAndRideAccess';
import type { ParkingOption, TripData } from '../../types';

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

  test('light rail Park & Ride access adds an estimated 8 minute wait to total time', () => {
    const tripData: TripData = {
      type: 'one-way-departure',
      origin: 'Seattle, WA',
      destination: 'SEA Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '09:00',
    };
    const option = buildParkAndRideAccessFromParking(
      parkingOption({
        id: 'northgate-link',
        name: 'Northgate Link Light Rail Park & Ride',
        type: 'park-and-ride',
        walkingMinutes: 6,
        transferToTerminalMinutes: 34,
      }),
      tripData,
      'SEA',
      {
        route: 'origin-to-park-ride',
        duration: 20,
        congestion: 'low',
        trustStatus: 'estimated',
        sourceName: 'Test route',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
    );

    expect(option.timing.waitMinutes).toBe(8);
    expect(option.timing.waitConfidence).toBe('estimated');
    expect(option.timing.terminalReadyMinutes).toBe(12 + 8 + 34 + 6);
    expect(option.timing.assumptions).toContain('Estimated transit wait 8 min');
  });

  test('bus Park & Ride access adds an estimated 10 minute wait to total time', () => {
    const tripData: TripData = {
      type: 'one-way-departure',
      origin: 'Seattle, WA',
      destination: 'SEA Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '09:00',
    };
    const option = buildParkAndRideAccessFromParking(
      parkingOption({
        id: 'bus-center',
        name: 'Community Transit Center Bus Park & Ride',
        type: 'park-and-ride',
        walkingMinutes: 5,
        transferToTerminalMinutes: 30,
      }),
      tripData,
      'SEA',
      {
        route: 'origin-to-park-ride',
        duration: 30,
        congestion: 'low',
        trustStatus: 'estimated',
        sourceName: 'Test route',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
    );

    expect(option.timing.waitMinutes).toBe(10);
    expect(option.timing.waitConfidence).toBe('estimated');
    expect(option.timing.terminalReadyMinutes).toBe(17 + 10 + 30 + 5);
    expect(option.timing.assumptions).toContain('Estimated transit wait 10 min');
  });
});
