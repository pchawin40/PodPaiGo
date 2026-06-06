import {
  estimatePikePlaceMarketPrice,
  isPikePlaceMarketGarage,
  resolveCityParkingPricing,
} from '../lib/parking/cityParkingPricing';
import {
  getParkingTransferLinkLabel,
  getParkingVisualBadgeLabel,
} from '../lib/parking/parkingLabels';
import { parkingRouteLinks, parkingTimeBreakdown } from '../lib/parking/routeDisplay';
import { resolveTripParkingContext } from '../lib/trip/tripContext';
import { buildCuratedDestinationParkingHints } from '../lib/providers/parking/providers/googlePlaces/destinationSearch';
import type { ParkingOption, TripData } from '../lib/types';

const PIKE_PLACE_GARAGE: ParkingOption = {
  id: 'pike-place-garage',
  name: 'Pike Place Market Parking Garage',
  address: '1531 7th Ave, Seattle, WA 98101',
  type: 'official',
  price: 0,
  distance: 10,
  availability: 50,
  trustStatus: 'estimated',
  sourceName: 'Official rate card',
  lastUpdated: '2026-01-01T00:00:00.000Z',
  assumptions: [],
  parkingBufferMinutes: 8,
  transferToTerminalMinutes: 6,
  transferType: 'walk',
  routeDestination: '1531 7th Ave, Seattle, WA 98101',
};

const CITY_TRIP: TripData = {
  type: 'general-trip',
  origin: 'Home, Seattle, WA',
  destination: 'Pike Place Market, Seattle, WA',
  destinationKind: 'downtown',
  arrivalDate: '2026-06-01',
  arrivalTime: '10:00',
  parkingDuration: 3 * 60,
};

const AIRPORT_TRIP: TripData = {
  type: 'one-way-departure',
  origin: 'Monroe, WA',
  destination: 'Seattle-Tacoma International Airport',
  destinationKind: 'airport',
  airportCode: 'SEA',
  departureDate: '2026-06-01',
  departureTime: '06:00',
};

describe('city destination parking context', () => {
  test('detects city vs airport trip context', () => {
    expect(resolveTripParkingContext(CITY_TRIP)).toBe('city_destination_trip');
    expect(resolveTripParkingContext(AIRPORT_TRIP)).toBe('airport_trip');
  });

  test('Pike Place garage uses official baseline instead of $1–$7/day', () => {
    expect(isPikePlaceMarketGarage(PIKE_PLACE_GARAGE.name, PIKE_PLACE_GARAGE.address)).toBe(true);

    const pricing = resolveCityParkingPricing({
      name: PIKE_PLACE_GARAGE.name,
      address: PIKE_PLACE_GARAGE.address,
      durationMinutes: 3 * 60,
      covered: true,
    });

    expect(pricing.price).toBeGreaterThanOrEqual(24);
    expect(pricing.price).toBeLessThanOrEqual(40);
    expect(pricing.priceMin).toBeGreaterThanOrEqual(8);
    expect(pricing.pricingConfidence).toBe('official');
    expect(pricing.priceNote).toMatch(/Pike Place/i);
  });

  test('Pike Place tier pricing follows official hourly brackets', () => {
    expect(estimatePikePlaceMarketPrice(45)).toBe(8);
    expect(estimatePikePlaceMarketPrice(90)).toBe(16);
    expect(estimatePikePlaceMarketPrice(5 * 60)).toBe(36);
  });

  test('Pike Place active rate exposes eligible early bird special and warnings', () => {
    const pricing = resolveCityParkingPricing({
      name: 'Pike Place Market Parking Garage',
      address: '1531 Western Ave, Seattle, WA 98101',
      durationMinutes: 8 * 60,
      covered: true,
      arrivalDate: '2026-06-01',
      arrivalTime: '08:30',
    });

    expect(pricing.price).toBe(17);
    expect(pricing.activeRate?.rateType).toBe('early_bird');
    expect(pricing.priceNote).toMatch(/Early bird/i);
    expect(pricing.assumptions?.join(' ')).toMatch(/Event rates may override/i);
  });

  test('city garage badge is not labeled Airport Garage', () => {
    const label = getParkingVisualBadgeLabel(PIKE_PLACE_GARAGE, 'city_destination_trip');
    expect(label).not.toMatch(/Airport/i);
    expect(label).toMatch(/garage/i);
  });

  test('city parking time includes drive, park/check-in, and walk only', () => {
    const option: ParkingOption = {
      ...PIKE_PLACE_GARAGE,
      originToParkingMinutes: 20,
    };

    const breakdown = parkingTimeBreakdown(option, undefined, 'city_destination_trip');

    expect(breakdown.parts.map((part) => part.label)).toEqual([
      'Drive to lot',
      'Park/check-in',
      'Walk to destination',
    ]);
    expect(breakdown.totalMinutes).toBeGreaterThanOrEqual(20 + 8 + 6);
    expect(breakdown.parts.some((part) => /shuttle|airport|terminal/i.test(part.label))).toBe(false);
  });

  test('airport parking time still includes terminal transfer pieces', () => {
    const option: ParkingOption = {
      ...PIKE_PLACE_GARAGE,
      originToParkingMinutes: 20,
      transferType: 'shuttle',
      shuttleWaitMinutes: 8,
      transferToTerminalMinutes: 12,
      walkingMinutes: 3,
      bufferRiskMinutes: 5,
    };

    const breakdown = parkingTimeBreakdown(option, undefined, 'airport_trip');
    const labels = breakdown.parts.map((part) => part.label);

    expect(labels).toContain('Shuttle wait');
    expect(labels).toContain('Shuttle');
    expect(labels).toContain('Walk inside airport');
  });

  test('city trip route links expose walk to destination, not parking to terminal', () => {
    const links = parkingRouteLinks(PIKE_PLACE_GARAGE, CITY_TRIP);

    expect(links.parkingToAirportUrl).toBeNull();
    expect(links.parkingToDestinationUrl).toContain('google.com/maps/dir');
    expect(getParkingTransferLinkLabel('city_destination_trip')).toBe('Walk to destination');
  });

  test('airport trip route links still expose parking to terminal', () => {
    const option: ParkingOption = {
      ...PIKE_PLACE_GARAGE,
      serviceAirportCode: 'SEA',
    };

    const links = parkingRouteLinks(option, AIRPORT_TRIP);

    expect(links.parkingToAirportUrl).toContain('google.com/maps/dir');
    expect(links.parkingToDestinationUrl).toBeNull();
    expect(getParkingTransferLinkLabel('airport_trip')).toBe('Parking to terminal');
  });

  test('Pike Place destination has curated official non-ParkWhiz parking hint', () => {
    const hints = buildCuratedDestinationParkingHints({
      destination: 'Pike Place Market, Seattle, WA',
      parkingDurationMinutes: 8 * 60,
    });

    expect(hints).toHaveLength(1);
    expect(hints[0]?.sourceName).toBe('Official parking info');
    expect(hints[0]?.sourceLink).toMatch(/pikeplacemarket\.org\/parking/);
    expect(hints[0]?.bookingProvider).toBeUndefined();
    expect(hints[0]?.priceNote).toMatch(/Provider controls final price/);
    expect(hints[0]?.activeRate?.warnings.join(' ')).toMatch(/Check garage|Event rates/i);
  });
});
