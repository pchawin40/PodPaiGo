import type { TransitOption, TripData } from '../../types';
import { assessTransitPracticality } from '../transitPracticality';

const estimatedTransit: TransitOption = {
  id: 'transit-estimate',
  name: 'Estimated transit',
  price: 4,
  duration: 63,
  frequency: 15,
  availability: 80,
  trustStatus: 'estimated',
  routeTrustStatus: 'estimated',
  sourceName: 'Google Maps transit directions',
  lastUpdated: '2026-06-01T00:00:00Z',
  assumptions: [
    'Transit time estimated from entered origin and destination.',
    'Open transit directions for exact route.',
  ],
};

const intercityTrip: TripData = {
  type: 'general-trip',
  origin: 'Monroe, WA',
  destination: 'Bend, Oregon',
  destinationKind: 'general',
  originLat: 47.847,
  originLng: -121.978,
  destinationLat: 44.0582,
  destinationLng: -121.3153,
  transportAvailability: 'all',
} as TripData;

describe('assessTransitPracticality.suppressDuration', () => {
  test('suppresses a fabricated short transit duration for a long-distance estimated trip', () => {
    const assessment = assessTransitPracticality({
      tripData: intercityTrip,
      destinationLabel: 'Bend, Oregon',
      transit: estimatedTransit,
      transitDuration: 63,
      driveMinutes: 310,
    });

    expect(assessment.isLongDistanceTrip).toBe(true);
    expect(assessment.primaryEligible).toBe(false);
    expect(assessment.suppressDuration).toBe(true);
  });

  test('does not suppress duration for an explicit transit preference', () => {
    const assessment = assessTransitPracticality({
      tripData: { ...intercityTrip, transportAvailability: 'transit' } as TripData,
      destinationLabel: 'Bend, Oregon',
      transit: estimatedTransit,
      transitDuration: 63,
      driveMinutes: 310,
    });

    expect(assessment.suppressDuration).toBe(false);
  });

  test('does not suppress duration for a short city trip', () => {
    const assessment = assessTransitPracticality({
      tripData: {
        type: 'general-trip',
        origin: 'Capitol Hill, Seattle, WA',
        destination: 'Downtown Bellevue, WA',
        destinationKind: 'downtown',
        transportAvailability: 'all',
      } as TripData,
      destinationLabel: 'Downtown Bellevue, WA',
      transit: { ...estimatedTransit, duration: 20, trustStatus: 'verified-source' },
      transitDuration: 20,
      driveMinutes: 60,
    });

    expect(assessment.isLongDistanceTrip).toBe(false);
    expect(assessment.suppressDuration).toBe(false);
  });

  test('does not suppress an airport transit estimate', () => {
    const assessment = assessTransitPracticality({
      tripData: {
        type: 'one-way-departure',
        origin: 'Seattle, WA',
        destination: 'Seattle-Tacoma International Airport',
        destinationKind: 'airport',
        airportCode: 'SEA',
        transportAvailability: 'all',
      } as TripData,
      destinationLabel: 'Seattle-Tacoma International Airport',
      transit: { ...estimatedTransit, duration: 90 },
      transitDuration: 90,
      driveMinutes: 45,
    });

    expect(assessment.isAirportTrip).toBe(true);
    expect(assessment.suppressDuration).toBe(false);
  });
});
