import {
  buildParkAndRideAccessFromParking,
  buildParkAndRideAccessOptionsFromParking,
  DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES,
  isOvernightAirportParkingTrip,
  isParkAndRideRecommendedForTrip,
  PARK_AND_RIDE_UI_COPY,
  partitionParkAndRideAccessOptions,
} from '../lib/access/parkAndRideAccess';
import { buildSeaCuratedAccessOptions } from '../lib/access/buildAccessOptions';
import { rankAccessOptions } from '../lib/access/rankAccessOptions';
import type { ParkingOption, TripData } from '../lib/types';

function baseParking(overrides: Partial<ParkingOption> = {}): ParkingOption {
  return {
    id: 'narrows-park-ride',
    name: 'Narrows Park & Ride',
    type: 'park-and-ride',
    transferType: 'transit',
    price: 12,
    priceUnit: 'per-day',
    priceDisplay: 'estimated',
    distance: 20,
    availability: 50,
    trustStatus: 'estimated',
    sourceName: 'Google Places',
    lastUpdated: '2026-05-30T00:00:00.000Z',
    assumptions: [],
    parkAndRideRules: DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES,
    ...overrides,
  };
}

function sevenDayTrip(): TripData {
  return {
    type: 'round-trip',
    origin: 'Monroe, WA',
    destination: 'Seattle-Tacoma International Airport',
    airportCode: 'SEA',
    departureDate: '2026-06-01',
    departureTime: '08:00',
    returnDate: '2026-06-08',
    returnTime: '18:00',
  };
}

function sameDayTrip(): TripData {
  return {
    type: 'one-way-departure',
    origin: 'Seattle, WA',
    destination: 'Seattle-Tacoma International Airport',
    airportCode: 'SEA',
    departureDate: '2026-06-01',
    departureTime: '08:00',
    parkingDuration: 480,
  };
}

describe('parkAndRideAccess overnight rules', () => {
  test('detects overnight airport parking at 18+ hours', () => {
    expect(isOvernightAirportParkingTrip(sevenDayTrip())).toBe(true);
    expect(isOvernightAirportParkingTrip(sameDayTrip())).toBe(false);
  });

  test('generic Google park-and-ride is not recommended for multi-day trips', () => {
    const parking = baseParking();
    const access = buildParkAndRideAccessFromParking(parking, sevenDayTrip(), 'SEA');

    expect(access.recommendedForTrip).toBe(false);
    expect(access.notRecommendedReason).toBe(
      PARK_AND_RIDE_UI_COPY.notRecommendedOvernight,
    );
    expect(access.pricing.displayPrimary).toBe(
      PARK_AND_RIDE_UI_COPY.notRecommendedOvernight,
    );
    expect(access.pricing.displayPrimary).not.toMatch(/\$\d+–\$\d+ total/);
    expect(access.pricing.breakdown.parking).toBeUndefined();
    expect(access.parkAndRideRules).toEqual(DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES);
  });

  test('same-day trips can show park-and-ride with estimated total and caveat', () => {
    const parking = baseParking();
    const access = buildParkAndRideAccessFromParking(parking, sameDayTrip(), 'SEA');

    expect(access.recommendedForTrip).toBe(true);
    expect(access.pricing.displayPrimary).toMatch(/^Estimated \$/);
    expect(access.pricing.breakdown.parking).toBeDefined();
    expect(access.overnightCaveat).toContain(PARK_AND_RIDE_UI_COPY.sameDayCaveat);
  });

  test('partition separates recommended from overnight-not-recommended options', () => {
    const options = buildParkAndRideAccessOptionsFromParking(
      [
        baseParking({ id: 'narrows', name: 'Narrows Park & Ride' }),
        baseParking({ id: 'issaquah', name: 'Issaquah Highlands Park & Ride' }),
      ],
      sevenDayTrip(),
      'SEA',
    );

    const { recommended, notRecommendedForOvernight } =
      partitionParkAndRideAccessOptions(options, true);

    expect(recommended).toHaveLength(0);
    expect(notRecommendedForOvernight).toHaveLength(2);
  });

  test('confirmed overnight rules allow recommendation and multi-day pricing', () => {
    const parking = baseParking({
      parkAndRideRules: {
        overnightAllowed: true,
        ruleConfidence: 'confirmed',
        ruleNote: 'Overnight parking allowed up to 72 hours.',
        maxParkingHours: 72,
      },
    });

    expect(isParkAndRideRecommendedForTrip(parking.parkAndRideRules!, sevenDayTrip())).toBe(
      true,
    );

    const access = buildParkAndRideAccessFromParking(parking, sevenDayTrip(), 'SEA');
    expect(access.recommendedForTrip).toBe(true);
    expect(access.pricing.breakdown.parking).toBeDefined();
  });

  test('rankAccessOptions deprioritizes not-recommended park-and-ride options', () => {
    const recommended = buildParkAndRideAccessFromParking(
      baseParking({ id: 'same-day', name: 'Same Day Lot' }),
      sameDayTrip(),
      'SEA',
    );
    const notRecommended = buildParkAndRideAccessFromParking(
      baseParking({ id: 'overnight', name: 'Narrows Park & Ride' }),
      sevenDayTrip(),
      'SEA',
    );

    const ranked = rankAccessOptions([notRecommended, recommended], sameDayTrip());
    expect(ranked.topPickId).toBe(recommended.id);
    expect(ranked.options[ranked.options.length - 1]?.recommendedForTrip).toBe(false);
  });
});

describe('curated Northgate park-and-ride rules', () => {
  const previousEnv = process.env.SEA_CURATED_ACCESS;

  beforeEach(() => {
    process.env.SEA_CURATED_ACCESS = '1';
  });

  afterEach(() => {
    process.env.SEA_CURATED_ACCESS = previousEnv;
  });

  test('Northgate keeps rule note and avoids multi-day parking totals when rules are not confirmed', () => {
    const options = buildSeaCuratedAccessOptions(sevenDayTrip(), 'SEA');
    const northgate = options.find((option) => option.id === 'sea-northgate-park-link');

    expect(northgate).toBeDefined();
    expect(northgate?.parkAndRideRules?.ruleConfidence).toBe('estimated');
    expect(northgate?.parkAndRideRules?.ruleNote).toContain('overnight');
    expect(northgate?.pricing.displayPrimary).toBe(
      PARK_AND_RIDE_UI_COPY.notRecommendedOvernight,
    );
    expect(northgate?.pricing.breakdown.parking).toBeUndefined();
    expect(northgate?.isHiddenGem).toBe(true);
  });
});
