import type { ParkingOption } from '../../types';
import { rankPointAbModes } from '../pointAbRanking';
import { buildPointAbQuickReadMessage } from '../pointAbQuickRead';
import { buildStreetMeterParkingOption } from '../streetMeterParking';
import type { StreetMeterParkingPresentation } from '../streetMeterParking';

const formatMinutes = (minutes: number) => `${minutes} min`;

const tripData = {
  type: 'general-trip' as const,
  origin: 'Bellevue, WA',
  destination: 'Brighton Jones, downtown Seattle, WA',
  arrivalDate: '2026-06-08',
  arrivalTime: '20:30',
  parkingDuration: 120,
  transportAvailability: 'all' as const,
};

const paidGarage = {
  id: 'downtown-garage',
  name: 'Securities Building Garage',
  type: 'off-airport' as const,
  price: 12,
  priceUnit: 'total' as const,
  distance: 0.2,
  originToParkingMinutes: 31,
  routeToParkingMinutes: 31,
  availability: 80,
  trustStatus: 'estimated' as const,
  sourceName: 'Test',
  lastUpdated: '2026-06-01T00:00:00Z',
  assumptions: [],
  transferToTerminalMinutes: 5,
  parkingBufferMinutes: 8,
  parkingCategory: 'garage_paid' as const,
  googleParkingOptions: { paidGarageParking: true },
} satisfies ParkingOption;

// Realistic long "parking outlook" copy that used to be jammed into the small Cost tile.
const LONG_OUTLOOK =
  'Between 8 PM and 10 PM, some Seattle neighborhoods still require payment, and posted signs may set time limits or restrict parking entirely, so confirm the meter and posted signage before leaving your car.';

const uncertainStreetMeter: StreetMeterParkingPresentation = {
  applicable: true,
  label: 'Street / meter parking',
  name: 'Check signs / special rules possible',
  cost: 0,
  costDisplay: 'Check meter',
  costNote: LONG_OUTLOOK,
  durationMinutes: 35,
  timeDisplay: '35 min',
  confidence: 'Medium',
  pros: ['Evening blocks may still have open stalls', 'You keep your car nearby'],
  cons: ['Street availability is not guaranteed', 'Verify posted signs before leaving your car'],
  warnings: ['Confirm posted signs, time limits, and payment hours before parking.'],
  verifyRequired: true,
  sourceLabel: 'Seattle street rule (conservative)',
};

function rankDowntownTrip(streetMeter: StreetMeterParkingPresentation | null) {
  return rankPointAbModes({
    tripData,
    sort: 'easiest',
    destinationLabel: tripData.destination,
    noParkingPreferred: false,
    bestParking: paidGarage,
    parkingOptions: [paidGarage],
    parkingTotal: 12,
    parkingMinutes: 44,
    bestRideOption: null,
    ridePrice: null,
    rideDuration: null,
    bestTransitOption: null,
    transitCost: null,
    transitDuration: null,
    transitCostDisplay: null,
    hasReliableTransit: false,
    bestParkRideAccess: null,
    parkRideCost: null,
    parkRideDuration: null,
    parkRideReliable: false,
    streetMeterParking: streetMeter,
    driveMinutes: 31,
  });
}

