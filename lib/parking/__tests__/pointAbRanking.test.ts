import type { ParkingOption } from '../../types';
import {
  computePointAbPreferenceBoost,
  formatPointAbRideshareCost,
  preferenceBoostIsCapped,
  rankPointAbModes,
  scorePointAbMode,
} from '../pointAbRanking';
import { buildParkingOptionsHints } from '../googleParkingOptionsSignals';
import { evaluateLocalStreetParkingRules } from '../localParkingRules';
import {
  recommendationStatusLabel,
  mapComparisonVerdictToStatus,
} from '../../recommendationStatusBadge';
import { buildPointAbModeActions } from '../pointAbModeActions';

const tripData = {
  type: 'general-trip' as const,
  origin: 'Bellevue, WA',
  destination: 'Downtown Seattle, WA',
  arrivalDate: '2026-06-07',
  arrivalTime: '11:00',
  parkingDuration: 48 * 60,
  transportAvailability: 'all' as const,
};

const parkingOption = {
  id: 'lot-1',
  name: 'Destination Garage',
  type: 'off-airport' as const,
  price: 7,
  priceUnit: 'total' as const,
  distance: 0.2,
  availability: 80,
  trustStatus: 'estimated' as const,
  sourceName: 'Test',
  lastUpdated: '2026-06-01T00:00:00Z',
  assumptions: [],
  transferToTerminalMinutes: 5,
  googleParkingOptions: {
    freeParkingLot: true,
  },
} satisfies ParkingOption;

const expensiveRide = {
  id: 'uber-x',
  name: 'UberX',
  price: 112,
  duration: 38,
  availability: 80,
  trustStatus: 'estimated' as const,
  sourceName: 'Test',
  lastUpdated: '2026-06-01T00:00:00Z',
  assumptions: [],
};

const cheapTransit = {
  id: 'transit',
  name: 'Transit',
  price: 3.25,
  duration: 52,
  frequency: 12,
  availability: 80,
  trustStatus: 'verified-source' as const,
  sourceName: 'Test',
  lastUpdated: '2026-06-01T00:00:00Z',
  assumptions: [],
};

