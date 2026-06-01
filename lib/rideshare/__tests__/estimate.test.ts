import {
  RIDESHARE_ESTIMATE_DISCLAIMER,
  buildRideshareEstimateOptions,
  estimateFareRange,
  timeOfDayMultiplier,
} from '../estimate';
import type { TrafficEstimate } from '../../types';

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
});
