import type { OptionScoreBreakdown, ParkingOption } from '../../types';
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
import {
  selectBestParkAndRideForPointAb,
  toPointAbParkRidePresentation,
} from '../parkAndRideSelection';
import type { PointAbParkRidePresentation } from '../parkAndRideTypes';

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
  originToParkingMinutes: 35,
  routeToParkingMinutes: 35,
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

  test('Google ParkingOptions free customer lot signals become a separate verify candidate', () => {
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
      parkingOptions: [suburbanParking],
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

    const customerMode = ranked.modes.find((mode) => mode.key === 'destination-customer');

    expect(customerMode).toMatchObject({
      label: 'Customer parking',
      cost: 'Free? Verify',
      status: 'verify_rules',
    });
    expect(
      buildParkingOptionsHints(suburbanParking.googleParkingOptions, {
        airportTrip: false,
        destination: suburbanTrip.destination,
      }).hints,
    ).toHaveLength(1);
  });

  test('restaurant outside dense downtown with paid lot still gets customer/free verify candidate', () => {
    const restaurantTrip = {
      ...tripData,
      destination: 'Neighborhood Cafe, Boise, ID',
      destinationKind: 'restaurant' as const,
      parkingDuration: 120,
    };
    const paidLot = {
      ...parkingOption,
      id: 'boise-paid-garage',
      name: 'Main Street Garage',
      price: 18,
      parkingCategory: 'garage_paid' as const,
      googleParkingOptions: { paidGarageParking: true },
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
      originToParkingMinutes: 24,
      routeToParkingMinutes: 24,
    } satisfies ParkingOption;

    const ranked = rankPointAbModes({
      tripData: restaurantTrip,
      sort: 'easiest',
      destinationLabel: restaurantTrip.destination,
      noParkingPreferred: false,
      bestParking: paidLot,
      parkingOptions: [paidLot],
      parkingTotal: 18,
      parkingMinutes: 31,
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
      driveMinutes: 24,
    });

    const customerMode = ranked.modes.find((mode) => mode.key === 'destination-customer');
    const paidMode = ranked.modes.find((mode) => mode.key === 'parking');

    expect(ranked.recommendationMode).toBe('destination-customer');
    expect(ranked.fastestMode?.key).toBe('destination-customer');
    expect(customerMode).toMatchObject({
      label: 'Customer parking',
      cost: 'Free? Verify',
      status: 'verify_rules',
    });
    expect(customerMode?.time).toBe('29 min');
    expect(paidMode).toMatchObject({
      label: 'Paid garage/lot',
      costNote: 'Bookable paid backup',
    });
    expect(paidMode?.time).toBe('37 min');
    expect(paidMode?.status).not.toBe('best_pick');
  });

  test('dense downtown with many paid lots can keep paid garage as best', () => {
    const downtownTrip = {
      ...tripData,
      destination: 'Downtown Chicago, IL',
      destinationKind: 'downtown' as const,
      parkingDuration: 120,
    };
    const paidLots = [0, 1, 2].map((index) => ({
      ...parkingOption,
      id: `downtown-paid-${index}`,
      name: `Downtown Garage ${index + 1}`,
      price: 18 + index * 4,
      parkingCategory: 'garage_paid' as const,
      googleParkingOptions: { paidGarageParking: true },
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
      transferToTerminalMinutes: 5 + index,
      originToParkingMinutes: 12,
      routeToParkingMinutes: 12,
    })) satisfies ParkingOption[];

    const ranked = rankPointAbModes({
      tripData: downtownTrip,
      sort: 'easiest',
      destinationLabel: downtownTrip.destination,
      noParkingPreferred: false,
      bestParking: paidLots[0],
      parkingOptions: paidLots,
      parkingTotal: 18,
      parkingMinutes: 25,
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
      driveMinutes: 20,
    });

    const paidMode = ranked.modes.find((mode) => mode.key === 'parking');

    expect(ranked.modes.some((mode) => mode.key === 'destination-customer')).toBe(false);
    expect(ranked.recommendationMode).toBe('parking');
    expect(paidMode).toMatchObject({
      label: 'Paid garage/lot',
      costNote: 'Best confirmed paid option',
      status: 'best_pick',
    });
  });

  test('stadium event warning outranks generic free parking assumption', () => {
    const stadiumTrip = {
      ...tripData,
      destination: 'Riverfront Stadium, Phoenix, AZ',
      destinationKind: 'stadium' as const,
      parkingDuration: 180,
    };
    const eventLot = {
      ...parkingOption,
      id: 'stadium-event-lot',
      name: 'Event Garage',
      price: 32,
      parkingCategory: 'garage_paid' as const,
      googleParkingOptions: { paidGarageParking: true },
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
      originToParkingMinutes: 26,
      routeToParkingMinutes: 26,
    } satisfies ParkingOption;

    const ranked = rankPointAbModes({
      tripData: stadiumTrip,
      sort: 'easiest',
      destinationLabel: stadiumTrip.destination,
      noParkingPreferred: false,
      bestParking: eventLot,
      parkingOptions: [eventLot],
      parkingTotal: 32,
      parkingMinutes: 34,
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
      driveMinutes: 26,
    });

    const paidMode = ranked.modes.find((mode) => mode.key === 'parking');

    expect(ranked.modes.some((mode) => mode.key === 'destination-customer')).toBe(false);
    expect(paidMode?.costNote).toBe('Best confirmed event parking');
    expect(paidMode?.pros.join(' ')).toMatch(/Event parking likely/i);
  });

  test('Lumen Field Seahawks trip prefers event parking over street meter hero', () => {
    const lumenTrip = {
      ...tripData,
      origin: 'Bellevue, WA',
      destination: 'Lumen Field, Seattle, WA',
      destinationKind: 'stadium' as const,
      parkingDuration: 180,
    };
    const eventLot = {
      ...parkingOption,
      id: 'lumen-event-lot',
      name: 'Lumen Field Event Parking',
      price: 42,
      parkingCategory: 'garage_paid' as const,
      googleParkingOptions: { paidGarageParking: true },
      bookingProvider: 'ParkWhiz',
      providerSource: 'parkwhiz',
      sourceName: 'ParkWhiz',
      originToParkingMinutes: 28,
      routeToParkingMinutes: 28,
    } satisfies ParkingOption;

    const ranked = rankPointAbModes({
      tripData: lumenTrip,
      sort: 'easiest',
      destinationLabel: lumenTrip.destination,
      noParkingPreferred: false,
      bestParking: eventLot,
      parkingOptions: [eventLot],
      parkingTotal: 42,
      parkingMinutes: 38,
      bestRideOption: expensiveRide,
      ridePrice: 55,
      rideDuration: 32,
      bestTransitOption: cheapTransit,
      transitCost: 3.25,
      transitDuration: 48,
      transitCostDisplay: '$3.25 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      streetMeterParking: {
        applicable: true,
        label: 'Fallback: street / meter',
        name: 'Risky street / meter fallback',
        cost: 0,
        costDisplay: 'Likely free street parking',
        costNote: 'Risky during events',
        durationMinutes: 30,
        timeDisplay: '30 min',
        confidence: 'Low',
        pros: [],
        cons: ['Risky during events. Check posted signs, event-zone rules, time limits, and towing restrictions.'],
        warnings: [],
        verifyRequired: true,
        sourceLabel: 'Seattle payment hours estimate',
      },
      driveMinutes: 28,
    });

    expect(ranked.modes.some((mode) => mode.key === 'destination-customer')).toBe(false);
    expect(ranked.recommendationMode).toBe('parking');
    expect(ranked.recommendedTitle).toBe('Book event parking first');
    expect(ranked.recommendationMode).not.toBe('street-meter');
    const streetMode = ranked.modes.find((mode) => mode.key === 'street-meter');
    expect(streetMode?.label).toBe('Fallback: street / meter');
    expect(streetMode?.status).not.toBe('best_pick');
  });

  test('Lumen Field transit can win when parking is unavailable', () => {
    const lumenTrip = {
      ...tripData,
      destination: 'Lumen Field, Seattle, WA',
      parkingDuration: 180,
    };

    const ranked = rankPointAbModes({
      tripData: lumenTrip,
      sort: 'easiest',
      destinationLabel: lumenTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: expensiveRide,
      ridePrice: 55,
      rideDuration: 32,
      bestTransitOption: cheapTransit,
      transitCost: 3.25,
      transitDuration: 48,
      transitCostDisplay: '$3.25 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 28,
    });

    expect(ranked.recommendationMode).toBe('transit');
    expect(ranked.recommendedTitle).toBe('Take transit to the game');
  });

  test('Lumen Field no-parking preference allows rideshare hero', () => {
    const lumenTrip = {
      ...tripData,
      destination: 'Lumen Field, Seattle, WA',
      parkingDuration: 180,
    };
    const eventLot = {
      ...parkingOption,
      id: 'lumen-event-lot',
      name: 'Lumen Field Event Parking',
      price: 42,
      parkingCategory: 'garage_paid' as const,
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
      originToParkingMinutes: 28,
      routeToParkingMinutes: 28,
    } satisfies ParkingOption;

    const ranked = rankPointAbModes({
      tripData: lumenTrip,
      sort: 'easiest',
      destinationLabel: lumenTrip.destination,
      noParkingPreferred: true,
      bestParking: eventLot,
      parkingOptions: [eventLot],
      parkingTotal: 42,
      parkingMinutes: 38,
      bestRideOption: expensiveRide,
      ridePrice: 28,
      rideDuration: 32,
      bestTransitOption: cheapTransit,
      transitCost: 3.25,
      transitDuration: 48,
      transitCostDisplay: '$3.25 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 28,
    });

    expect(ranked.displayRecommendationMode).toBe('rideshare');
    expect(ranked.recommendationMode).not.toBe('street-meter');
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

  test('no-parking mode excludes parking options from cheapest and fastest summaries', () => {
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

    expect(ranked.cheapestMode).toMatchObject({ key: 'transit', cost: 3.25 });
    expect(ranked.fastestMode).toMatchObject({ key: 'rideshare', minutes: 38 });
  });

  test('Point A→B customer parking actions omit verify-signs button styling', () => {
    const actions = buildPointAbModeActions({
      mode: 'destination-customer',
      routeToParkingUrl: 'https://maps.example/route',
      onDetails: () => undefined,
    });

    expect(actions).toHaveLength(2);
    expect(actions.map((action) => action.label)).toEqual([
      'Open directions',
      'Details',
    ]);
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

  test('route-degraded city garage stays visible but does not rank as fastest without fallback', () => {
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

    expect(ranked.recommendationMode).not.toBe('parking');
    expect(ranked.fastestMode?.key).not.toBe('parking');
    expect(parkingMode?.time).toBe('Check route');
    expect(parkingMode?.unavailable).toBe(false);
    expect(parkingMode?.status).toBe('route_needed');
    expect(parkingMode?.cons).toContain('Route timing unavailable');
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

  test('customer parking ranks fastest over paid garage for destination-adjacent trips', () => {
    const austinTrip = {
      ...tripData,
      origin: 'La Quinta Inn & Suites by Wyndham Austin Airport',
      destination: 'Franklin Barbecue, Austin TX',
      destinationKind: 'restaurant' as const,
      parkingDuration: 120,
    };
    const paidLot = {
      ...parkingOption,
      id: 'austin-paid-garage',
      name: 'East Austin Parking Garage',
      price: 15,
      parkingCategory: 'garage_paid' as const,
      googleParkingOptions: { paidGarageParking: true },
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
      transferToTerminalMinutes: 5,
      parkingBufferMinutes: 8,
      originToParkingMinutes: 18,
      routeToParkingMinutes: 18,
    } satisfies ParkingOption;

    const ranked = rankPointAbModes({
      tripData: austinTrip,
      sort: 'fastest',
      destinationLabel: austinTrip.destination,
      noParkingPreferred: false,
      bestParking: paidLot,
      parkingOptions: [paidLot],
      parkingTotal: 15,
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
      driveMinutes: 18,
    });

    const customerMode = ranked.modes.find((mode) => mode.key === 'destination-customer');
    const paidMode = ranked.modes.find((mode) => mode.key === 'parking');

    expect(ranked.fastestMode?.key).toBe('destination-customer');
    expect(customerMode?.time).toBe('23 min');
    expect(customerMode?.timeLabel).toBe('Total time');
    expect(paidMode?.time).toBe('31 min');
    expect(paidMode?.timeLabel).toBe('Total time');
    expect(paidMode?.costNote).toBe('Bookable paid backup');
  });

  test('Austin restaurant timing keeps customer parking near drive time and rideshare viable without live price', () => {
    const austinTrip = {
      ...tripData,
      origin: 'La Quinta Inn & Suites by Wyndham Austin Airport',
      destination: 'Franklin Barbecue, 900 E 11th St, Austin TX',
      destinationKind: 'restaurant' as const,
      parkingDuration: 120,
    };
    const paidLot = {
      ...parkingOption,
      id: 'east-austin-paid-garage',
      name: 'East Austin Paid Garage',
      price: 15,
      parkingCategory: 'garage_paid' as const,
      googleParkingOptions: { paidGarageParking: true },
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
      transferToTerminalMinutes: 5,
      parkingBufferMinutes: 8,
      originToParkingMinutes: 12,
      routeToParkingMinutes: 12,
    } satisfies ParkingOption;
    const appOnlyRide = {
      ...expensiveRide,
      price: 35,
      priceDisplay: 'check-live' as const,
      rideshareEstimateConfidence: 'unavailable' as const,
      priceNote: 'Open app for live price.',
      driveMinutes: 12,
      pickupWaitMinutes: 5,
      duration: 17,
      totalOptionMinutes: 17,
    };

    const ranked = rankPointAbModes({
      tripData: austinTrip,
      sort: 'fastest',
      destinationLabel: austinTrip.destination,
      noParkingPreferred: false,
      bestParking: paidLot,
      parkingOptions: [paidLot],
      parkingTotal: 15,
      parkingMinutes: 27,
      bestRideOption: appOnlyRide,
      ridePrice: null,
      rideDuration: 17,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 12,
    });

    const customerMode = ranked.modes.find((mode) => mode.key === 'destination-customer');
    const paidMode = ranked.modes.find((mode) => mode.key === 'parking');
    const rideMode = ranked.modes.find((mode) => mode.key === 'rideshare');

    expect(ranked.fastestMode).toMatchObject({
      key: 'destination-customer',
      minutes: 17,
    });
    expect(customerMode).toMatchObject({
      time: '17 min',
      timeLabel: 'Total time',
      unavailable: false,
    });
    expect(paidMode).toMatchObject({
      time: '27 min',
      timeLabel: 'Total time',
    });
    expect(rideMode).toMatchObject({
      cost: 'Open app for live price',
      costNote: 'Fare estimate unavailable',
      time: '17 min',
      timeLabel: 'Total time',
      unavailable: false,
    });
  });

  test('canonical fastest score controls best pick under fastest sort', () => {
    const scoreBreakdowns: OptionScoreBreakdown[] = [
      {
        optionId: 'transit',
        mode: 'transit',
        totalCostCents: 325,
        totalTimeMinutes: 74,
        confidenceScore: 82,
        frictionScore: 58,
        walkMinutes: null,
        waitMinutes: 8,
        driveMinutes: null,
        parkingBufferMinutes: null,
        sourceFreshnessScore: 82,
        easiestScore: 62,
        cheapestScore: 97,
        fastestScore: 26,
        bestOverallScore: 61,
        reasons: ['Low cost'],
        penalties: ['More walking and waiting'],
      },
      {
        optionId: 'uber',
        mode: 'rideshare',
        totalCostCents: null,
        totalTimeMinutes: 43,
        confidenceScore: 58,
        frictionScore: 25,
        walkMinutes: null,
        waitMinutes: 5,
        driveMinutes: 38,
        parkingBufferMinutes: null,
        sourceFreshnessScore: 42,
        easiestScore: 84,
        cheapestScore: -1000000,
        fastestScore: 57,
        bestOverallScore: 69,
        reasons: ['No parking required'],
        penalties: ['Open app for live price'],
      },
    ];

    const ranked = rankPointAbModes({
      tripData,
      sort: 'fastest',
      destinationLabel: 'Brighton Jones, Seattle, WA',
      noParkingPreferred: false,
      bestParking: null,
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: {
        ...expensiveRide,
        id: 'uber',
        priceDisplay: 'check-live' as const,
        rideshareEstimateConfidence: 'unavailable' as const,
        driveMinutes: 38,
        pickupWaitMinutes: 5,
        totalOptionMinutes: 43,
        duration: 43,
      },
      ridePrice: null,
      rideDuration: 43,
      bestTransitOption: cheapTransit,
      transitCost: 3.25,
      transitDuration: 74,
      transitCostDisplay: '$3.25',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      scoreBreakdowns,
      driveMinutes: 38,
    });

    expect(ranked.recommendationMode).toBe('rideshare');
    expect(ranked.fastestMode).toMatchObject({ key: 'rideshare', minutes: 43 });
    expect(ranked.cheapestMode).toMatchObject({ key: 'transit', cost: 3.25 });
    expect(ranked.modes.find((mode) => mode.key === 'rideshare')?.status).toBe('best_pick');
    expect(ranked.modes.find((mode) => mode.key === 'transit')?.status).toBe('budget_option');
  });

  test('paid garage with aggregate-only timing does not become fastest', () => {
    const restaurantTrip = {
      ...tripData,
      destination: 'Franklin Barbecue, 900 E 11th St, Austin TX',
      destinationKind: 'restaurant' as const,
      parkingDuration: 120,
    };
    const {
      originToParkingMinutes: _originToParkingMinutes,
      routeToParkingMinutes: _routeToParkingMinutes,
      ...parkingWithoutRouteTiming
    } = parkingOption;
    const aggregateOnlyLot = {
      ...parkingWithoutRouteTiming,
      id: 'aggregate-only-paid-garage',
      name: 'Aggregate Only Garage',
      price: 8,
      parkingCategory: 'garage_paid' as const,
      googleParkingOptions: { paidGarageParking: true },
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
    } satisfies ParkingOption;

    const ranked = rankPointAbModes({
      tripData: restaurantTrip,
      sort: 'fastest',
      destinationLabel: restaurantTrip.destination,
      noParkingPreferred: false,
      bestParking: aggregateOnlyLot,
      parkingOptions: [aggregateOnlyLot],
      parkingTotal: 8,
      parkingMinutes: 13,
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
      driveMinutes: 12,
    });

    const paidMode = ranked.modes.find((mode) => mode.key === 'parking');

    expect(ranked.fastestMode?.key).toBe('destination-customer');
    expect(ranked.recommendationMode).toBe('destination-customer');
    expect(paidMode?.status).toBe('route_needed');
    expect(paidMode?.timing?.driveMinutes).toBeNull();
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

  test('Monroe Dairy Queen with driving preference does not recommend Park & Ride when route timing is unavailable', () => {
    const monroeTrip = {
      type: 'general-trip' as const,
      origin: '13907 Chain Lake Rd, Monroe, WA 98272',
      destination: 'Dairy Queen Grill & Chill, Monroe, WA',
      destinationKind: 'restaurant' as const,
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      parkingDuration: 60,
      transportAvailability: 'all' as const,
      originLat: 47.847,
      originLng: -121.978,
      destinationLat: 47.855,
      destinationLng: -121.97,
    };

    const pointAbParkRideSelection = selectBestParkAndRideForPointAb({
      origin: monroeTrip.origin,
      originLat: monroeTrip.originLat,
      originLng: monroeTrip.originLng,
      destination: monroeTrip.destination,
      destinationLat: monroeTrip.destinationLat,
      destinationLng: monroeTrip.destinationLng,
      parkingDurationMinutes: 60,
      isAirportTrip: false,
      sort: 'easiest',
      parkingTotal: null,
    });
    const pointAbParkRide = toPointAbParkRidePresentation(pointAbParkRideSelection);

    const ranked = rankPointAbModes({
      tripData: monroeTrip,
      sort: 'easiest',
      destinationLabel: monroeTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: null,
      ridePrice: null,
      rideDuration: null,
      bestTransitOption: {
        id: 'transit',
        name: 'Community Transit',
        price: 3,
        duration: 42,
        frequency: 12,
        availability: 80,
        trustStatus: 'verified-source',
        sourceName: 'Test',
        lastUpdated: '2026-06-01T00:00:00Z',
        assumptions: [],
      },
      transitCost: 3,
      transitDuration: 42,
      transitCostDisplay: '$3 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      pointAbParkRide,
      parkRideCost: pointAbParkRide?.cost ?? null,
      parkRideDuration: pointAbParkRide?.durationMinutes ?? null,
      parkRideReliable: Boolean(pointAbParkRide?.reliable),
      driveMinutes: null,
    });

    const customerMode = ranked.modes.find((mode) => mode.key === 'destination-customer');
    const parkRideMode = ranked.modes.find((mode) => mode.key === 'park-ride');

    expect(customerMode).toBeTruthy();
    expect(ranked.recommendationMode).toBe('destination-customer');
    expect(ranked.displayRecommendationMode).toBe('destination-customer');
    expect(ranked.recommendedTitle).toMatch(/customer parking/i);
    expect(parkRideMode?.status).not.toBe('best_pick');
    expect(ranked.canonicalWinners.cheapestWinner?.key).toBe('destination-customer');
  });

  test('suburban restaurant with rideshare-only timing picks customer parking not rideshare', () => {
    // No coordinates, no driveMinutes — only rideshare has drive timing.
    // This is the core regression: rideshare.driveMinutes should be used as a
    // proxy so customer parking candidate gets real minutes instead of BIG=999999.
    const monroeTrip = {
      type: 'general-trip' as const,
      origin: 'Monroe WA',
      destination: 'Dairy Queen Monroe WA',
      destinationKind: 'restaurant' as const,
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      parkingDuration: 60,
      transportAvailability: 'all' as const,
    };
    const rideOption = {
      ...expensiveRide,
      price: 15,
      duration: 15,
      driveMinutes: 10,
      pickupWaitMinutes: 5,
      totalOptionMinutes: 15,
    };

    const ranked = rankPointAbModes({
      tripData: monroeTrip,
      sort: 'easiest',
      destinationLabel: monroeTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: rideOption,
      ridePrice: 15,
      rideDuration: 15,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: null,
    });

    expect(ranked.recommendationMode).toBe('destination-customer');
    expect(ranked.recommendedTitle).toMatch(/customer parking/i);
    const customerMode = ranked.modes.find((m) => m.key === 'destination-customer');
    expect(customerMode?.unavailable).toBe(false);
    expect(customerMode?.time).not.toBe('Drive + verify');
  });

  test('same suburban restaurant trip with no-parking preference allows rideshare to win', () => {
    const monroeTrip = {
      type: 'general-trip' as const,
      origin: 'Monroe WA',
      destination: 'Dairy Queen Monroe WA',
      destinationKind: 'restaurant' as const,
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      parkingDuration: 60,
      transportAvailability: 'all' as const,
    };
    const rideOption = {
      ...expensiveRide,
      price: 15,
      duration: 15,
      driveMinutes: 10,
      pickupWaitMinutes: 5,
      totalOptionMinutes: 15,
    };

    const ranked = rankPointAbModes({
      tripData: monroeTrip,
      sort: 'easiest',
      destinationLabel: monroeTrip.destination,
      noParkingPreferred: true,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: rideOption,
      ridePrice: 15,
      rideDuration: 15,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: null,
    });

    expect(ranked.displayRecommendationMode).toBe('rideshare');
    const customerMode = ranked.modes.find((m) => m.key === 'destination-customer');
    expect(customerMode?.hiddenByPreference).toBe(true);
  });

  test('dense downtown destination does not produce a customer parking candidate', () => {
    const downtownTrip = {
      type: 'general-trip' as const,
      origin: 'Redmond, WA',
      destination: 'Downtown Seattle Financial District',
      destinationKind: 'downtown' as const,
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      parkingDuration: 120,
      transportAvailability: 'all' as const,
    };

    const ranked = rankPointAbModes({
      tripData: downtownTrip,
      sort: 'easiest',
      destinationLabel: downtownTrip.destination,
      noParkingPreferred: false,
      bestParking: parkingOption,
      parkingOptions: [parkingOption],
      parkingTotal: 18,
      parkingMinutes: 30,
      bestRideOption: expensiveRide,
      ridePrice: 28,
      rideDuration: 25,
      bestTransitOption: cheapTransit,
      transitCost: 3.25,
      transitDuration: 45,
      transitCostDisplay: '$3.25',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 22,
    });

    expect(ranked.modes.some((m) => m.key === 'destination-customer')).toBe(false);
  });

  test('airport trip does not use customer parking hero logic', () => {
    const airportTrip = {
      type: 'one-way-departure' as const,
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport' as const,
      airportCode: 'SEA',
      departureDate: '2026-06-07',
      departureTime: '06:00',
      transportAvailability: 'car' as const,
    };

    const ranked = rankPointAbModes({
      tripData: airportTrip,
      sort: 'easiest',
      destinationLabel: airportTrip.destination,
      noParkingPreferred: false,
      bestParking: parkingOption,
      parkingOptions: [parkingOption],
      parkingTotal: 80,
      parkingMinutes: 55,
      bestRideOption: expensiveRide,
      ridePrice: 45,
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
      driveMinutes: 35,
    });

    expect(ranked.modes.some((m) => m.key === 'destination-customer')).toBe(false);
    expect(ranked.recommendationMode).not.toBe('destination-customer');
  });

  test('customer parking winner does not hide paid parking comparison section', () => {
    const restaurantTrip = {
      ...tripData,
      destination: 'Local Grill & Diner, Kirkland WA',
      destinationKind: 'restaurant' as const,
      parkingDuration: 90,
    };
    const paidLot = {
      ...parkingOption,
      id: 'kirkland-paid',
      name: 'Kirkland Parking Garage',
      price: 14,
      parkingCategory: 'garage_paid' as const,
      googleParkingOptions: { paidGarageParking: true },
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
      originToParkingMinutes: 20,
      routeToParkingMinutes: 20,
    } satisfies ParkingOption;

    const ranked = rankPointAbModes({
      tripData: restaurantTrip,
      sort: 'easiest',
      destinationLabel: restaurantTrip.destination,
      noParkingPreferred: false,
      bestParking: paidLot,
      parkingOptions: [paidLot],
      parkingTotal: 14,
      parkingMinutes: 28,
      bestRideOption: expensiveRide,
      ridePrice: 22,
      rideDuration: 18,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 14,
    });

    expect(ranked.recommendationMode).toBe('destination-customer');
    const paidMode = ranked.modes.find((m) => m.key === 'parking');
    expect(paidMode).toBeTruthy();
    expect(paidMode?.hiddenByPreference).toBe(false);
    expect(paidMode?.unavailable).toBe(false);
    expect(paidMode?.costNote).toBe('Bookable paid backup');
  });

  test('suburban gym destination gets customer parking candidate', () => {
    const gymTrip = {
      type: 'general-trip' as const,
      origin: 'Bothell, WA',
      destination: 'Planet Fitness, Bothell WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '07:00',
      parkingDuration: 90,
      transportAvailability: 'all' as const,
    };

    const ranked = rankPointAbModes({
      tripData: gymTrip,
      sort: 'easiest',
      destinationLabel: gymTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: {
        ...expensiveRide,
        price: 12,
        duration: 12,
        driveMinutes: 8,
        pickupWaitMinutes: 4,
        totalOptionMinutes: 12,
      },
      ridePrice: 12,
      rideDuration: 12,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: null,
    });

    const customerMode = ranked.modes.find((m) => m.key === 'destination-customer');
    expect(customerMode).toBeTruthy();
    expect(ranked.recommendationMode).toBe('destination-customer');
    expect(customerMode?.name).toMatch(/on-site parking/i);
  });

  test('Fred Meyer suburban retail with 3 paid nearby lots still builds customer parking candidate and wins hero', () => {
    // Scenario: aggregator returns 3 ParkWhiz paid lots near Fred Meyer (manyPaidLotsNearby=true).
    // Parking outlook correctly says "Free customer parking likely" via destination type inference.
    // The hero must not say "Take UberX" — customer parking should win.
    const fredMeyerTrip = {
      type: 'general-trip' as const,
      origin: 'Monroe WA',
      destination: 'Fred Meyer Monroe WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '10:00',
      parkingDuration: 60,
      transportAvailability: 'all' as const,
    };

    // 3 paid ParkWhiz lots found near Fred Meyer — triggers manyPaidLotsNearby=true
    const paidLotBase = {
      ...parkingOption,
      price: 10,
      parkingCategory: 'garage_paid' as const,
      googleParkingOptions: { paidGarageParking: true },
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
    } satisfies ParkingOption;
    const paidLots = [
      { ...paidLotBase, id: 'pw-1', name: 'ParkWhiz Lot 1', originToParkingMinutes: 8, routeToParkingMinutes: 8 },
      { ...paidLotBase, id: 'pw-2', name: 'ParkWhiz Lot 2', originToParkingMinutes: 9, routeToParkingMinutes: 9 },
      { ...paidLotBase, id: 'pw-3', name: 'ParkWhiz Lot 3', originToParkingMinutes: 10, routeToParkingMinutes: 10 },
    ] satisfies ParkingOption[];

    const rideOption = {
      ...expensiveRide,
      price: 18,
      duration: 9,
      driveMinutes: 4,
      pickupWaitMinutes: 5,
      totalOptionMinutes: 9,
    };

    const ranked = rankPointAbModes({
      tripData: fredMeyerTrip,
      sort: 'easiest',
      destinationLabel: fredMeyerTrip.destination,
      noParkingPreferred: false,
      bestParking: paidLots[0],
      parkingOptions: paidLots,
      parkingTotal: 10,
      parkingMinutes: 16,
      bestRideOption: rideOption,
      ridePrice: 18,
      rideDuration: 9,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: null,
    });

    const customerMode = ranked.modes.find((m) => m.key === 'destination-customer');
    const paidMode = ranked.modes.find((m) => m.key === 'parking');

    // 1. Customer parking candidate must be visible
    expect(customerMode).toBeTruthy();
    // 2. Hero should be customer parking, not rideshare
    expect(ranked.recommendationMode).toBe('destination-customer');
    expect(ranked.recommendedTitle).toMatch(/customer parking/i);
    // 3. Paid garage/lot remains visible as backup (not hidden)
    expect(paidMode).toBeTruthy();
    expect(paidMode?.hiddenByPreference).toBe(false);
    expect(paidMode?.unavailable).toBe(false);
    expect(paidMode?.costNote).toBe('Bookable paid backup');
    // 4. Customer parking has usable timing (from rideshare drive proxy, not BIG=999999)
    expect(customerMode?.time).not.toBe('Drive + verify');
  });

  test('static Park & Ride cannot win easiest when customer parking is likely', () => {
    const fredMeyerTrip = {
      type: 'general-trip' as const,
      origin: 'Monroe WA',
      destination: 'Fred Meyer Monroe WA',
      destinationKind: 'general' as const,
      arrivalDate: '2026-06-07',
      arrivalTime: '10:00',
      parkingDuration: 60,
      transportAvailability: 'all' as const,
    };
    const staticParkRide = {
      lotName: 'Test Park & Ride',
      displayName: 'Test Park & Ride',
      costDisplay: '$3 one-way adult est.',
      costNote: 'Usually free; verify lot signs.',
      cost: 3,
      durationMinutes: 18,
      reliable: true,
      confidenceScore: 58,
      recommended: true,
      availabilityTier: 'recommended',
      cardHeadline: 'Park & Ride option.',
      timingBasisLabel: 'Timed for arrival around 10:00 AM',
      scheduleConfidenceLabel: 'Schedule not confirmed — compare route.',
      timingIsEstimated: true,
      hasCandidates: true,
      pros: ['Useful when destination parking is expensive'],
      cons: ['Schedule not confirmed — compare route.'],
      warnings: ['Verify posted signs and lot rules before leaving your car.'],
      details: {
        lotName: 'Test Park & Ride',
        operator: 'Test Transit',
        address: 'Test Park & Ride',
        rulesUrl: 'https://example.com/rules',
        routesServed: [],
        parkingRuleSummary: 'Usually free; verify lot signs.',
        verifySignsWarning: 'Verify posted signs and lot rules before leaving your car.',
        timingBasisLabel: 'Timed for arrival around 10:00 AM',
        scheduleConfidenceLabel: 'Schedule not confirmed — compare route.',
        routeBreakdown: {
          driveMinutes: 8,
          transitMinutes: 6,
          walkMinutes: 2,
          waitMinutes: 2,
          totalMinutes: 18,
        },
        warnings: ['Verify posted signs and lot rules before leaving your car.'],
        lots: [],
        sections: [],
      },
    } satisfies PointAbParkRidePresentation;

    const ranked = rankPointAbModes({
      tripData: fredMeyerTrip,
      sort: 'easiest',
      destinationLabel: fredMeyerTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: expensiveRide,
      ridePrice: 18,
      rideDuration: 20,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      pointAbParkRide: staticParkRide,
      parkRideCost: staticParkRide.cost,
      parkRideDuration: staticParkRide.durationMinutes,
      parkRideReliable: staticParkRide.reliable,
      driveMinutes: 12,
    });

    const parkRideMode = ranked.modes.find((mode) => mode.key === 'park-ride');

    expect(ranked.recommendationMode).toBe('destination-customer');
    expect(ranked.displayRecommendationMode).toBe('destination-customer');
    expect(ranked.recommendedTitle).toMatch(/customer parking/i);
    expect(parkRideMode?.status).not.toBe('best_pick');
    expect(parkRideMode?.cons).toContain('Schedule not confirmed — compare route.');
  });

  test('Fred Meyer trip with no-parking preference keeps rideshare eligible to win', () => {
    const fredMeyerTrip = {
      type: 'general-trip' as const,
      origin: 'Monroe WA',
      destination: 'Fred Meyer Monroe WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '10:00',
      parkingDuration: 60,
      transportAvailability: 'all' as const,
    };
    const paidLotBase = {
      ...parkingOption,
      price: 10,
      parkingCategory: 'garage_paid' as const,
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
    } satisfies ParkingOption;
    const paidLots = [
      { ...paidLotBase, id: 'pw-1', name: 'ParkWhiz Lot 1', originToParkingMinutes: 8, routeToParkingMinutes: 8 },
      { ...paidLotBase, id: 'pw-2', name: 'ParkWhiz Lot 2', originToParkingMinutes: 9, routeToParkingMinutes: 9 },
      { ...paidLotBase, id: 'pw-3', name: 'ParkWhiz Lot 3', originToParkingMinutes: 10, routeToParkingMinutes: 10 },
    ] satisfies ParkingOption[];
    const rideOption = {
      ...expensiveRide,
      price: 18,
      duration: 9,
      driveMinutes: 4,
      pickupWaitMinutes: 5,
      totalOptionMinutes: 9,
    };

    const ranked = rankPointAbModes({
      tripData: fredMeyerTrip,
      sort: 'easiest',
      destinationLabel: fredMeyerTrip.destination,
      noParkingPreferred: true,
      bestParking: paidLots[0],
      parkingOptions: paidLots,
      parkingTotal: 10,
      parkingMinutes: 16,
      bestRideOption: rideOption,
      ridePrice: 18,
      rideDuration: 9,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: null,
    });

    expect(ranked.displayRecommendationMode).toBe('rideshare');
    const customerMode = ranked.modes.find((m) => m.key === 'destination-customer');
    expect(customerMode?.hiddenByPreference).toBe(true);
  });

  test('dense downtown with paid lots does not produce customer parking hero', () => {
    const downtownTrip = {
      type: 'general-trip' as const,
      origin: 'Bellevue WA',
      destination: 'Downtown Seattle Financial District WA',
      destinationKind: 'downtown' as const,
      arrivalDate: '2026-06-07',
      arrivalTime: '10:00',
      parkingDuration: 120,
      transportAvailability: 'all' as const,
    };
    const paidLotBase = {
      ...parkingOption,
      price: 22,
      parkingCategory: 'garage_paid' as const,
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
    } satisfies ParkingOption;
    const paidLots = [
      { ...paidLotBase, id: 'dt-1', name: 'Downtown Garage 1', originToParkingMinutes: 30, routeToParkingMinutes: 30 },
      { ...paidLotBase, id: 'dt-2', name: 'Downtown Garage 2', originToParkingMinutes: 32, routeToParkingMinutes: 32 },
      { ...paidLotBase, id: 'dt-3', name: 'Downtown Garage 3', originToParkingMinutes: 34, routeToParkingMinutes: 34 },
    ] satisfies ParkingOption[];

    const ranked = rankPointAbModes({
      tripData: downtownTrip,
      sort: 'easiest',
      destinationLabel: downtownTrip.destination,
      noParkingPreferred: false,
      bestParking: paidLots[0],
      parkingOptions: paidLots,
      parkingTotal: 22,
      parkingMinutes: 40,
      bestRideOption: expensiveRide,
      ridePrice: 28,
      rideDuration: 30,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 28,
    });

    expect(ranked.modes.some((m) => m.key === 'destination-customer')).toBe(false);
    expect(ranked.recommendationMode).not.toBe('destination-customer');
  });

  test('airport trip with paid lots does not produce customer parking candidate', () => {
    const airportTrip = {
      type: 'one-way-departure' as const,
      origin: 'Monroe WA',
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport' as const,
      airportCode: 'SEA',
      departureDate: '2026-06-07',
      departureTime: '06:00',
      transportAvailability: 'car' as const,
    };
    const paidLotBase = {
      ...parkingOption,
      price: 22,
      serviceAirportCode: 'SEA' as const,
      parkingCategory: 'garage_paid' as const,
      bookingProvider: 'ParkWhiz',
      sourceName: 'ParkWhiz',
    } satisfies ParkingOption;
    const seaLots = [
      { ...paidLotBase, id: 'sea-1', name: 'SEA Lot 1', originToParkingMinutes: 45, routeToParkingMinutes: 45 },
      { ...paidLotBase, id: 'sea-2', name: 'SEA Lot 2', originToParkingMinutes: 47, routeToParkingMinutes: 47 },
      { ...paidLotBase, id: 'sea-3', name: 'SEA Lot 3', originToParkingMinutes: 49, routeToParkingMinutes: 49 },
    ] satisfies ParkingOption[];

    const ranked = rankPointAbModes({
      tripData: airportTrip,
      sort: 'easiest',
      destinationLabel: airportTrip.destination,
      noParkingPreferred: false,
      bestParking: seaLots[0],
      parkingOptions: seaLots,
      parkingTotal: 80,
      parkingMinutes: 55,
      bestRideOption: expensiveRide,
      ridePrice: 45,
      rideDuration: 40,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 38,
    });

    expect(ranked.modes.some((m) => m.key === 'destination-customer')).toBe(false);
    expect(ranked.recommendationMode).not.toBe('destination-customer');
  });

  test('long intercity trip downgrades slow estimated transit and recommends driving', () => {
    const bendTrip = {
      type: 'general-trip' as const,
      origin: 'Seattle, WA',
      originLat: 47.6062,
      originLng: -122.3321,
      destination: 'Bend, Oregon',
      destinationKind: 'general' as const,
      destinationLat: 44.0582,
      destinationLng: -121.3153,
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      parkingDuration: 120,
      transportAvailability: 'all' as const,
    };
    const estimatedTransit = {
      ...cheapTransit,
      id: 'regional-transit-to-bend',
      name: 'Transit route to Bend',
      duration: 470,
      price: 4,
      trustStatus: 'estimated' as const,
      routeTrustStatus: 'estimated' as const,
      sourceName: 'Google Maps transit directions',
      assumptions: [
        'Transit time estimated from entered origin and destination.',
        'Open transit directions for exact route.',
      ],
    };

    const ranked = rankPointAbModes({
      tripData: bendTrip,
      sort: 'easiest',
      destinationLabel: bendTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: null,
      ridePrice: null,
      rideDuration: null,
      bestTransitOption: estimatedTransit,
      transitCost: 4,
      transitDuration: 470,
      transitCostDisplay: '$4 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 310,
    });

    const driveMode = ranked.modes.find((mode) => mode.key === 'drive');
    const transitMode = ranked.modes.find((mode) => mode.key === 'transit');

    expect(ranked.recommendationMode).toBe('drive');
    expect(ranked.displayRecommendationMode).toBe('drive');
    expect(ranked.cheapestMode?.key).not.toBe('transit');
    expect(driveMode).toMatchObject({
      label: 'Drive',
      status: 'best_pick',
      cost: 'Parking varies',
    });
    expect(transitMode).toMatchObject({
      costNote: 'Possible but impractical',
      status: 'not_recommended',
      unavailable: false,
    });
    expect(transitMode?.cons.join(' ')).toMatch(/Much slower than driving/i);
  });

  test('intercity general trip: Park & Ride and Transit cannot win with fabricated short totals', () => {
    const bendTrip = {
      type: 'general-trip' as const,
      origin: '13907 Chain Lake Rd, Monroe, WA 98272',
      destination: 'Bend, Oregon',
      destinationKind: 'general' as const,
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      parkingDuration: 120,
      transportAvailability: 'all' as const,
      originLat: 47.847,
      originLng: -121.978,
      destinationLat: 44.0582,
      destinationLng: -121.3153,
    };

    const pointAbParkRideSelection = selectBestParkAndRideForPointAb({
      origin: bendTrip.origin,
      originLat: bendTrip.originLat,
      originLng: bendTrip.originLng,
      destination: bendTrip.destination,
      destinationLat: bendTrip.destinationLat,
      destinationLng: bendTrip.destinationLng,
      parkingDurationMinutes: 120,
      isAirportTrip: false,
      sort: 'easiest',
    });
    const pointAbParkRide = toPointAbParkRidePresentation(pointAbParkRideSelection);

    const estimatedTransit = {
      ...cheapTransit,
      id: 'regional-transit-to-bend',
      name: 'Transit route to Bend',
      duration: 63,
      price: 4,
      trustStatus: 'estimated' as const,
      routeTrustStatus: 'estimated' as const,
      sourceName: 'Google Maps transit directions',
      assumptions: [
        'Transit time estimated from entered origin and destination.',
        'Open transit directions for exact route.',
      ],
    };

    const ranked = rankPointAbModes({
      tripData: bendTrip,
      sort: 'easiest',
      destinationLabel: bendTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: null,
      ridePrice: null,
      rideDuration: null,
      bestTransitOption: estimatedTransit,
      transitCost: 4,
      transitDuration: 63,
      transitCostDisplay: '$4 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      pointAbParkRide,
      parkRideCost: pointAbParkRide?.cost ?? null,
      parkRideDuration: pointAbParkRide?.durationMinutes ?? null,
      parkRideReliable: Boolean(pointAbParkRide?.reliable),
      driveMinutes: 310,
    });

    const parkRideMode = ranked.modes.find((mode) => mode.key === 'park-ride');
    const transitMode = ranked.modes.find((mode) => mode.key === 'transit');

    // Park & Ride is not confirmed for this destination and cannot win.
    expect(pointAbParkRide?.reliable).toBe(false);
    expect(pointAbParkRide?.durationMinutes).toBeNull();
    expect(parkRideMode?.name).toMatch(/not confirmed for this destination/i);
    expect(parkRideMode?.time).toBe('Not estimated');
    expect(parkRideMode?.status).not.toBe('best_pick');
    expect(ranked.recommendationMode).not.toBe('park-ride');
    expect(ranked.displayRecommendationMode).not.toBe('park-ride');
    expect(ranked.canonicalWinners.cheapestWinner?.key).not.toBe('park-ride');
    expect(ranked.canonicalWinners.fastestWinner?.key).not.toBe('park-ride');

    // Transit's fabricated short total is hidden, not presented as a real time.
    expect(transitMode?.time).toBe('Check route');
    expect(transitMode?.status).toBe('not_recommended');
    expect(ranked.recommendationMode).toBe('drive');
  });

  test('valid local Park & Ride remains eligible and usable', () => {
    const localTrip = {
      type: 'general-trip' as const,
      origin: 'Lynnwood, WA',
      destination: 'Downtown Seattle, WA',
      destinationKind: 'downtown' as const,
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      parkingDuration: 6 * 60,
      transportAvailability: 'all' as const,
      originLat: 47.8209,
      originLng: -122.2931,
      destinationLat: 47.6062,
      destinationLng: -122.3321,
    };

    const pointAbParkRideSelection = selectBestParkAndRideForPointAb({
      origin: localTrip.origin,
      originLat: localTrip.originLat,
      originLng: localTrip.originLng,
      destination: localTrip.destination,
      destinationLat: localTrip.destinationLat,
      destinationLng: localTrip.destinationLng,
      parkingDurationMinutes: 6 * 60,
      isAirportTrip: false,
      sort: 'easiest',
      parkingTotal: 32,
    });
    const pointAbParkRide = toPointAbParkRidePresentation(pointAbParkRideSelection);

    const ranked = rankPointAbModes({
      tripData: localTrip,
      sort: 'easiest',
      destinationLabel: localTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: 32,
      parkingMinutes: null,
      bestRideOption: null,
      ridePrice: null,
      rideDuration: null,
      bestTransitOption: null,
      transitCost: null,
      transitDuration: null,
      transitCostDisplay: null,
      hasReliableTransit: false,
      bestParkRideAccess: null,
      pointAbParkRide,
      parkRideCost: pointAbParkRide?.cost ?? null,
      parkRideDuration: pointAbParkRide?.durationMinutes ?? null,
      parkRideReliable: Boolean(pointAbParkRide?.reliable),
      driveMinutes: 35,
    });

    const parkRideMode = ranked.modes.find((mode) => mode.key === 'park-ride');

    // A real local corridor keeps Park & Ride reliable, timed, and eligible.
    expect(pointAbParkRide?.reliable).toBe(true);
    expect(pointAbParkRide?.durationMinutes).not.toBeNull();
    expect(parkRideMode?.status).not.toBe('unavailable');
    expect(parkRideMode?.status).not.toBe('not_recommended');
    expect(ranked.canonicalWinners.visibleOptionKeys).toContain('park-ride');
  });

  test('short city trip can still recommend genuinely faster transit', () => {
    const shortCityTrip = {
      type: 'general-trip' as const,
      origin: 'Capitol Hill, Seattle, WA',
      destination: 'Downtown Bellevue, WA',
      destinationKind: 'downtown' as const,
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      parkingDuration: 120,
      transportAvailability: 'all' as const,
    };

    const ranked = rankPointAbModes({
      tripData: shortCityTrip,
      sort: 'easiest',
      destinationLabel: shortCityTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: null,
      ridePrice: null,
      rideDuration: null,
      bestTransitOption: {
        ...cheapTransit,
        duration: 20,
        price: 3,
        trustStatus: 'verified-source',
        assumptions: ['Published city transit route.'],
      },
      transitCost: 3,
      transitDuration: 20,
      transitCostDisplay: '$3 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 60,
    });

    expect(ranked.recommendationMode).toBe('transit');
    expect(ranked.modes.find((mode) => mode.key === 'transit')?.status).toBe('best_pick');
    expect(ranked.modes.find((mode) => mode.key === 'drive')?.status).not.toBe('best_pick');
  });

  test('airport transit behavior remains eligible outside the general-trip intercity guard', () => {
    const airportTrip = {
      type: 'one-way-departure' as const,
      origin: 'Seattle, WA',
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport' as const,
      airportCode: 'SEA',
      departureDate: '2026-06-07',
      departureTime: '06:00',
      transportAvailability: 'all' as const,
    };

    const ranked = rankPointAbModes({
      tripData: airportTrip,
      sort: 'easiest',
      destinationLabel: airportTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: null,
      ridePrice: null,
      rideDuration: null,
      bestTransitOption: {
        ...cheapTransit,
        duration: 90,
        trustStatus: 'estimated',
        assumptions: ['Airport transit estimate.'],
      },
      transitCost: 3,
      transitDuration: 90,
      transitCostDisplay: '$3 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 45,
    });

    expect(ranked.modes.some((mode) => mode.key === 'drive')).toBe(false);
    expect(ranked.recommendationMode).toBe('transit');
    expect(ranked.modes.find((mode) => mode.key === 'transit')?.status).toBe('best_pick');
  });

  test('event transit behavior remains eligible outside the general-trip intercity guard', () => {
    const eventTrip = {
      ...tripData,
      origin: 'Bellevue, WA',
      destination: 'Lumen Field, Seattle, WA',
      destinationKind: 'stadium' as const,
      parkingDuration: 180,
    };

    const ranked = rankPointAbModes({
      tripData: eventTrip,
      sort: 'easiest',
      destinationLabel: eventTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: expensiveRide,
      ridePrice: 55,
      rideDuration: 32,
      bestTransitOption: {
        ...cheapTransit,
        duration: 48,
        trustStatus: 'verified-source',
      },
      transitCost: 3.25,
      transitDuration: 48,
      transitCostDisplay: '$3.25 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 28,
    });

    expect(ranked.modes.some((mode) => mode.key === 'drive')).toBe(false);
    expect(ranked.recommendationMode).toBe('transit');
    expect(ranked.recommendedTitle).toBe('Take transit to the game');
  });

  test('low-confidence transit does not beat known drive time', () => {
    const lowConfidenceTrip = {
      type: 'general-trip' as const,
      origin: 'Seattle, WA',
      destination: 'Tacoma, WA',
      destinationKind: 'general' as const,
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      parkingDuration: 120,
      transportAvailability: 'all' as const,
    };

    const ranked = rankPointAbModes({
      tripData: lowConfidenceTrip,
      sort: 'easiest',
      destinationLabel: lowConfidenceTrip.destination,
      noParkingPreferred: false,
      bestParking: null,
      parkingOptions: [],
      parkingTotal: null,
      parkingMinutes: null,
      bestRideOption: null,
      ridePrice: null,
      rideDuration: null,
      bestTransitOption: {
        ...cheapTransit,
        duration: 38,
        trustStatus: 'estimated',
        routeTrustStatus: 'fallback',
        assumptions: ['Drive time unavailable; open transit directions to confirm route.'],
      },
      transitCost: 3,
      transitDuration: 38,
      transitCostDisplay: '$3 est.',
      hasReliableTransit: true,
      bestParkRideAccess: null,
      parkRideCost: null,
      parkRideDuration: null,
      parkRideReliable: false,
      driveMinutes: 45,
    });

    expect(ranked.recommendationMode).toBe('drive');
    expect(ranked.modes.find((mode) => mode.key === 'transit')).toMatchObject({
      status: 'not_recommended',
      costNote: 'Possible but impractical',
    });
  });
});
