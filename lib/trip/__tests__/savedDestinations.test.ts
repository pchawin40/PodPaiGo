/**
 * @jest-environment jsdom
 */
import {
  deleteSavedDestination,
  readSavedDestinations,
  upsertSavedDestination,
} from '../savedDestinations';
import {
  deleteSavedParkingLot,
  readSavedParkingLots,
  upsertSavedParkingLot,
} from '../travelPreferences';

describe('saved destinations storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('saved destination appears in account storage', () => {
    upsertSavedDestination({
      label: 'Fred Meyer Monroe',
      destination: '19500 Hwy 2, Monroe, WA',
      accessType: 'free',
      notes: 'Customer lot',
    });

    const destinations = readSavedDestinations();
    expect(destinations).toHaveLength(1);
    expect(destinations[0]?.label).toBe('Fred Meyer Monroe');
    expect(destinations[0]?.accessType).toBe('free');

    const next = deleteSavedDestination(destinations[0]!.id);
    expect(next).toHaveLength(0);
    expect(readSavedDestinations()).toHaveLength(0);
  });
});

describe('saved parking lots storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('saved parking lot appears in account storage', () => {
    upsertSavedParkingLot({
      label: 'Pacific Place Garage',
      lotName: 'Pacific Place Garage',
      address: '600 Pine St, Seattle, WA',
      accessType: 'paid',
      notes: 'Validated with purchase',
    });

    const lots = readSavedParkingLots();
    expect(lots).toHaveLength(1);
    expect(lots[0]?.label).toBe('Pacific Place Garage');
    expect(lots[0]?.accessType).toBe('paid');

    const next = deleteSavedParkingLot(lots[0]!.id);
    expect(next).toHaveLength(0);
    expect(readSavedParkingLots()).toHaveLength(0);
  });
});
