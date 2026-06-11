import {
  applyQuickGoOriginToSearchParams,
  buildQuickGoSearchParams,
  detectAirportFromDestination,
  formatQuickGoOriginDisplayLabel,
  isQuickGoMode,
  mergeStoredTripSearchParams,
  quickGoParkingExpectationLabel,
  quickGoParkingHeadline,
  quickGoClassificationForTrip,
  deriveQuickGoDisplayRouteState,
  quickGoRouteHydrationStateForFinalResult,
  quickGoRouteRoutability,
  resolveQuickGoBestWay,
  resolveQuickGoDriveTime,
  resolveQuickGoLocalParkingWalkBufferMinutes,
  resolveQuickGoLocalTripTiming,
  readQuickGoOriginFromSearchParams,
} from '../quickGo';
import { classifyDestinationParking } from '../../parking/destinationParkingClassifier';
import { parseTripDataFromSearchParams, tripDataToSearchParams } from '../searchParams';

const manualOrigin = {
  origin: '123 Main Street, Example City, ST',
  originLabel: '123 Main Street, Example City, ST',
  originSource: 'manual' as const,
};

const geolocationOrigin = {
  origin: '47.6101,-122.2015',
  originLabel: 'Current location',
  originSource: 'geolocation' as const,
  originLat: 47.6101,
  originLng: -122.2015,
};

const savedOrigin = {
  origin: '456 Oak Avenue, Sample Town, ST',
  originLabel: '456 Oak Avenue, Sample Town, ST',
  originSource: 'saved' as const,
};

