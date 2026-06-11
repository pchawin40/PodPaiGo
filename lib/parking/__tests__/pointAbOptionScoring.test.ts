import type { ParkingOption, RideshareOption, TransitOption, TripData } from '../../types';
import {
  buildPointAbOptionScoreBreakdowns,
  optionScoreModeToPointAbKey,
  selectCanonicalCheapest,
  selectCanonicalFastest,
  selectCanonicalPointAbWinner,
} from '../pointAbOptionScoring';

const monroeToBrightonJones: TripData = {
  type: 'general-trip',
  origin: 'Monroe, WA',
  originLat: 47.8554,
  originLng: -121.9709,
  destination: 'Brighton Jones, 2030 1st Ave, Seattle, WA',
  destinationName: 'Brighton Jones',
  destinationKind: 'office',
  destinationLat: 47.6114,
  destinationLng: -122.3453,
  arrivalDate: '2026-06-08',
  arrivalTime: '11:00',
  parkingDuration: 120,
  transportAvailability: 'all',
};

const paidGarage: ParkingOption = {
  id: 'brighton-jones-paid-garage',
  name: 'Market Place Garage',
  type: 'off-airport',
  price: 12,
  priceUnit: 'total',
  distance: 0.2,
  originToParkingMinutes: 45,
  routeToParkingMinutes: 45,
  parkingBufferMinutes: 8,
  walkingMinutes: 5,
  availability: 80,
  trustStatus: 'live',
  sourceName: 'Test parking',
  bookingProvider: 'ParkWhiz',
  parkingCategory: 'garage_paid',
  googleParkingOptions: { paidGarageParking: true },
  lastUpdated: '2026-06-01T00:00:00.000Z',
  assumptions: [],
};

const rideshare: RideshareOption = {
  id: 'uber',
  name: 'Uber',
  price: 35,
  duration: 43,
  driveMinutes: 38,
  pickupWaitMinutes: 5,
  totalOptionMinutes: 43,
  availability: 88,
  trustStatus: 'estimated',
  priceDisplay: 'check-live',
  rideshareEstimateConfidence: 'unavailable',
  sourceName: 'Uber',
  sourceLink: 'https://m.uber.com/ul/',
  lastUpdated: '2026-06-01T00:00:00.000Z',
  assumptions: ['Open app for live price.'],
};

const transit: TransitOption = {
  id: 'transit',
  name: 'Sound Transit / King County Metro',
  price: 2.75,
  duration: 74,
  frequency: 15,
  availability: 70,
  trustStatus: 'verified-source',
  sourceName: 'Transit',
  lastUpdated: '2026-06-01T00:00:00.000Z',
  assumptions: [],
};

describe('point A to B canonical option scoring', () => {
  test('Monroe to Brighton Jones picks winners from one canonical breakdown set', () => {
    const scores = buildPointAbOptionScoreBreakdowns({
      tripData: monroeToBrightonJones,
      destinationLabel: monroeToBrightonJones.destination,
      parkingOptions: [paidGarage],
      rideshareOptions: [rideshare],
      transitOptions: [transit],
      driveMinutes: 38,
      parkingDurationMinutes: 120,
      weatherRisk: 'low',
    });

    expect(scores.map((score) => score.mode)).toEqual(
      expect.arrayContaining(['parking', 'street', 'rideshare', 'transit', 'park_ride']),
    );

    const fastest = selectCanonicalFastest({ scores });
    const cheapest = selectCanonicalCheapest({ scores });
    const easiest = selectCanonicalPointAbWinner({ scores, sort: 'easiest' });

    expect(fastest?.mode).toBe('rideshare');
    expect(fastest?.totalTimeMinutes).toBe(43);
    expect(cheapest?.mode).toBe('transit');
    expect(cheapest?.totalCostCents).toBe(275);
    expect(easiest?.mode).toBe('rideshare');
    expect(optionScoreModeToPointAbKey(fastest!.mode)).toBe('rideshare');

    const street = scores.find((score) => score.mode === 'street');
    const ride = scores.find((score) => score.mode === 'rideshare');
    expect(street).toMatchObject({
      driveMinutes: 38,
      parkingBufferMinutes: 7,
      walkMinutes: 4,
      totalTimeMinutes: 49,
    });
    expect(street?.penalties.join(' ')).toMatch(/Availability is not guaranteed/i);
    expect(street!.frictionScore).toBeGreaterThan(ride!.frictionScore);
  });
});
