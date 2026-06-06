import {
  computePrimaryAirportPlan,
  deriveRecommendedParkingCheckIn,
  hasUserProvidedParkingCheckIn,
  resolveEffectiveDriveMinutes,
} from '../airportLeaveBy';
import type { TripData } from '../../types';

const baseTrip: TripData = {
  type: 'one-way-departure',
  origin: 'Seattle, WA',
  destination: 'SEA Airport',
  departureDate: '2026-06-01',
  departureTime: '09:00',
  airportCode: 'SEA',
  transportAvailability: 'all',
  bagPlan: 'none',
  checkingBags: false,
  securityOption: 'standard',
  flightType: 'domestic',
  cabin: 'economy',
};

const timing = {
  totalMinutes: 72,
  driveMinutes: 45,
  parkingBufferMinutes: 10,
  shuttleWalkMinutes: 17,
};

describe('airportLeaveBy', () => {
  test('user parking check-in drives leave-by from drive time', () => {
    const trip: TripData = {
      ...baseTrip,
      parkingCheckInDate: '2026-06-01',
      parkingCheckInTime: '06:00',
      parkingCheckInUserOverride: true,
    };

    const plan = computePrimaryAirportPlan({
      intent: 'flying-out',
      tripData: trip,
      selectedParkingName: 'WallyPark',
      selectedTiming: timing,
      fallbackLeaveByTime: '07:49',
      airportReadyBufferMinutes: 75,
      securityTargetTime: '07:45',
    });

    expect(plan.leaveByTime).toBe('05:10');
    expect(plan.basisText).toContain('6:00 AM parking check-in');
    expect(plan.parkingCheckInSource).toBe('user');
  });

  test('derived parking check-in when user has not overridden', () => {
    const trip: TripData = {
      ...baseTrip,
      parkingCheckInDate: '2026-06-01',
      parkingCheckInTime: '09:00',
    };

    expect(hasUserProvidedParkingCheckIn(trip)).toBe(false);

    const recommended = deriveRecommendedParkingCheckIn({
      tripData: trip,
      timing,
      airportReadyBufferMinutes: 75,
    });

    expect(recommended).toBe('07:18');

    const plan = computePrimaryAirportPlan({
      intent: 'flying-out',
      tripData: trip,
      selectedParkingName: 'WallyPark',
      selectedTiming: timing,
      fallbackLeaveByTime: '07:49',
      airportReadyBufferMinutes: 75,
      securityTargetTime: '07:45',
    });

    expect(plan.leaveByTime).toBe('06:33');
    expect(plan.basisText).toContain('PodPaiGo recommended parking check-in');
    expect(plan.parkingCheckInSource).toBe('recommended');
  });

  test('hero, card, and timeline inputs agree on leave-by', () => {
    const trip: TripData = {
      ...baseTrip,
      parkingCheckInDate: '2026-06-01',
      parkingCheckInTime: '06:00',
      parkingCheckInUserOverride: true,
    };

    const plan = computePrimaryAirportPlan({
      intent: 'flying-out',
      tripData: trip,
      selectedParkingName: 'WallyPark',
      selectedTiming: timing,
      fallbackLeaveByTime: '07:49',
      airportReadyBufferMinutes: 75,
      securityTargetTime: '07:45',
    });

    expect(plan.leaveByTime).toBe('05:10');
    expect(plan.travelMinutes).toBe(45);
    expect(plan.parkingCheckInTime).toBe('06:00');
    expect(plan.leaveByTime).not.toBe('07:49');
  });

  test('resolveEffectiveDriveMinutes falls back from total timing parts', () => {
    expect(
      resolveEffectiveDriveMinutes({
        totalMinutes: 72,
        driveMinutes: null,
        parkingBufferMinutes: 10,
        shuttleWalkMinutes: 17,
      }),
    ).toBe(45);
  });
});
