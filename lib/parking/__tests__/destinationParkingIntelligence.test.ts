import { buildDestinationParkingIntelligence } from '../destinationParkingIntelligence';
import { buildParkingOutlook } from '../parkingOutlook';
import { EVENT_PARKING_OUTLOOK_COPY } from '../eventVenueDetection';
import type { ParkingOption } from '../../types';

const paidEventLot = {
  id: 'event-lot',
  name: 'Lumen Field Event Garage',
  type: 'off-airport' as const,
  price: 45,
  priceUnit: 'total' as const,
  distance: 0.3,
  originToParkingMinutes: 25,
  routeToParkingMinutes: 25,
  availability: 80,
  trustStatus: 'estimated' as const,
  sourceName: 'ParkWhiz',
  lastUpdated: '2026-06-01T00:00:00Z',
  assumptions: [],
  transferToTerminalMinutes: 8,
  parkingCategory: 'garage_paid' as const,
  googleParkingOptions: { paidGarageParking: true },
  bookingProvider: 'ParkWhiz',
} satisfies ParkingOption;

describe('destinationParkingIntelligence event venues', () => {
  test('Lumen Field maps to stadium_event_venue with event rules', () => {
    const intelligence = buildDestinationParkingIntelligence({
      destination: 'Lumen Field, Seattle, WA',
      parkingOptions: [paidEventLot],
    });

    expect(intelligence.category).toBe('stadium_event_venue');
    expect(intelligence.eventRulesLikely).toBe(true);
    expect(intelligence.customerParkingPlausible).toBe(false);
    expect(intelligence.customerCandidate).toBeNull();
    expect(intelligence.paidOptionBestLabel).toBe('Best confirmed event parking');
    expect(intelligence.warning).toBe(EVENT_PARKING_OUTLOOK_COPY);
  });

  test('Seahawks game trip text with Lumen Field triggers event mode', () => {
    const intelligence = buildDestinationParkingIntelligence({
      destination: 'Lumen Field, Seattle, WA',
      origin: 'Bellevue, WA Seahawks game',
      parkingOptions: [paidEventLot],
    });

    expect(intelligence.eventRulesLikely).toBe(true);
    expect(intelligence.customerCandidate).toBeNull();
  });

  test('Fred Meyer retail still gets customer parking candidate', () => {
    const intelligence = buildDestinationParkingIntelligence({
      destination: 'Fred Meyer, Monroe, WA',
      parkingOptions: [paidEventLot, paidEventLot, paidEventLot],
    });

    expect(intelligence.category).toBe('grocery_store_mall');
    expect(intelligence.eventRulesLikely).toBe(false);
    expect(intelligence.customerCandidate).not.toBeNull();
  });

  test('airport trip stays separate from event logic', () => {
    const intelligence = buildDestinationParkingIntelligence({
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
      parkingOptions: [paidEventLot],
    });

    expect(intelligence.category).toBe('airport');
    expect(intelligence.eventRulesLikely).toBe(false);
    expect(intelligence.customerCandidate).toBeNull();
  });
});

describe('buildParkingOutlook event venues', () => {
  test('Lumen Field does not show free customer parking outlook', () => {
    const outlook = buildParkingOutlook({
      destination: 'Lumen Field, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      googleParkingOptions: { freeParkingLot: true },
    });

    expect(outlook.headline).toBe('Event parking likely');
    expect(outlook.headline).not.toBe('Free customer parking likely');
    expect(outlook.reason).toBe(EVENT_PARKING_OUTLOOK_COPY);
  });
});