describe('Smart Recommendation street/meter card fixes', () => {
  test('1. long parking outlook text is not placed in the compact cost tile', () => {
    const ranked = rankDowntownTrip(uncertainStreetMeter);
    const streetMode = ranked.modes.find((mode) => mode.key === 'street-meter');

    expect(streetMode).toBeTruthy();
    // The compact cost-tile label must be short and scannable, never the paragraph.
    expect(streetMode?.costNote).toBe('Verify signs');
    expect(streetMode?.costNote).not.toBe(LONG_OUTLOOK);
    expect((streetMode?.costNote ?? '').length).toBeLessThanOrEqual(24);
    // The long explanation is preserved for Details/evidence instead.
    expect(streetMode?.detailNote).toBe(LONG_OUTLOOK);
  });

  test('2. uncertain street/meter $0 does not generate a "cheapest around $0" quick read', () => {
    const ranked = rankDowntownTrip(uncertainStreetMeter);

    expect(ranked.cheapestMode?.key).toBe('street-meter');
    expect(ranked.cheapestStreetMeterUncertain).toBe(true);
    expect(ranked.cheapestReliableAlternative).toMatchObject({
      key: 'parking',
      label: 'Paid garage/lot',
      cost: 12,
    });

    const selected = ranked.modes.find((mode) => mode.key === ranked.recommendationMode);
    const message = buildPointAbQuickReadMessage({
      parkingHidden: false,
      sort: 'easiest',
      selected: selected ? { key: selected.key, label: selected.label } : null,
      cheapest: ranked.cheapestMode,
      fastest: ranked.fastestMode,
      cheapestUncertainStreetMeter: ranked.cheapestStreetMeterUncertain,
      reliableAlternative: ranked.cheapestReliableAlternative,
      formatMinutes,
    });

    expect(message).not.toContain('cheapest around $0');
    expect(message).not.toMatch(/Street \/ meter parking is cheapest/);
    expect(message).toContain('Cheapest reliable option appears to be Paid garage/lot around $12');
    expect(message).toContain('may be cheaper if legal and available');
  });

  test('2b. uncertain street/meter hedges to verification when no reliable alternative exists', () => {
    const message = buildPointAbQuickReadMessage({
      parkingHidden: false,
      cheapest: { key: 'street-meter', label: 'Street / meter parking', cost: 0 },
      fastest: { key: 'rideshare', label: 'Rideshare', minutes: 30 },
      cheapestUncertainStreetMeter: true,
      reliableAlternative: null,
      formatMinutes,
    });

    expect(message).not.toContain('$0');
    expect(message).toContain(
      'Street / meter may be cheapest, but signs and paid-hour rules need verification.',
    );
  });

  test('2c. confident, non-street cheapest copy is unchanged', () => {
    const message = buildPointAbQuickReadMessage({
      parkingHidden: false,
      cheapest: { key: 'parking', label: 'Destination parking', cost: 12 },
      fastest: { key: 'rideshare', label: 'Rideshare', minutes: 24 },
      formatMinutes,
    });

    expect(message).toBe('Destination parking is cheapest around $12. Rideshare is fastest around 24 min.');
  });

  test('3. street/meter still appears as a comparison option', () => {
    const ranked = rankDowntownTrip(uncertainStreetMeter);
    const streetMode = ranked.modes.find((mode) => mode.key === 'street-meter');

    expect(streetMode).toBeTruthy();
    expect(streetMode?.label).toBe('Street / meter parking');
    // Street/meter is presented as a verify-rules option, not a confident winner.
    expect(streetMode?.status).toBe('verify_rules');
    expect(ranked.recommendationMode).not.toBe('street-meter');
  });

  test('4. airport parking behavior is unchanged (street/meter stays out of airport trips)', () => {
    const airportOption = buildStreetMeterParkingOption({
      destination: 'Seattle-Tacoma International Airport',
      arrivalDate: '2026-06-08',
      arrivalTime: '20:30',
      durationMinutes: 120,
      driveMinutes: 25,
      isAirportTrip: true,
    });
    expect(airportOption).toBeNull();

    // An airport-style ranking call (no street/meter presentation) has no street-meter
    // mode and never sets the street/meter uncertainty flags.
    const ranked = rankDowntownTrip(null);
    expect(ranked.modes.some((mode) => mode.key === 'street-meter')).toBe(false);
    expect(ranked.cheapestStreetMeterUncertain).toBe(false);
    expect(ranked.cheapestReliableAlternative).toBeNull();
  });

  test('5. event/stadium street/meter behavior is unchanged', () => {
    const ranked = rankPointAbModes({
      tripData: {
        ...tripData,
        destination: 'Lumen Field, Seattle, WA',
        parkingDuration: 180,
      },
      sort: 'easiest',
      destinationLabel: 'Lumen Field, Seattle, WA',
      noParkingPreferred: false,
      bestParking: {
        ...paidGarage,
        id: 'lumen-event-lot',
        name: 'Lumen Field Event Parking',
        price: 42,
        bookingProvider: 'ParkWhiz',
        sourceName: 'ParkWhiz',
      },
      parkingOptions: [
        {
          ...paidGarage,
          id: 'lumen-event-lot',
          name: 'Lumen Field Event Parking',
          price: 42,
          bookingProvider: 'ParkWhiz',
          sourceName: 'ParkWhiz',
        },
      ],
      parkingTotal: 42,
      parkingMinutes: 38,
      bestRideOption: null,
      ridePrice: null,
      rideDuration: null,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      streetMeterParking: { ...uncertainStreetMeter, confidence: 'Low' },
      driveMinutes: 28,
    });

    const streetMode = ranked.modes.find((mode) => mode.key === 'street-meter');
    expect(streetMode?.label).toBe('Fallback: street / meter');
    expect(streetMode?.costNote).toBe('Risky during events');
    // Event street/meter keeps its short event warning and no long outlook detail.
    expect(streetMode?.detailNote).toBeUndefined();
    expect(streetMode?.status).not.toBe('best_pick');
    expect(ranked.recommendationMode).not.toBe('street-meter');
  });
});
