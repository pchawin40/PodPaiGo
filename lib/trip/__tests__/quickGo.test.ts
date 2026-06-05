import {
  applyQuickGoOriginToSearchParams,
  buildQuickGoSearchParams,
  detectAirportFromDestination,
  formatQuickGoOriginDisplayLabel,
  isQuickGoMode,
  mergeStoredTripSearchParams,
  quickGoParkingExpectationLabel,
  quickGoClassificationForTrip,
  resolveQuickGoBestWay,
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

  test('parseTripDataFromSearchParams accepts quick-go type and origin metadata', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Downtown shopping district',
      origin: savedOrigin,
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
    expect(tripData?.destination).toBe('Pike Place Market');
    expect(tripData?.destinationLat).toBe(47.6097);
    expect(tripData?.destinationLng).toBe(-122.3425);
    expect(tripData?.tripMode).toBe('quick-go');
    expect(tripData && 'airportCode' in tripData ? tripData.airportCode : undefined).toBeUndefined();
    expect(isQuickGoMode(params)).toBe(true);
    expect(readQuickGoOriginFromSearchParams(params)).toEqual(savedOrigin);
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
});
