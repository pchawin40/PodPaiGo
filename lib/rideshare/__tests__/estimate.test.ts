import {
  RIDESHARE_ESTIMATE_DISCLAIMER,
  buildRideshareEstimateOptions,
  estimateFareRange,
  formatRidesharePriceDisplay,
  reconcileRideshareDriveTiming,
  timeOfDayMultiplier,
} from '../estimate';
import type { RideshareOption, TrafficEstimate } from '../../types';

const baseRoute: TrafficEstimate = {
  route: 'Capitol Hill -> SEA',
  duration: 35,
  distanceMeters: 24140,
  congestion: 'medium',
  trustStatus: 'live',
  sourceName: 'Google Routes',
  lastUpdated: '2026-06-01T08:00:00.000Z',
  assumptions: [],
};

const baseArgs = {
  origin: 'Capitol Hill, Seattle, WA',
  destination: 'Seattle-Tacoma International Airport (SEA)',
  routeEstimate: baseRoute,
  directionsUrl: 'https://maps.google.com',
  uberUrl: 'https://m.uber.com',
  lyftUrl: 'https://lyft.com/ride',
  taxiSearchUrl: 'https://maps.google.com/search/taxi',
  airportCode: 'SEA',
};

const uberProfile = {
  id: 'uber',
  name: 'UberX',
  providerKind: 'uber' as const,
  tier: 'standard' as const,
  baseFare: 4.25,
  perMile: 2.15,
  perMinute: 0.44,
  serviceFee: 8.75,
  airportSurcharge: 4,
  airportPickupFee: 3,
  airportDropoffFee: 3,
  minimumFare: 18,
  rangePercent: 0.38,
  pickupWaitMinutes: 5,
  availability: 85,
};