describe('pointAbRanking', () => {
  test('Uber $112 does not beat $7 parking when no-parking preference conflicts with extreme cost gap', () => {
    const ranked = rankPointAbModes({
      tripData,
      sort: 'easiest',
      destinationLabel: tripData.destination,
      noParkingPreferred: true,
      bestParking: parkingOption,
      parkingTotal: 7,
      parkingMinutes: 48,
      bestRideOption: expensiveRide,
      ridePrice: 112,
      rideDuration: 38,
      bestTransitOption: cheapTransit,
      transitCost: 3.25,
      transitDuration: 52,
      transitCostDisplay: '$3.25 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
    });

    expect(ranked.recommendationMode).toBe('parking');
    expect(ranked.objectiveBestMode).toBe('parking');
    expect(preferenceBoostIsCapped({ parkingCost: 7, rideshareCost: 112 })).toBe(true);
    expect(
      ranked.modes.find((mode) => mode.key === 'parking')?.hiddenByPreference,
    ).toBe(true);
    expect(
      ranked.modes.find((mode) => mode.key === 'rideshare')?.status,
    ).not.toBe('best_pick');
  });

  test('preference boost still helps rideshare when costs are comparable', () => {
    const rideshareBoost = computePointAbPreferenceBoost({
      mode: 'rideshare',
      noParkingPreferred: true,
      parkingCost: 28,
      rideshareCost: 34,
    });
    const cappedBoost = computePointAbPreferenceBoost({
      mode: 'rideshare',
      noParkingPreferred: true,
      parkingCost: 7,
      rideshareCost: 112,
    });

    expect(rideshareBoost).toBeGreaterThan(cappedBoost);
    expect(
      scorePointAbMode({
        mode: {
          key: 'rideshare',
          label: 'Rideshare',
          cost: 34,
          minutes: 30,
          reliable: true,
          confidence: 'Medium',
        },
        sort: 'easiest',
        noParkingPreferred: true,
        parkingCost: 28,
        rideshareCost: 34,
      }),
    ).toBeGreaterThan(
      scorePointAbMode({
        mode: {
          key: 'parking',
          label: 'Destination parking',
          cost: 28,
          minutes: 40,
          reliable: true,
          confidence: 'Medium',
        },
        sort: 'easiest',
        noParkingPreferred: true,
        parkingCost: 28,
        rideshareCost: 34,
      }),
    );
  });

  test('Google ParkingOptions free customer lot signals improve parking presentation', () => {
    const suburbanTrip = {
      ...tripData,
      destination: 'Costco Wholesale, Issaquah, WA',
    };
    const suburbanParking = {
      ...parkingOption,
      googleParkingOptions: { freeParkingLot: true },
    };

    const ranked = rankPointAbModes({
      tripData: suburbanTrip,
      sort: 'easiest',
      destinationLabel: suburbanTrip.destination,
      noParkingPreferred: false,
      bestParking: suburbanParking,
      parkingTotal: 0,
      parkingMinutes: 35,
      bestRideOption: expensiveRide,
      ridePrice: 112,
      rideDuration: 38,
      bestTransitOption: cheapTransit,
      transitCost: 3.25,
      transitDuration: 52,
      transitCostDisplay: '$3.25 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
    });

    expect(ranked.modes[0]?.costNote).toContain('Free customer parking likely');
    expect(
      buildParkingOptionsHints(suburbanParking.googleParkingOptions, {
        airportTrip: false,
        destination: suburbanTrip.destination,
      }).hints,
    ).toHaveLength(1);
  });

  test('Seattle Sunday street parking may be free', () => {
    const signal = evaluateLocalStreetParkingRules({
      destination: 'Capitol Hill, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      durationMinutes: 120,
      isAirportTrip: false,
    });

    expect(signal.freeLikely).toBe(true);
    expect(signal.headline).toBe('Likely free street parking');
  });

  test('airport trips exclude street parking through local rules penalty', () => {
    const signal = evaluateLocalStreetParkingRules({
      destination: 'SEA Airport',
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      durationMinutes: 240,
      isAirportTrip: true,
    });

    expect(signal.penalty).toBeGreaterThan(1000);
  });

  test('hidden badge maps consistently through RecommendationStatusBadge helpers', () => {
    expect(
      mapComparisonVerdictToStatus({ verdict: 'Hidden by preference' }),
    ).toBe('hidden_by_preference');
    expect(recommendationStatusLabel('hidden_by_preference')).toBe('Hidden');
  });

  test('Point A→B cards expose at most three actions', () => {
    const actions = buildPointAbModeActions({
      mode: 'parking',
      routeToParkingUrl: 'https://maps.example/route',
      parkingToDestinationUrl: 'https://maps.example/walk',
      onDetails: () => undefined,
    });

    expect(actions).toHaveLength(3);
    expect(actions.map((action) => action.label)).toEqual([
      'Route to parking',
      'Parking to destination',
      'Details',
    ]);
  });

  test('high rideshare fares show a convenience/high-cost note', () => {
    expect(formatPointAbRideshareCost(112).note).toBe('High cost');
    expect(formatPointAbRideshareCost(52).note).toBe('Convenience option');
    expect(formatPointAbRideshareCost(null)).toEqual({
      primary: 'Open app for live price',
      note: 'Fare estimate unavailable',
    });
  });

  test('route-degraded city garage can still be the recommended destination parking option', () => {
    const routeDegradedGarage = {
      ...parkingOption,
      name: 'Pike Place Market Parking Garage',
      routeUnavailable: true,
      routeUnavailableReason: 'Route budget exceeded; open map directions to confirm drive time.',
    } satisfies ParkingOption;

    const ranked = rankPointAbModes({
      tripData,
      sort: 'easiest',
      destinationLabel: 'Pike Place Market',
      noParkingPreferred: false,
      bestParking: routeDegradedGarage,
      parkingTotal: 7,
      parkingMinutes: null,
      bestRideOption: expensiveRide,
      ridePrice: 112,
      rideDuration: 38,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 31,
    });

    const parkingMode = ranked.modes.find((mode) => mode.key === 'parking');

    expect(ranked.recommendationMode).toBe('parking');
    expect(ranked.recommendedTitle).toBe('Park at Pike Place Market Parking Garage');
    expect(parkingMode?.time).toBe('31 min');
    expect(parkingMode?.unavailable).toBe(false);
    expect(parkingMode?.status).toBe('best_pick');
    expect(parkingMode?.cons).toContain('Backup route estimate; open directions to confirm');
  });

  test('street meter rules do not suppress destination garage mode', () => {
    const ranked = rankPointAbModes({
      tripData,
      sort: 'cheapest',
      destinationLabel: 'Pike Place Market',
      noParkingPreferred: false,
      bestParking: parkingOption,
      parkingTotal: 18,
      parkingMinutes: 35,
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
      streetMeterParking: {
        applicable: true,
        label: 'Street / meter parking',
        name: 'Street / meter parking',
        cost: 0,
        costDisplay: 'Likely free street parking',
        costNote: 'Seattle street parking is generally free on Sundays.',
        durationMinutes: 35,
        timeDisplay: '35 min',
        confidence: 'Medium',
        pros: ['Can be free off-hours'],
        cons: ['Verify posted signs'],
        warnings: [],
        verifyRequired: true,
        sourceLabel: 'Seattle payment hours estimate',
      },
      driveMinutes: 31,
    });

    const garageMode = ranked.modes.find((mode) => mode.key === 'parking');
    const streetMode = ranked.modes.find((mode) => mode.key === 'street-meter');

    expect(garageMode).toMatchObject({
      name: 'Destination Garage',
      unavailable: false,
    });
    expect(streetMode).toBeTruthy();
  });

  test('RecommendationStatusBadge labels stay short and consistent', () => {
    expect(recommendationStatusLabel('best_pick')).toBe('Best pick');
    expect(recommendationStatusLabel('budget_option')).toBe('Budget');
    expect(recommendationStatusLabel('verify_rules')).toBe('Verify');
    expect(recommendationStatusLabel('route_needed')).toBe('Route needed');
  });

  test('Monroe 4-hour street parking rule penalizes longer stays', () => {
    const signal = evaluateLocalStreetParkingRules({
      destination: 'Downtown Monroe, WA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 6 * 60,
      isAirportTrip: false,
    });

    expect(signal.penalty).toBeGreaterThan(20);
    expect(signal.headline).toContain('Monroe');
  });
});
