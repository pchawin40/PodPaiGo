import type { TripData } from '../types';
import {
  resolveScheduledTripDateTime,
  resolveTargetTerminalArrivalIso,
  resolveTripRouteTiming,
  shouldUseNowForRouting,
  toLocalIso,
} from '../routeTiming';

const AIRPORT_TRIP: TripData = {
  type: 'one-way-departure',
  origin: 'Monroe, WA',
  destination: 'Seattle-Tacoma International Airport',
  destinationKind: 'airport',
  airportCode: 'SEA',
  departureDate: '2026-12-01',
  departureTime: '18:00',
  bagPlan: 'checked',
  checkingBags: true,
  securityOption: 'standard',
  flightType: 'domestic',
  cabin: 'economy',
};

describe('routeTiming', () => {
  test('future airport trip routes do not use now', () => {
    const now = new Date('2026-06-01T10:00:00');
    const timing = resolveTripRouteTiming(AIRPORT_TRIP, { now });

    expect(timing.usesNow).toBe(false);
    expect(timing.timingSource).toBe('target_arrival_derived');
    expect(timing.mainRouteDepartureIso).not.toBe(toLocalIso(now));
    expect(new Date(timing.mainRouteDepartureIso).getTime()).toBeLessThan(
      new Date('2026-12-01T18:00:00').getTime(),
    );
  });

  test('target terminal arrival subtracts airport and security buffer', () => {
    const target = resolveTargetTerminalArrivalIso(AIRPORT_TRIP);
    expect(target).toBeTruthy();
    expect(new Date(target!).getTime()).toBeLessThan(
      new Date('2026-12-01T18:00:00').getTime(),
    );
  });

  test('general point A-to-B arrival derives a departure time instead of using now', () => {
    const now = new Date('2026-06-01T10:00:00');
    const trip: TripData = {
      type: 'general-trip',
      origin: 'Home, Seattle, WA',
      destination: 'Costco Everett',
      arrivalDate: '2026-06-01',
      arrivalTime: '09:00',
    };

    expect(shouldUseNowForRouting(resolveScheduledTripDateTime(trip)!, now)).toBe(true);

    const timing = resolveTripRouteTiming(trip, { now });
    expect(timing.usesNow).toBe(false);
    expect(timing.timingSource).toBe('target_arrival_derived');
    expect(timing.mainRouteDepartureIso).toContain('T08:30:00');
  });

  test('Quick Go keeps near-current routing behavior', () => {
    const now = new Date('2026-06-01T10:00:00');
    const trip: TripData = {
      type: 'general-trip',
      origin: 'Home, Seattle, WA',
      destination: 'Costco Everett',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:05',
      tripMode: 'quick-go',
    };

    const timing = resolveTripRouteTiming(trip, { now });
    expect(timing.usesNow).toBe(true);
    expect(timing.timingSource).toBe('now');
  });

  test('leave-by time overrides derived route departure', () => {
    const timing = resolveTripRouteTiming(AIRPORT_TRIP, {
      leaveByTime: '14:30',
      now: new Date('2026-06-01T10:00:00'),
    });

    expect(timing.timingSource).toBe('leave_by');
    expect(timing.mainRouteDepartureIso).toContain('T14:30:00');
    expect(timing.parkingRouteDepartureIso).toBe(timing.mainRouteDepartureIso);
  });
});