describe('quickGo', () => {
  test('buildQuickGoSearchParams creates quick-go trip params with origin metadata', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Grocery store',
      origin: manualOrigin,
      now: new Date('2026-06-01T14:30:00'),
    });

    expect(params.get('type')).toBe('quick-go');
    expect(params.get('tripMode')).toBe('quick-go');
    expect(params.get('destination')).toBe('Grocery store');
    expect(params.get('destinationLabel')).toBe('Grocery store');
    expect(params.get('destinationAddress')).toBe('Grocery store');
    expect(params.get('destinationSource')).toBe('typed');
    expect(params.get('destinationConfidence')).toBe('low');
    expect(params.get('origin')).toBe(manualOrigin.origin);
    expect(params.get('originLabel')).toBe(manualOrigin.originLabel);
    expect(params.get('originSource')).toBe('manual');
    expect(params.get('arrivalDate')).toBe('2026-06-01');
    expect(params.get('arrivalTime')).toBe('14:30');
    expect(params.get('parkingCheckInDate')).toBe('2026-06-01');
    expect(params.get('parkingCheckInTime')).toBe('14:30');
    expect(params.get('parkingCheckOutDate')).toBe('2026-06-01');
    expect(params.get('parkingCheckOutTime')).toBe('16:30');
    expect(params.get('parkingDuration')).toBe('120');
    expect(params.get('intent')).toBe('general-trip');
    expect(params.get('transport')).toBe('all');
  });

  test('buildQuickGoSearchParams preserves no-car rideshare preference', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Downtown Seattle',
      origin: manualOrigin,
      transportAvailability: 'rideshare',
      now: new Date('2026-06-01T14:30:00'),
    });

    expect(params.get('transport')).toBe('rideshare');
  });

  test('buildQuickGoSearchParams stores purpose, preference, leave time, and duration controls', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'SEA Airport',
      origin: manualOrigin,
      purpose: 'flying-out',
      preference: 'cheapest',
      calculateLeaveTime: false,
      familyLuggageFriendly: true,
      parkingDurationMinutes: 6 * 60,
      now: new Date('2026-06-01T05:15:00'),
    });

    expect(params.get('quickGoPurpose')).toBe('flying-out');
    expect(params.get('quickGoPreference')).toBe('cheapest');
    expect(params.get('calculateLeaveTime')).toBe('0');
    expect(params.get('familyLuggageFriendly')).toBe('1');
    expect(params.get('parkingDuration')).toBe('360');
    expect(params.get('parkingCheckOutTime')).toBe('11:15');
  });

  test('parseTripDataFromSearchParams accepts quick-go type and origin metadata', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Downtown shopping district',
      origin: geolocationOrigin,
      destination: {
        destination: 'Pike Place Market',
        destinationLabel: 'Pike Place Market',
        destinationAddress: '85 Pike St, Seattle, WA',
        destinationSource: 'google',
        destinationLat: 47.6097,
        destinationLng: -122.3425,
      },
      now: new Date('2026-06-01T09:00:00'),
    });
    params.set('airport', 'SEA');
    params.set('airportCode', 'SEA');

    const tripData = parseTripDataFromSearchParams(params);

    expect(tripData?.type).toBe('general-trip');
    expect(tripData?.originLat).toBe(47.6101);
    expect(tripData?.originLng).toBe(-122.2015);
    expect(tripData?.destination).toBe('Pike Place Market');
    expect(tripData?.destinationLat).toBe(47.6097);
    expect(tripData?.destinationLng).toBe(-122.3425);
    expect(tripData?.tripMode).toBe('quick-go');
    expect(tripData && 'airportCode' in tripData ? tripData.airportCode : undefined).toBeUndefined();
    expect(isQuickGoMode(params)).toBe(true);
    expect(readQuickGoOriginFromSearchParams(params)).toEqual(geolocationOrigin);
  });

  test('selected Quick Go origin and destination coordinates persist through params and parsing', () => {
    const params = buildQuickGoSearchParams({
      destination: {
        destination: 'Franklin Barbecue, East 11th Street, Austin, TX, USA',
        destinationLabel: 'Franklin Barbecue',
        destinationAddress: '900 E 11th St, Austin, TX 78702',
        destinationSource: 'google',
        destinationLat: 30.2701,
        destinationLng: -97.7313,
        destinationConfidence: 'high',
      },
      origin: {
        origin:
          'La Quinta Inn & Suites by Wyndham Austin Airport, East Ben White Boulevard, Austin, TX, USA',
        originLabel: 'La Quinta Inn & Suites by Wyndham Austin Airport',
        originSource: 'google',
        originLat: 30.2146,
        originLng: -97.6896,
        originPlaceId: 'la-quinta-austin-airport',
        originConfidence: 'high',
      },
      now: new Date('2026-06-01T10:00:00'),
    });

    expect(params.get('originLat')).toBe('30.2146');
    expect(params.get('originLng')).toBe('-97.6896');
    expect(params.get('originPlaceId')).toBe('la-quinta-austin-airport');
    expect(params.get('destinationLat')).toBe('30.2701');
    expect(params.get('destinationLng')).toBe('-97.7313');

    const tripData = parseTripDataFromSearchParams(params);
    expect(tripData?.originLat).toBe(30.2146);
    expect(tripData?.originLng).toBe(-97.6896);
    expect(tripData?.originPlaceId).toBe('la-quinta-austin-airport');
    expect(tripData?.destinationLat).toBe(30.2701);
    expect(tripData?.destinationLng).toBe(-97.7313);
    expect(tripData?.tripMode).toBe('quick-go');
  });

  test('general trip parking window uses arrival plus selected duration', () => {
    const params = new URLSearchParams({
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Pike Place Market',
      arrivalDate: '2026-06-01',
      arrivalTime: '09:00',
      parkingDuration: String(8 * 60),
    });

    const tripData = parseTripDataFromSearchParams(params);

    expect(tripData?.type).toBe('general-trip');
    expect(tripData?.parkingCheckInDate).toBe('2026-06-01');
    expect(tripData?.parkingCheckInTime).toBe('09:00');
    expect(tripData?.parkingCheckOutDate).toBe('2026-06-01');
    expect(tripData?.parkingCheckOutTime).toBe('17:00');

    const roundTripParams = tripDataToSearchParams(tripData!);
    expect(roundTripParams.get('parkingCheckInDate')).toBe('2026-06-01');
    expect(roundTripParams.get('parkingCheckInTime')).toBe('09:00');
    expect(roundTripParams.get('parkingCheckOutDate')).toBe('2026-06-01');
    expect(roundTripParams.get('parkingCheckOutTime')).toBe('17:00');
  });

  test('general trip params preserve no-parking preference and parking time window', () => {
    const params = new URLSearchParams({
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Bellevue Square',
      arrivalDate: '2026-11-13',
      arrivalTime: '09:00',
      parkingCheckInDate: '2026-11-13',
      parkingCheckInTime: '09:00',
      parkingCheckOutDate: '2026-11-13',
      parkingCheckOutTime: '17:00',
      parkingDuration: String(8 * 60),
      transport: 'car',
      parkingPreference: 'none',
      destinationKind: 'general',
    });

    const tripData = parseTripDataFromSearchParams(params);

    expect(tripData?.type).toBe('general-trip');
    expect(tripData?.transportAvailability).toBe('car');
    expect(tripData?.parkingPreference).toBe('none');
    expect(tripData?.parkingCheckInDate).toBe('2026-11-13');
    expect(tripData?.parkingCheckInTime).toBe('09:00');
    expect(tripData?.parkingCheckOutDate).toBe('2026-11-13');
    expect(tripData?.parkingCheckOutTime).toBe('17:00');
    expect(tripData?.parkingDuration).toBe(8 * 60);
  });

  test('existing ISO date search params still parse and serialize unchanged', () => {
    const params = new URLSearchParams({
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      departureDate: '2026-06-05',
      departureTime: '09:00',
      parkingCheckInDate: '2026-06-05',
      parkingCheckInTime: '09:00',
      parkingCheckOutDate: '2026-06-07',
      parkingCheckOutTime: '17:00',
      parkingDuration: String(2 * 24 * 60),
      airportCode: 'SEA',
      destinationKind: 'airport',
    });

    const tripData = parseTripDataFromSearchParams(params);
    expect(tripData?.type).toBe('one-way-departure');
    expect(tripData && 'departureDate' in tripData ? tripData.departureDate : undefined).toBe('2026-06-05');
    expect(tripData?.parkingCheckInDate).toBe('2026-06-05');
    expect(tripData?.parkingCheckOutDate).toBe('2026-06-07');

    const serialized = tripDataToSearchParams(tripData!, { intent: 'flying-out', preserve: params });
    expect(serialized.get('departureDate')).toBe('2026-06-05');
    expect(serialized.get('parkingCheckInDate')).toBe('2026-06-05');
    expect(serialized.get('parkingCheckOutDate')).toBe('2026-06-07');
  });

  test('formatQuickGoOriginDisplayLabel reflects origin source', () => {
    const manualParams = buildQuickGoSearchParams({
      destinationText: 'Coffee shop',
      origin: manualOrigin,
    });
    const geoParams = buildQuickGoSearchParams({
      destinationText: 'Coffee shop',
      origin: geolocationOrigin,
    });
    const savedParams = buildQuickGoSearchParams({
      destinationText: 'Coffee shop',
      origin: savedOrigin,
    });

    expect(formatQuickGoOriginDisplayLabel(manualParams)).toBe(
      'From typed origin: 123 Main Street, Example City, ST',
    );
    expect(formatQuickGoOriginDisplayLabel(geoParams)).toBe('From current location');
    expect(formatQuickGoOriginDisplayLabel(savedParams)).toBe(
      'From saved origin: 456 Oak Avenue, Sample Town, ST',
    );
  });

  test('applyQuickGoOriginToSearchParams stores geolocation coordinates', () => {
    const params = new URLSearchParams();
    applyQuickGoOriginToSearchParams(params, geolocationOrigin);

    expect(params.get('originSource')).toBe('geolocation');
    expect(params.get('originLabel')).toBe('Current location');
    expect(params.get('originLat')).toBe('47.6101');
    expect(params.get('originLng')).toBe('-122.2015');
  });

  test('grocery stores classify as free customer parking likely', () => {
    expect(
      quickGoParkingExpectationLabel(
        classifyDestinationParking({ destination: 'Neighborhood grocery store' }),
      ),
    ).toBe('Free customer parking likely');

    expect(
      quickGoParkingExpectationLabel(
        classifyDestinationParking({ destination: 'Community supermarket' }),
      ),
    ).toBe('Free customer parking likely');
  });

  test('Fred Meyer Monroe address is retail not airport', () => {
    const destination = 'Fred Meyer, U.S. 2, Monroe, WA, USA';
    const classification = quickGoClassificationForTrip({ destination });

    expect(classification.mode).toBe('free_likely');
    expect(classification.confidence).toBe('high');
    expect(quickGoParkingExpectationLabel(classification)).toBe('Free customer parking likely');
    expect(detectAirportFromDestination(destination)).toBeNull();
  });

  test('USA in address does not detect SEA airport', () => {
    expect(detectAirportFromDestination('Fred Meyer, U.S. 2, Monroe, WA, USA')).toBeNull();
  });

  test('resolveQuickGoBestWay prefers Drive for free retail with drive time', () => {
    const classification = classifyDestinationParking({
      destination: 'Safeway Monroe',
    });
    const result = resolveQuickGoBestWay({
      tripData: {
        type: 'general-trip',
        origin: '123 Main Street',
        destination: 'Safeway Monroe',
        arrivalDate: '2026-06-01',
        arrivalTime: '10:00',
        transportAvailability: 'all',
      },
      rankedOptions: [
        {
          type: 'rideshare',
          option: { id: 'rideshare', name: 'Rideshare', duration: 18, price: 22, trustStatus: 'estimated' },
          score: 90,
          cost: 22,
          duration: 18,
          stressScore: 70,
        },
      ],
      driveMinutes: 16,
      classification,
    });

    expect(result.bestWayLabel).toBe('Drive');
    expect(result.backupWayLabel).toBe('Rideshare / taxi');
  });

  test('Costco Everett prefers Drive when transport is all', () => {
    const classification = classifyDestinationParking({ destination: 'Costco Everett' });
    const result = resolveQuickGoBestWay({
      tripData: {
        type: 'general-trip',
        origin: '123 Main Street',
        destination: 'Costco Everett',
        arrivalDate: '2026-06-01',
        arrivalTime: '10:00',
        transportAvailability: 'all',
      },
      rankedOptions: [],
      driveMinutes: 22,
      classification,
    });

    expect(result.bestWayLabel).toBe('Drive');
  });

  test('SEA Airport uses airport parking rules', () => {
    const classification = quickGoClassificationForTrip({
      destination: 'SEA Airport',
      destinationKind: 'airport',
      detectedAirportCode: 'SEA',
    });

    expect(quickGoParkingExpectationLabel(classification)).toBe('Airport parking rules');
  });

  test('corporate building can show restricted parking', () => {
    const classification = quickGoClassificationForTrip({
      destination: 'Corporate headquarters campus',
    });

    expect(quickGoParkingExpectationLabel(classification)).toMatch(/Restricted/);
  });

  test('Seattle weekday downtown uses time-aware paid street label', () => {
    const classification = quickGoClassificationForTrip({
      destination: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
    });
    const context = {
      destination: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
    };

    expect(quickGoParkingExpectationLabel(classification, context)).toBe(
      'Likely paid street parking',
    );
    expect(quickGoParkingHeadline(classification, context)).toMatch(
      /Seattle payment hours/i,
    );
  });

  test('Pike Place Sunday evening is not always likely paid in Quick Go', () => {
    const classification = quickGoClassificationForTrip({
      destination: 'Pike Place Market, Seattle, WA',
    });
    const context = {
      destination: 'Pike Place Market, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '19:30',
    };

    expect(classification.mode).toBe('paid_likely');
    expect(quickGoParkingExpectationLabel(classification, context)).toBe(
      'Likely free street parking',
    );
    expect(quickGoParkingHeadline(classification, context)).toContain(
      'Street parking estimate based on Seattle payment hours. Garages/lots may still charge.',
    );
  });

  test('Seattle weekday 9 PM Quick Go asks users to check signs', () => {
    const classification = quickGoClassificationForTrip({
      destination: 'Capitol Hill, Seattle, WA',
    });
    const context = {
      destination: 'Capitol Hill, Seattle, WA',
      arrivalDate: '2026-06-03',
      arrivalTime: '21:00',
    };

    expect(quickGoParkingExpectationLabel(classification, context)).toBe(
      'Check signs / special rules possible',
    );
    expect(quickGoParkingHeadline(classification, context)).toMatch(/8 PM and 10 PM/i);
  });

  test('non-Seattle U.S. city Sunday Quick Go checks signs instead of assuming free', () => {
    const classification = quickGoClassificationForTrip({
      destination: 'Downtown Manhattan, New York, NY',
      destinationKind: 'downtown',
    });
    const context = {
      destination: 'Downtown Manhattan, New York, NY',
      arrivalDate: '2026-06-07',
      arrivalTime: '14:00',
    };

    expect(quickGoParkingExpectationLabel(classification, context)).toBe(
      'Check signs / special rules possible',
    );
    expect(quickGoParkingHeadline(classification, context)).toMatch(
      /Sunday street parking payment rules vary by U\.S\. city/i,
    );
    expect(quickGoParkingHeadline(classification, context)).not.toMatch(
      /Seattle payment hours/i,
    );
  });

  test('non-Seattle U.S. city evening Quick Go stays conservative', () => {
    const classification = quickGoClassificationForTrip({
      destination: 'Downtown Chicago, IL',
      destinationKind: 'downtown',
    });
    const context = {
      destination: 'Downtown Chicago, IL',
      arrivalDate: '2026-06-03',
      arrivalTime: '21:00',
    };

    expect(quickGoParkingExpectationLabel(classification, context)).toBe(
      'Check signs / special rules possible',
    );
    expect(quickGoParkingHeadline(classification, context)).toMatch(
      /Some districts charge until 10 PM or during special events/i,
    );
  });

  test('Seattle grocery stores keep free customer parking label', () => {
    const classification = quickGoClassificationForTrip({
      destination: 'Safeway, Seattle, WA',
    });

    expect(quickGoParkingExpectationLabel(classification, {
      destination: 'Safeway, Seattle, WA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
    })).toBe('Free customer parking likely');
  });

  test('airport destination is detected for Quick Go', () => {
    const airport = detectAirportFromDestination('SEA Airport');
    expect(airport?.id).toBe('SEA');

    const params = buildQuickGoSearchParams({
      destinationText: 'SEA Airport',
      origin: manualOrigin,
    });

    expect(params.get('detectedAirportCode')).toBe('SEA');
    expect(params.get('detectedAirport')).toBe('1');
  });

  test('continue quick go clears airport detection flags', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'SEA Airport',
      origin: manualOrigin,
      continueAsQuickGo: true,
    });

    expect(params.get('quickGoConfirmed')).toBe('1');
    expect(params.get('detectedAirportCode')).toBeNull();
  });

  test('local cafe uses a small free-customer parking/walk buffer', () => {
    const classification = quickGoClassificationForTrip({
      destination: "Jeno's Cafe, Monroe, WA",
    });

    expect(classification.mode).toBe('free_likely');
    expect(resolveQuickGoLocalParkingWalkBufferMinutes(classification)).toBeGreaterThanOrEqual(2);
    expect(resolveQuickGoLocalParkingWalkBufferMinutes(classification)).toBeLessThanOrEqual(5);

    const timing = resolveQuickGoLocalTripTiming({ driveMinutes: 4, classification });
    expect(timing.driveMinutes).toBe(4);
    expect(timing.bufferMinutes).toBe(4);
    expect(timing.totalMinutes).toBe(8);
    expect(timing.breakdownDetail).toBe('~4 min drive + ~4 min parking/walk');
    expect(timing.guidance).toMatch(/Free\/customer parking likely/i);
  });

  test('downtown destination uses a larger street-parking buffer', () => {
    const classification = quickGoClassificationForTrip({
      destination: 'Pike Place Market, Seattle, WA',
      destinationKind: 'downtown',
    });

    expect(classification.mode).toBe('paid_likely');
    expect(resolveQuickGoLocalParkingWalkBufferMinutes(classification)).toBeGreaterThanOrEqual(5);
    expect(resolveQuickGoLocalParkingWalkBufferMinutes(classification)).toBeLessThanOrEqual(12);

    const timing = resolveQuickGoLocalTripTiming({ driveMinutes: 4, classification });
    expect(timing.totalMinutes).toBe(timing.driveMinutes + timing.bufferMinutes);
    expect(timing.bufferMinutes).toBe(8);
    expect(timing.totalMinutes).toBe(12);
  });

  test('airport classification is excluded from local buffer timing helper', () => {
    const classification = quickGoClassificationForTrip({
      destination: 'SEA Airport',
      destinationKind: 'airport',
      detectedAirportCode: 'SEA',
    });

    expect(classification.mode).toBe('airport');
    expect(resolveQuickGoLocalParkingWalkBufferMinutes(classification)).toBe(0);
  });

  test('local trip timing always includes known drive in total', () => {
    const classification = classifyDestinationParking({ destination: 'Neighborhood grocery store' });
    const timing = resolveQuickGoLocalTripTiming({ driveMinutes: 6.4, classification });

    expect(timing.driveMinutes).toBe(6);
    expect(timing.totalMinutes).toBe(timing.driveMinutes + timing.bufferMinutes);
    expect(timing.breakdownDetail).toContain('~6 min drive');
  });

  test('total trip breakdown waits until route loading finishes', () => {
    const classification = quickGoClassificationForTrip({
      destination: "Jeno's Cafe, Monroe, WA",
    });

    const loading = resolveQuickGoDriveTime({
      traffic: { duration: 4, trustStatus: 'live', sourceName: 'Google Routes API' },
      routeLoading: true,
    });
    expect(loading.loading).toBe(true);
    expect(loading.unavailable).toBe(false);

    const ready = resolveQuickGoDriveTime({
      traffic: { duration: 4, trustStatus: 'live', sourceName: 'Google Routes API' },
    });
    const timing = resolveQuickGoLocalTripTiming({
      driveMinutes: ready.minutes!,
      classification,
    });
    expect(timing.totalMinutes).toBe(timing.driveMinutes + timing.bufferMinutes);
  });

  test('mergeStoredTripSearchParams keeps stored quick-go origin when route has stale params', () => {
    const stored = buildQuickGoSearchParams({
      destinationText: 'Coffee shop',
      origin: savedOrigin,
    }).toString();
    const merged = mergeStoredTripSearchParams(
      stored,
      'origin=Old+Stale+Origin&originSource=manual&sort=cheapest',
    );

    expect(merged.get('origin')).toBe(savedOrigin.origin);
    expect(merged.get('originSource')).toBe('saved');
    expect(merged.get('sort')).toBe('cheapest');
  });

  test('routable local Quick Go can route with text destination before coords exist', () => {
    const routability = quickGoRouteRoutability({
      isQuickGo: true,
      tripData: {
        type: 'general-trip',
        origin: manualOrigin.origin,
        destination: 'Dairy Queen, Monroe, WA',
        destinationName: 'Dairy Queen',
        arrivalDate: '2026-06-01',
        arrivalTime: '10:00',
      },
    });

    expect(routability.routable).toBe(true);
    expect(routability.reason).toBe('routable_with_text');
  });

  test('hydration gap displays calculating for stale unavailable local Quick Go', () => {
    const decision = deriveQuickGoDisplayRouteState({
      isQuickGo: true,
      tripData: {
        type: 'general-trip',
        origin: manualOrigin.origin,
        destination: 'Fred Meyer, Monroe, WA',
        destinationName: 'Fred Meyer',
        arrivalDate: '2026-06-01',
        arrivalTime: '10:00',
      },
      trafficEstimate: {
        duration: 0,
        routeUnavailable: true,
        routeStatus: 'unavailable',
      },
      routeHydrationState: 'not_started',
    });

    expect(decision.displayRouteState).toBe('calculating');
    expect(decision.shouldForceInitialPending).toBe(true);
  });

  test('missing origin is unavailable only as an unroutable or final unavailable state', () => {
    const trip = {
      type: 'general-trip' as const,
      origin: '',
      destination: 'Dairy Queen, Monroe, WA',
      destinationName: 'Dairy Queen',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
    };

    expect(quickGoRouteRoutability({ isQuickGo: true, tripData: trip }).routable).toBe(false);
    expect(
      quickGoRouteHydrationStateForFinalResult({
        isQuickGo: true,
        tripData: trip,
        trafficEstimate: {
          duration: 0,
          routeUnavailable: true,
          routeStatus: 'unavailable',
        },
      }),
    ).toBe('final_unavailable');
  });
});
