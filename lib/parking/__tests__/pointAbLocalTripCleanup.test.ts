import { buildParkingOutlook } from '../parkingOutlook';
import { buildParkingOptionsHints } from '../googleParkingOptionsSignals';
import { buildStreetMeterParkingOption } from '../streetMeterParking';
import { estimateSeattleStreetMeterPricing } from '../meterPricing';
import { rankPointAbModes } from '../pointAbRanking';
import { getSeasonalClimateGuidance } from '../../weather/seasonalClimate';
import type { ParkingOption, RideshareOption, TransitOption, TripData } from '../../types';

const tripData = {
  type: 'general-trip' as const,
  origin: 'Bellevue, WA',
  destination: 'Pike Place Market, Seattle, WA',
  arrivalDate: '2026-06-02',
  arrivalTime: '10:00',
  parkingDuration: 120,
  transportAvailability: 'all' as const,
};

const parkingOption = {
  id: 'garage-1',
  name: 'Pike Place Market Parking Garage',
  type: 'off-airport' as const,
  price: 24,
  priceUnit: 'total' as const,
  distance: 0.1,
  availability: 80,
  trustStatus: 'estimated' as const,
  sourceName: 'Test',
  lastUpdated: '2026-06-01T00:00:00Z',
  assumptions: [],
  transferToTerminalMinutes: 5,
  googleParkingOptions: { paidGarageParking: true },
} satisfies ParkingOption;

describe('Point A→B local trip cleanup', () => {
  test('Pike Place without freeParkingLot does not show free customer outlook', () => {
    const outlook = buildParkingOutlook({
      destination: 'Pike Place Market, Seattle, WA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
      googleParkingOptions: { freeStreetParking: true },
    });

    expect(outlook.status).not.toBe('free_customer_likely');
    expect(outlook.status).toBe('paid_parking_likely');
  });

  test('Pike Place freeParkingLot signal does not become free customer in dense urban hints', () => {
    const hints = buildParkingOptionsHints(
      { freeParkingLot: true },
      { airportTrip: false, destination: 'Pike Place Market, Seattle, WA' },
    );

    expect(hints.hints.some((hint) => hint.label === 'Free customer parking likely')).toBe(false);
    expect(hints.hints.some((hint) => /Paid garage or lot parking likely/i.test(hint.label))).toBe(true);
  });

  test('Seattle weekday exposes street / meter parking option', () => {
    const option = buildStreetMeterParkingOption({
      destination: 'Pike Place Market, Seattle, WA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
      driveMinutes: 22,
    });

    expect(option?.applicable).toBe(true);
    expect(option?.label).toBe('Street / meter parking');
    expect(option?.timeDisplay).toMatch(/min/);
    expect(option?.verifyRequired).toBe(true);
  });

  test('Seattle Sunday street parking is free in meter pricing', () => {
    const estimate = estimateSeattleStreetMeterPricing({
      destination: 'Capitol Hill, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      durationMinutes: 120,
    });

    expect(estimate?.costDisplay).toBe('Free');
  });

  test('Seattle holiday street parking is free in meter pricing', () => {
    const estimate = estimateSeattleStreetMeterPricing({
      destination: 'Downtown Seattle, WA',
      arrivalDate: '2026-07-04',
      arrivalTime: '11:00',
      durationMinutes: 120,
    });

    expect(estimate?.costDisplay).toBe('Free');
  });

  test('weekday downtown meter estimate is separate from garage pricing kind', () => {
    const estimate = estimateSeattleStreetMeterPricing({
      destination: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
    });

    expect(estimate?.pricingKind).toBe('street_meter');
    expect(estimate?.costDisplay).not.toBe('Check provider');
  });

  test('seasonal guidance is fallback-only shape', () => {
    const guidance = getSeasonalClimateGuidance({
      airportCode: 'SEA',
      targetDate: '2026-11-15',
    });

    expect(guidance?.historicalLabel).toBe('Historical / seasonal');
    expect(guidance?.disclaimer).toContain('Seasonal guidance only');
  });

  test('Mapbox-backed drive time is treated as available routing', () => {
    const mapboxEstimate = {
      route: 'custom',
      duration: 24,
      congestion: 'low' as const,
      trustStatus: 'live' as const,
      routeUnavailable: false,
      sourceName: 'Mapbox Directions',
      lastUpdated: new Date().toISOString(),
      assumptions: [],
    };

    expect(mapboxEstimate.routeUnavailable).not.toBe(true);
    expect(mapboxEstimate.sourceName).toBe('Mapbox Directions');
  });

  test('transit cheapest is not best overall wording', () => {
    const ranked = rankPointAbModes({
      tripData,
      sort: 'easiest',
      destinationLabel: tripData.destination,
      noParkingPreferred: false,
      bestParking: parkingOption,
      parkingTotal: 24,
      parkingMinutes: 35,
      bestRideOption: {
        id: 'uber',
        name: 'UberX',
        price: 42,
        duration: 28,
        availability: 80,
        trustStatus: 'estimated',
        sourceName: 'Test',
        lastUpdated: '2026-06-01T00:00:00Z',
        assumptions: [],
      } satisfies RideshareOption,
      ridePrice: 42,
      rideDuration: 28,
      bestTransitOption: {
        id: 'transit',
        name: 'Transit',
        price: 3.25,
        duration: 63,
        frequency: 12,
        availability: 80,
        trustStatus: 'verified-source',
        sourceName: 'Test',
        lastUpdated: '2026-06-01T00:00:00Z',
        assumptions: [],
      } satisfies TransitOption,
      transitCost: 3.25,
      transitDuration: 63,
      transitCostDisplay: '$3.25 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      streetMeterParking: buildStreetMeterParkingOption({
        destination: tripData.destination,
        arrivalDate: tripData.arrivalDate,
        arrivalTime: tripData.arrivalTime,
        durationMinutes: 120,
        driveMinutes: 22,
      }),
      driveMinutes: 22,
    });

    expect(ranked.recommendationMode).not.toBe('transit');
    expect(ranked.cheapestMode?.key).toBe('transit');
    expect(ranked.cheapestVsBestNote).toMatch(/Transit is cheapest, but takes around 1h 3m/i);
  });
});
