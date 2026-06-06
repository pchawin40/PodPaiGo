import { resolvePricingConfidence } from '../lib/access/pricingLadder';
import { mergeLiveCityParkWhizPricing, resolveCityParkingPricing } from '../lib/parking/cityParkingPricing';
import { findMatchingParkWhizOption } from '../lib/parking/parkWhizMatch';
import {
  estimateDriveMinutesFromStraightLineMiles,
  formatDriveToLotMinutes,
  haversineMiles,
  resolveParkingDriveMinutesDetailed,
} from '../lib/parking/routeMinutes';
import { parkingTimeBreakdown } from '../lib/parking/routeDisplay';
import { dedupeParkingOptions } from '../lib/providers/parking/shared/dedupe';
import { rankRecommendations } from '../lib/domain';
import { resolveTripParkingContext } from '../lib/trip/tripContext';
import type { ParkingOption, TripData } from '../lib/types';

const MONROE_ORIGIN = { lat: 47.8552, lng: -121.9709 };
const PIKE_PLACE_LOT = { lat: 47.6097, lng: -122.3422 };

const CITY_GARAGE: ParkingOption = {
  id: 'laz-garage',
  name: 'LAZ Parking - Pike Place Garage',
  address: '1530 2nd Ave, Seattle, WA 98101',
  type: 'off-airport',
  price: 72,
  priceMin: 48,
  priceMax: 96,
  priceDisplay: 'estimated',
  distance: 12,
  availability: 50,
  trustStatus: 'estimated',
  sourceName: 'Estimated city parking',
  lastUpdated: '2026-01-01T00:00:00.000Z',
  assumptions: [],
  parkingBufferMinutes: 8,
  transferToTerminalMinutes: 6,
  transferType: 'walk',
  lat: PIKE_PLACE_LOT.lat,
  lng: PIKE_PLACE_LOT.lng,
};

const CITY_TRIP: TripData = {
  type: 'general-trip',
  origin: 'Monroe, WA',
  destination: 'Pike Place Market, Seattle, WA',
  destinationKind: 'downtown',
  arrivalDate: '2026-06-01',
  arrivalTime: '10:00',
  parkingDuration: 3 * 60,
};

describe('parking drive time resolution', () => {
  test('Monroe to city garage uses haversine fallback instead of 0m/blank', () => {
    const miles = haversineMiles(
      MONROE_ORIGIN.lat,
      MONROE_ORIGIN.lng,
      PIKE_PLACE_LOT.lat,
      PIKE_PLACE_LOT.lng,
    );

    expect(miles).toBeGreaterThan(20);

    const estimated = estimateDriveMinutesFromStraightLineMiles(miles);
    expect(estimated).toBeGreaterThan(45);

    const breakdown = parkingTimeBreakdown(
      {
        ...CITY_GARAGE,
        distance: 12,
        transferToTerminalMinutes: 6,
      },
      { originLat: MONROE_ORIGIN.lat, originLng: MONROE_ORIGIN.lng },
      'city_destination_trip',
    );

    const drivePart = breakdown.parts.find((part) => part.label === 'Drive to lot');
    expect(drivePart?.minutes).toBeGreaterThan(45);
    expect(drivePart?.display).toMatch(/^~/);
    expect(drivePart?.display).not.toBe('0m');
    expect(drivePart?.display).not.toBe('—');
    expect(breakdown.totalMinutes).toBeGreaterThan(drivePart!.minutes);
  });

  test('does not treat transfer minutes or distance field as origin drive time', () => {
    const resolution = resolveParkingDriveMinutesDetailed(
      {
        ...CITY_GARAGE,
        distance: 12,
        transferToTerminalMinutes: 12,
        duration: 12,
        driveMinutes: 12,
      },
      { originLat: MONROE_ORIGIN.lat, originLng: MONROE_ORIGIN.lng },
    );

    expect(resolution.minutes).toBeGreaterThan(45);
    expect(resolution.source).toBe('haversine-estimated');
    expect(resolution.minutes).not.toBe(12);
  });

  test('google-routes minutes render as exact drive chip text', () => {
    expect(formatDriveToLotMinutes(61, 'google-routes')).toBe('1h 1m');
    expect(formatDriveToLotMinutes(60, 'haversine-estimated')).toBe('~1h');
  });
});

