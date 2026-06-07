import {
  detectParkRideMetro,
  PARK_RIDE_COPY,
  resolveParkAndRideForTrip,
} from '../parkRideResolver';

describe('detectParkRideMetro', () => {
  test('detects Austin from destination text', () => {
    const metro = detectParkRideMetro({
      destination: 'Franklin Barbecue, Austin TX',
    });

    expect(metro?.id).toBe('austin');
    expect(metro?.agencyNames).toContain('CapMetro');
  });

  test('detects Houston from destination text', () => {
    const metro = detectParkRideMetro({
      destination: 'Downtown Houston, TX',
    });

    expect(metro?.id).toBe('houston');
  });

  test('detects Seattle from coordinates', () => {
    const metro = detectParkRideMetro({
      origin: 'Lynnwood, WA',
      originLat: 47.8209,
      originLng: -122.2931,
      destination: 'Downtown Seattle, WA',
      destinationLat: 47.6062,
      destinationLng: -122.3321,
    });

    expect(metro?.id).toBe('seattle');
  });

  test('returns null for unknown metro', () => {
    const metro = detectParkRideMetro({
      origin: 'Boise, ID',
      destination: 'Neighborhood Cafe, Boise, ID',
    });

    expect(metro).toBeNull();
  });
});

describe('resolveParkAndRideForTrip', () => {
  test('Austin trip surfaces CapMetro Park & Ride option', () => {
    const result = resolveParkAndRideForTrip({
      origin: 'La Quinta Inn & Suites by Wyndham Austin Airport',
      originLat: 30.1944,
      originLng: -97.6699,
      destination: 'Franklin Barbecue, Austin TX',
      destinationLat: 30.2702,
      destinationLng: -97.7314,
      parkingDurationMinutes: 120,
      isAirportTrip: false,
      sort: 'easiest',
      parkingTotal: 15,
    });

    expect(result.metroStatus).toBe('connected');
    expect(result.metroId).toBe('austin');
    expect(result.best).not.toBeNull();
    expect(result.best?.agencyName).toBe('CapMetro');
    expect(result.availabilityTier).toMatch(/recommended|backup_available/);
    expect(result.best?.costEstimate?.parkingDisplay).toBe('Free during service hours');
  });

  test('Houston trip surfaces METRO Park & Ride option', () => {
    const result = resolveParkAndRideForTrip({
      origin: 'Katy, TX',
      originLat: 29.7858,
      originLng: -95.8244,
      destination: 'Downtown Houston, TX',
      destinationLat: 29.7604,
      destinationLng: -95.3698,
      parkingDurationMinutes: 180,
      isAirportTrip: false,
      sort: 'easiest',
    });

    expect(result.metroStatus).toBe('connected');
    expect(result.metroId).toBe('houston');
    expect(result.best).not.toBeNull();
    expect(result.best?.agencyName).toBe('METRO');
  });

  test('Seattle trip still selects a viable lot', () => {
    const result = resolveParkAndRideForTrip({
      origin: 'Lynnwood, WA',
      originLat: 47.8209,
      originLng: -122.2931,
      destination: 'Downtown Seattle, WA',
      destinationLat: 47.6062,
      destinationLng: -122.3321,
      parkingDurationMinutes: 8 * 60,
      isAirportTrip: false,
      sort: 'easiest',
      parkingTotal: 28,
    });

    expect(result.metroStatus).toBe('connected');
    expect(result.best).not.toBeNull();
    expect(result.best?.isRecommended).toBe(true);
  });

  test('unknown metro reports data-not-available copy', () => {
    const result = resolveParkAndRideForTrip({
      origin: 'Spokane, WA',
      originLat: 47.6588,
      originLng: -117.426,
      destination: 'Boise, ID',
      destinationLat: 43.615,
      destinationLng: -116.2023,
      parkingDurationMinutes: 8 * 60,
      isAirportTrip: false,
    });

    expect(result.metroStatus).toBe('data_not_available');
    expect(result.best).toBeNull();
    expect(result.notUsefulReason).toBe(PARK_RIDE_COPY.dataNotAvailable);
  });

  test('seeded metro without useful connection uses no-useful copy', () => {
    const result = resolveParkAndRideForTrip({
      origin: 'Bastrop, TX',
      originLat: 30.1107,
      originLng: -97.315,
      destination: 'Lakeway, TX',
      destinationLat: 30.3637,
      destinationLng: -97.9796,
      parkingDurationMinutes: 8 * 60,
      isAirportTrip: false,
    });

    expect(result.metroStatus).toBe('no_useful_connection');
    expect(result.metroId).toBe('austin');
    expect(result.best).toBeNull();
    expect(result.notUsefulReason).toBe(PARK_RIDE_COPY.foundNotRecommended);
  });
});