describe('rideshare estimate v1', () => {
  test('applies a higher peak-time multiplier than off-peak', () => {
    const peak = timeOfDayMultiplier('2026-06-02T08:00:00');
    const offPeak = timeOfDayMultiplier('2026-06-02T12:00:00');

    expect(peak.multiplier).toBeGreaterThan(offPeak.multiplier);

    const peakFare = estimateFareRange({
      profile: uberProfile,
      durationMinutes: 35,
      distanceMiles: 15,
      congestion: 'medium',
      confidence: 'live-route-estimate',
      departureDateTime: '2026-06-02T08:00:00',
    });

    const offPeakFare = estimateFareRange({
      profile: uberProfile,
      durationMinutes: 35,
      distanceMiles: 15,
      congestion: 'medium',
      confidence: 'live-route-estimate',
      departureDateTime: '2026-06-02T12:00:00',
    });

    expect(peakFare.midpoint).toBeGreaterThan(offPeakFare.midpoint);
  });

  test('includes airport surcharge and pickup/dropoff fees in the fare model', () => {
    const withAirportFees = estimateFareRange({
      profile: uberProfile,
      durationMinutes: 20,
      distanceMiles: 8,
      congestion: 'low',
      confidence: 'live-route-estimate',
    });

    const withoutAirportFees = estimateFareRange({
      profile: {
        ...uberProfile,
        airportSurcharge: 0,
        airportPickupFee: 0,
        airportDropoffFee: 0,
      },
      durationMinutes: 20,
      distanceMiles: 8,
      congestion: 'low',
      confidence: 'live-route-estimate',
    });

    expect(withAirportFees.midpoint).toBeGreaterThan(withoutAirportFees.midpoint);
  });

  test('returns estimates when route data is unavailable using distance-band fallback', () => {
    const options = buildRideshareEstimateOptions({
      ...baseArgs,
      routeEstimate: {
        ...baseRoute,
        duration: 0,
        distanceMeters: undefined,
        routeUnavailable: true,
        routeUnavailableReason: 'Route unavailable from this origin to the airport area.',
      },
    });

    expect(options.length).toBeGreaterThan(0);
    expect(options[0].priceMin).toBeGreaterThan(0);
    expect(options[0].priceMax).toBeGreaterThan(options[0].priceMin!);
    expect(options[0].rideshareEstimateConfidence).toBe('baseline-estimate');
    // Distance-band fallback is not a confirmed origin→destination route.
    expect(options[0].routeConfirmed).toBe(false);
  });

  test('marks options from a real route as route-confirmed', () => {
    const options = buildRideshareEstimateOptions(baseArgs);
    expect(options.every((option) => option.routeConfirmed === true)).toBe(true);
  });

  describe('reconcileRideshareDriveTiming', () => {
    const fallbackBandRide: RideshareOption = {
      id: 'uber',
      name: 'UberX',
      price: 90,
      duration: 77,
      driveMinutes: 72,
      pickupWaitMinutes: 5,
      totalOptionMinutes: 77,
      routeConfirmed: false,
      availability: 85,
      trustStatus: 'estimated',
      sourceName: 'Uber estimate model',
      lastUpdated: '2026-06-01T00:00:00Z',
      assumptions: ['Route data was unavailable; estimate uses a typical airport distance band.'],
    };

    test('re-bases a too-short fallback drive leg on the main drive route', () => {
      const reconciled = reconcileRideshareDriveTiming(fallbackBandRide, 374);

      expect(reconciled.driveMinutes).toBe(374);
      expect(reconciled.totalOptionMinutes).toBe(379);
      expect(reconciled.duration).toBe(379);
      expect(reconciled.timingDerivedFromDrive).toBe(true);
      expect(reconciled.timingBreakdown).toMatchObject({
        driveMinutes: 374,
        pickupWaitMinutes: 5,
        totalOptionMinutes: 379,
      });
    });

    test('never lowers the price during timing reconciliation', () => {
      const reconciled = reconcileRideshareDriveTiming(fallbackBandRide, 374);
      expect(reconciled.price).toBe(fallbackBandRide.price);
    });

    test('leaves an option that already drives at least as long as the main route', () => {
      const realRoute: RideshareOption = {
        ...fallbackBandRide,
        driveMinutes: 30,
        totalOptionMinutes: 35,
        duration: 35,
        routeConfirmed: true,
      };
      expect(reconcileRideshareDriveTiming(realRoute, 28)).toBe(realRoute);
    });

    test('returns the option unchanged when no main drive route is known', () => {
      expect(reconcileRideshareDriveTiming(fallbackBandRide, null)).toBe(fallbackBandRide);
      expect(reconcileRideshareDriveTiming(fallbackBandRide, 0)).toBe(fallbackBandRide);
    });

    test('doubles the re-based total for round-trip rideshare scope', () => {
      const roundTrip: RideshareOption = {
        ...fallbackBandRide,
        rideshareTripScope: 'round-trip',
      };
      const reconciled = reconcileRideshareDriveTiming(roundTrip, 374);
      expect(reconciled.totalOptionMinutes).toBe((374 + 5) * 2);
    });
  });

  test('does not advertise live Uber/Lyft pricing in generated copy', () => {
    const options = buildRideshareEstimateOptions({
      ...baseArgs,
      departureDateTime: '2026-06-02T08:00:00',
    });

    const serialized = JSON.stringify(options).toLowerCase();

    expect(serialized).not.toMatch(/live uber price/);
    expect(serialized).not.toMatch(/live lyft price/);
    expect(serialized).not.toMatch(/live provider quote/);
    expect(serialized).toContain('not a live uber/lyft quote');
    expect(options.every((option) => option.priceDisplay === 'estimated')).toBe(true);
    expect(options.every((option) => typeof option.priceMin === 'number')).toBe(true);
    expect(options.every((option) => typeof option.priceMax === 'number')).toBe(true);
    expect(options.every((option) => option.priceNote?.includes('Estimated'))).toBe(true);
    expect(options.every((option) => option.priceNote?.includes('rideshare range'))).toBe(true);
  });

  test('changes estimates when distance and duration increase', () => {
    const shortTrip = buildRideshareEstimateOptions({
      ...baseArgs,
      routeEstimate: {
        ...baseRoute,
        duration: 20,
        distanceMeters: 12000,
      },
    })[0];

    const longTrip = buildRideshareEstimateOptions({
      ...baseArgs,
      routeEstimate: {
        ...baseRoute,
        duration: 55,
        distanceMeters: 50000,
        congestion: 'high',
      },
    })[0];

    expect(longTrip.priceMin).toBeGreaterThan(shortTrip.priceMin!);
    expect(longTrip.priceMax).toBeGreaterThan(shortTrip.priceMax!);
  });

  test('exports a stable disclaimer constant for UI reuse', () => {
    expect(RIDESHARE_ESTIMATE_DISCLAIMER).toBe('Not a live Uber/Lyft quote.');
  });

  test('provider-only rideshare links ask users to open the app for live price', () => {
    for (const input of [
      { priceDisplay: 'check-live' as const },
      { priceDisplay: 'check-live' as const, price: 35 },
    ]) {
      expect(formatRidesharePriceDisplay(input)).toEqual({
        primary: 'Open app for live price',
        secondary: 'PodPaiGo does not have a live Uber/Lyft quote.',
      });
    }

    expect(formatRidesharePriceDisplay({ rideshareEstimateConfidence: 'unavailable' })).toEqual({
      primary: 'Fare estimate unavailable',
      secondary: 'Open the rideshare app for current pricing.',
    });
  });
});