describe('ParkWhiz live pricing', () => {
  const liveParkWhiz: ParkingOption = {
    id: 'parkwhiz-123-abc',
    name: 'Pike Place Market Parking Garage - All Day',
    address: '1531 7th Ave, Seattle, WA 98101',
    type: 'off-airport',
    price: 17.65,
    priceDisplay: 'live',
    priceUnit: 'total',
    pricingConfidence: 'live',
    distance: 0,
    availability: 90,
    trustStatus: 'live',
    sourceName: 'ParkWhiz',
    bookingProvider: 'ParkWhiz',
    sourceLink: 'https://www.parkwhiz.com/p/checkout',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    assumptions: [],
    lat: PIKE_PLACE_LOT.lat,
    lng: PIKE_PLACE_LOT.lng,
  };

  test('city parking prefers ParkWhiz live total over urban fallback', () => {
    const merged = mergeLiveCityParkWhizPricing(CITY_GARAGE, liveParkWhiz);

    expect(merged.price).toBe(17.65);
    expect(merged.priceDisplay).toBe('live');
    expect(merged.pricingConfidence).toBe('live');
    expect(merged.price).toBeLessThan(40);
  });

  test('airport ParkWhiz live quote stays live, not final_on_provider', () => {
    const confidence = resolvePricingConfidence(liveParkWhiz);

    expect(confidence).toBe('live');
  });

  test('dedupe keeps live ParkWhiz option over estimated duplicate', () => {
    const deduped = dedupeParkingOptions([
      {
        ...CITY_GARAGE,
        name: 'Pike Place Market Parking Garage',
        price: 72,
        priceDisplay: 'estimated',
      },
      {
        ...liveParkWhiz,
        name: 'Pike Place Market Parking Garage',
      },
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].price).toBe(17.65);
    expect(deduped[0].priceDisplay).toBe('live');
  });

  test('ParkWhiz matcher links LAZ/Pike Place google place to live quote', () => {
    const match = findMatchingParkWhizOption(CITY_GARAGE, [liveParkWhiz]);
    expect(match?.id).toBe(liveParkWhiz.id);
  });
});

describe('city parking labels and baselines', () => {
  test('city trip context avoids airport reason labels in domain path', () => {
    expect(resolveTripParkingContext(CITY_TRIP)).toBe('city_destination_trip');

    const ranked = rankRecommendations(
      CITY_TRIP,
      [CITY_GARAGE],
      [],
      [],
      {
        destination: CITY_TRIP.destination,
        waitTime: 0,
        status: 'estimated',
        trustStatus: 'estimated',
        sourceName: 'Test',
        assumptions: [],
      },
    );

    const parkingRank = ranked.find((item) => item.type === 'parking');
    const reasons = parkingRank?.reasons.join(' ') || '';

    expect(reasons).not.toMatch(/Direct terminal access/i);
    expect(reasons).not.toMatch(/Shuttle transfer included/i);
    expect(reasons).toMatch(/Close to destination|Short walk|Covered garage/i);
  });

  test('Pike Place official baseline applies only to Pike Place garage', () => {
    const pikePricing = resolveCityParkingPricing({
      name: 'Pike Place Market Parking Garage',
      address: '1531 7th Ave, Seattle, WA 98101',
      durationMinutes: 3 * 60,
      covered: true,
    });

    const lazPricing = resolveCityParkingPricing({
      name: 'LAZ Parking - Downtown Seattle',
      address: '1201 3rd Ave, Seattle, WA 98101',
      durationMinutes: 3 * 60,
      covered: true,
    });

    expect(pikePricing.pricingConfidence).toBe('official');
    expect(lazPricing.pricingConfidence).toBe('estimated');
    expect(lazPricing.price).toBeGreaterThanOrEqual(18);
    expect(lazPricing.price).toBeLessThanOrEqual(72);
  });
});
