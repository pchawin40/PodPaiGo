import type { TransitOption, TripData } from '../../types';
import {
  calculateTransitCost,
  formatTransitCostDisplay,
  getTransitOneWayCost,
  getTransitTripTotalCost,
  shouldIncludeReturnTransitLeg,
} from '../transitPricing';

const transit: TransitOption = {
  id: 'light-rail',
  name: 'Light Rail',
  price: 3,
  duration: 40,
  frequency: 10,
  trustStatus: 'verified-source',
  sourceName: 'Sound Transit',
  sourceLink: 'https://www.soundtransit.org',
  mapLink: 'https://maps.google.com/?q=SeaTac+Light+Rail',
  lastUpdated: new Date().toISOString(),
  assumptions: [],
};

describe('shouldIncludeReturnTransitLeg', () => {
  test('returns true for round-trip', () => {
    const tripData: TripData = {
      type: 'round-trip',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      returnDate: '2026-06-05',
      returnTime: '18:00',
      destinationKind: 'airport',
    };

    expect(shouldIncludeReturnTransitLeg(tripData)).toBe(true);
  });

  test('returns true for airport flying-out trip with multi-day parking checkout', () => {
    const tripData: TripData = {
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      parkingCheckInDate: '2026-06-01',
      parkingCheckOutDate: '2026-06-05',
      destinationKind: 'airport',
      airportCode: 'SEA',
    };

    expect(shouldIncludeReturnTransitLeg(tripData)).toBe(true);
  });

  test('returns false for same-day one-way airport trip', () => {
    const tripData: TripData = {
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      parkingCheckInDate: '2026-06-01',
      parkingCheckOutDate: '2026-06-01',
      destinationKind: 'airport',
      airportCode: 'SEA',
    };

    expect(shouldIncludeReturnTransitLeg(tripData)).toBe(false);
  });
});

describe('calculateTransitCost', () => {
  test('doubles transit for round-trip', () => {
    const tripData: TripData = {
      type: 'round-trip',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      returnDate: '2026-06-05',
      returnTime: '18:00',
    };

    expect(calculateTransitCost(transit, tripData)).toBe(6);
    expect(getTransitOneWayCost(transit)).toBe(3);
  });

  test('doubles transit for multi-day airport parking trip', () => {
    const tripData: TripData = {
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      parkingCheckInDate: '2026-06-01',
      parkingCheckOutDate: '2026-06-05',
      destinationKind: 'airport',
    };

    expect(calculateTransitCost(transit, tripData)).toBe(6);
  });

  test('does not double for same-day one-way trip', () => {
    const tripData: TripData = {
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      parkingCheckInDate: '2026-06-01',
      parkingCheckOutDate: '2026-06-01',
      destinationKind: 'airport',
    };

    expect(calculateTransitCost(transit, tripData)).toBe(3);
  });

  test('returns zero with transit pass', () => {
    const tripData: TripData = {
      type: 'round-trip',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      returnDate: '2026-06-05',
      returnTime: '18:00',
      transitPayment: 'orca-pass',
    };

    expect(calculateTransitCost(transit, tripData)).toBe(0);
    expect(getTransitTripTotalCost(transit, tripData)).toBe(0);
  });
});

describe('getTransitTripTotalCost', () => {
  test('prefers calculatedCost then trueTotalCost over raw one-way price', () => {
    const roundTrip: TripData = {
      type: 'round-trip',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      returnDate: '2026-06-05',
      returnTime: '18:00',
    };

    expect(getTransitTripTotalCost({ ...transit, calculatedCost: 6 }, roundTrip)).toBe(6);
    expect(getTransitTripTotalCost({ ...transit, trueTotalCost: 6.5 }, roundTrip)).toBe(6.5);
    expect(getTransitTripTotalCost(transit, roundTrip)).toBe(6);
    expect(transit.price).toBe(3);
  });
});

describe('formatTransitCostDisplay', () => {
  test('shows round-trip labels when return leg is included', () => {
    const roundTrip: TripData = {
      type: 'round-trip',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      returnDate: '2026-06-05',
      returnTime: '18:00',
    };

    const display = formatTransitCostDisplay(transit, roundTrip);

    expect(display.tripTotal).toBe(6);
    expect(display.primary).toBe('$6 round-trip est.');
    expect(display.secondary).toBe('$3 one-way × 2');
  });

  test('shows one-way labels when return leg is not included', () => {
    const oneWay: TripData = {
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      parkingCheckInDate: '2026-06-01',
      parkingCheckOutDate: '2026-06-01',
      destinationKind: 'airport',
    };

    const display = formatTransitCostDisplay(transit, oneWay);

    expect(display.tripTotal).toBe(3);
    expect(display.primary).toBe('$3 one-way est.');
    expect(display.secondary).toBeNull();
  });

  test('compare-style display uses trip total rather than raw price field', () => {
    const roundTrip: TripData = {
      type: 'round-trip',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      returnDate: '2026-06-05',
      returnTime: '18:00',
    };

    const display = formatTransitCostDisplay(transit, roundTrip);

    expect(display.tripTotal).not.toBe(transit.price);
    expect(display.tripTotal).toBe(getTransitTripTotalCost(transit, roundTrip));
  });

  test('quick-read style summary uses trip total labels', () => {
    const roundTrip: TripData = {
      type: 'round-trip',
      origin: 'Monroe, WA',
      destination: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '08:00',
      returnDate: '2026-06-05',
      returnTime: '18:00',
    };

    const display = formatTransitCostDisplay(transit, roundTrip);
    const quickReadPrimary = `at ${display.primary}`;
    const quickReadWithSecondary = display.secondary
      ? `${quickReadPrimary} (${display.secondary})`
      : quickReadPrimary;

    expect(quickReadPrimary).toBe('at $6 round-trip est.');
    expect(quickReadWithSecondary).toBe('at $6 round-trip est. ($3 one-way × 2)');
    expect(display.tripTotal).toBe(6);
  });
});
