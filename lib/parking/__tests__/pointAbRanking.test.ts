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
    expect(paidMode?.pros.join(' ')).toMatch(/Event-zone or special paid parking rules/i);
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
});
