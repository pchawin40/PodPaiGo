import { buildRouteEstimateCacheKey } from '../apiUsage/routeCacheKey';
import { computePrimaryAirportPlan } from '../airports/airportLeaveBy';
import {
  isServeableCachedRouteEstimate,
  isUntrustedParkingRouteEstimate,
  MockProvider,
  PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE,
  type TrafficProvider,
} from '../providers';
import { parkingTimeBreakdown } from '../parking/routeDisplay';
import {
  buildParkingSortScoreSnapshot,
  compareParkingByFastest,
  sortParkingOptionsForMode,
  totalTimeToTerminalMinutes,
} from '../parking/sortParkingOptions';
import { qualifiesForCheapestBadge } from '../parking/priceReliability';
import { getLiveParkingOptions } from '../providers/parkingAggregator';
import type { ParkingOption, TrafficEstimate, TripData } from '../types';

jest.mock('../providers/parkingAggregator', () => ({
  getLiveParkingOptions: jest.fn(async () => []),
  getDestinationParkingOptions: jest.fn(async () => []),
}));

const MONROE_ORIGIN_TEXT = '19944 Colleens Ln SE, Monroe, WA 98272';
const MONROE_ORIGIN = { lat: 47.8552, lng: -121.9709 };
const EIGHTH_AVE_LOT = {
  lat: 47.4374,
  lng: -122.297,
  address: '18220 8th Ave S, SeaTac, WA 98148',
};
const AIRPORT_DESTINATION = 'Seattle-Tacoma International Airport (SEA)';
const ROUTE_DEPARTURE = '2026-06-01T10:00:00.000Z';

function eighthAveLot(overrides: Partial<ParkingOption> = {}): ParkingOption {
  return {
    id: 'eighth-ave-lot',
    name: '18220 8th Ave S Parking',
    address: EIGHTH_AVE_LOT.address,
    type: 'off-airport',
    transferType: 'shuttle',
    price: 18,
    availability: 80,
    distance: 3,
    lat: EIGHTH_AVE_LOT.lat,
    lng: EIGHTH_AVE_LOT.lng,
    parkingBufferMinutes: 10,
    transferToTerminalMinutes: 12,
    walkingMinutes: 3,
    shuttleWaitMinutes: 8,
    bufferRiskMinutes: 5,
    trustStatus: 'estimated',
    sourceName: 'Fixture',
    lastUpdated: '2026-06-01T00:00:00.000Z',
    assumptions: [],
    ...overrides,
  };
}

describe('parking origin-to-lot routing and ranking', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv, PARKING_INITIAL_LIVE_ROUTE_LIMIT: '5' };
    (getLiveParkingOptions as jest.Mock).mockResolvedValue([eighthAveLot()]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('1. route-to-lot uses lot coordinates, not airport destination', async () => {
    const parkingDestinations: string[] = [];
    const fakeTrafficProvider: TrafficProvider = {
      async getTrafficEstimate(_origin, destination, _dateTime, destinationLatLng, routeContext) {
        if (routeContext?.routePurpose === PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE) {
          parkingDestinations.push(destination);
          expect(destinationLatLng).toEqual({
            lat: EIGHTH_AVE_LOT.lat,
            lng: EIGHTH_AVE_LOT.lng,
          });
        }

        return {
          route: 'monroe-lot',
          duration: 55,
          congestion: 'medium',
          trustStatus: 'live',
          sourceName: 'Google Routes API',
          lastUpdated: ROUTE_DEPARTURE,
          assumptions: [],
        };
      },
    };

    const provider = new MockProvider();
    (provider as unknown as { trafficProvider: TrafficProvider }).trafficProvider = fakeTrafficProvider;

    const parking = await provider.getParkingOptions(
      MONROE_ORIGIN_TEXT,
      AIRPORT_DESTINATION,
      ROUTE_DEPARTURE,
      24 * 60,
      { destinationKind: 'airport', airportCode: 'SEA' },
    );

    expect(parkingDestinations.some((dest) => dest.toLowerCase().includes('international airport'))).toBe(false);
    expect(parkingDestinations.length).toBeGreaterThan(0);
    expect(parking[0]?.originToParkingMinutes).toBe(55);
  });

  test('2. cache key differs between route-to-lot and route-to-airport', () => {
    const lotKey = buildRouteEstimateCacheKey({
      origin: `${MONROE_ORIGIN.lat},${MONROE_ORIGIN.lng}`,
      destination: `${EIGHTH_AVE_LOT.lat},${EIGHTH_AVE_LOT.lng}`,
      dateTime: ROUTE_DEPARTURE,
      mode: 'DRIVE',
      routePurpose: PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE,
      lotId: 'eighth-ave-lot',
    });
    const airportKey = buildRouteEstimateCacheKey({
      origin: `${MONROE_ORIGIN.lat},${MONROE_ORIGIN.lng}`,
      destination: AIRPORT_DESTINATION,
      dateTime: ROUTE_DEPARTURE,
      mode: 'DRIVE',
      routePurpose: 'main_to_destination',
      airportCode: 'SEA',
    });

    expect(lotKey).not.toBe(airportKey);
    expect(lotKey).toContain(PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE);
  });

  test('3. cache key differs per lot', () => {
    const lotA = buildRouteEstimateCacheKey({
      origin: `${MONROE_ORIGIN.lat},${MONROE_ORIGIN.lng}`,
      destination: `${EIGHTH_AVE_LOT.lat},${EIGHTH_AVE_LOT.lng}`,
      dateTime: ROUTE_DEPARTURE,
      mode: 'DRIVE',
      routePurpose: PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE,
      lotId: 'lot-a',
    });
    const lotB = buildRouteEstimateCacheKey({
      origin: `${MONROE_ORIGIN.lat},${MONROE_ORIGIN.lng}`,
      destination: '47.44,-122.30',
      dateTime: ROUTE_DEPARTURE,
      mode: 'DRIVE',
      routePurpose: PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE,
      lotId: 'lot-b',
    });

    expect(lotA).not.toBe(lotB);
  });

  test('4. live route beats stale 35-minute placeholder fallback', () => {
    const placeholder = {
      route: 'custom',
      duration: 35,
      congestion: 'medium' as const,
      trustStatus: 'estimated' as const,
      sourceName: 'Estimated route model',
      lastUpdated: ROUTE_DEPARTURE,
      assumptions: [],
    };

    expect(isUntrustedParkingRouteEstimate(placeholder)).toBe(true);
    expect(isServeableCachedRouteEstimate(placeholder)).toBe(false);
  });

  test('5. 55-minute drive totals door-to-terminal with all segments', () => {
    const option = eighthAveLot({
      originToParkingMinutes: 55,
      routeToParkingMinutes: 55,
      originDriveSource: 'google-routes',
      originLat: MONROE_ORIGIN.lat,
      originLng: MONROE_ORIGIN.lng,
      routeTargetLat: EIGHTH_AVE_LOT.lat,
      routeTargetLng: EIGHTH_AVE_LOT.lng,
      routesUsedCanonicalCoords: true,
    });

    const breakdown = parkingTimeBreakdown(option, {
      originLat: MONROE_ORIGIN.lat,
      originLng: MONROE_ORIGIN.lng,
    });

    const drive = breakdown.parts.find((part) => part.label === 'Drive to lot');
    expect(drive?.minutes).toBe(55);
    expect(breakdown.totalMinutes).toBe(
      breakdown.parts.reduce((sum, part) => sum + part.minutes, 0),
    );
    expect(breakdown.totalMinutes).toBeGreaterThanOrEqual(90);
    expect(totalTimeToTerminalMinutes(option)).toBe(breakdown.totalMinutes);
  });

  test('6. leave-by uses drive-to-lot from selected parking option', () => {
    const tripData: TripData = {
      type: 'one-way-departure',
      origin: MONROE_ORIGIN_TEXT,
      destination: AIRPORT_DESTINATION,
      destinationKind: 'airport',
      departureDate: '2026-06-01',
      departureTime: '14:00',
      parkingCheckInDate: '2026-06-01',
      parkingCheckInTime: '12:00',
      parkingCheckInUserOverride: true,
    };

    const plan = computePrimaryAirportPlan({
      intent: 'flying-out',
      tripData,
      selectedParkingName: eighthAveLot().name,
      selectedTiming: {
        totalMinutes: 97,
        driveMinutes: 55,
        parkingBufferMinutes: 10,
        shuttleWalkMinutes: 32,
      },
      fallbackLeaveByTime: '10:00',
    });

    expect(plan.travelMinutes).toBe(55);
    expect(plan.leaveByTime).toBe('11:00');
  });

  test('7. total time includes drive, check-in, shuttle wait, shuttle, walk, and buffer', () => {
    const option = eighthAveLot({
      originToParkingMinutes: 55,
      routeToParkingMinutes: 55,
      originLat: MONROE_ORIGIN.lat,
      originLng: MONROE_ORIGIN.lng,
    });

    const breakdown = parkingTimeBreakdown(option, {
      originLat: MONROE_ORIGIN.lat,
      originLng: MONROE_ORIGIN.lng,
    });

    expect(breakdown.parts.map((part) => part.label)).toEqual(
      expect.arrayContaining([
        'Drive to lot',
        'Park/check-in',
        'Shuttle wait',
        'Shuttle',
        'Walk inside airport',
        'Buffer/risk',
      ]),
    );
  });

  test('8. fallback estimates are labeled untrusted and not cache-authoritative', () => {
    const fallback = {
      route: 'custom',
      duration: 41,
      congestion: 'medium' as const,
      trustStatus: 'estimated' as const,
      sourceName: 'Estimated from coordinates',
      lastUpdated: ROUTE_DEPARTURE,
      assumptions: [],
      routeUnavailable: false,
    };

    expect(isUntrustedParkingRouteEstimate(fallback)).toBe(true);
    expect(isServeableCachedRouteEstimate(fallback)).toBe(false);
  });

  test('9. fastest ranks by totalTimeToTerminalMinutes, not lot proximity', () => {
    const closerButSlower = eighthAveLot({
      id: 'closer',
      distance: 1,
      originToParkingMinutes: 55,
      routeToParkingMinutes: 55,
    });
    const fartherButFasterTransfer = eighthAveLot({
      id: 'farther',
      distance: 12,
      originToParkingMinutes: 50,
      routeToParkingMinutes: 50,
      transferType: 'walk',
      transferToTerminalMinutes: 3,
      walkingMinutes: 3,
      shuttleWaitMinutes: 0,
      bufferRiskMinutes: 0,
      parkingBufferMinutes: 5,
    });

    expect(compareParkingByFastest(fartherButFasterTransfer, closerButSlower)).toBeLessThan(0);
    expect(
      sortParkingOptionsForMode([closerButSlower, fartherButFasterTransfer], 'fastest')[0]?.id,
    ).toBe('farther');
  });

  test('10. cheapest badge avoids estimated range when live exact exists', () => {
    const liveExact = eighthAveLot({
      id: 'live',
      price: 30,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      sourceLink: 'https://book.example',
    });
    const estimatedRange = eighthAveLot({
      id: 'estimated',
      price: 20,
      priceMin: 18,
      priceMax: 28,
      priceDisplay: 'estimated',
      priceConfidence: 'low',
    });

    const peers = [liveExact, estimatedRange];
    expect(
      qualifiesForCheapestBadge({
        option: estimatedRange,
        peers,
        tripData: null,
      }),
    ).toBe(false);
    expect(
      qualifiesForCheapestBadge({
        option: liveExact,
        peers,
        tripData: null,
      }),
    ).toBe(true);
  });

  test('11. easiest prioritizes live confidence over closer low-confidence option', () => {
    const liveReliable = eighthAveLot({
      id: 'live',
      trustStatus: 'live',
      priceDisplay: 'live',
      pricingConfidence: 'live',
      sourceLink: 'https://book.example',
      originToParkingMinutes: 55,
      routeToParkingMinutes: 55,
      transferType: 'walk',
      transferToTerminalMinutes: 5,
      walkingMinutes: 5,
      shuttleWaitMinutes: 0,
      bufferRiskMinutes: 0,
    });
    const closeUnreliable = eighthAveLot({
      id: 'close',
      trustStatus: 'estimated',
      priceDisplay: 'estimated',
      priceConfidence: 'low',
      distance: 1,
      originToParkingMinutes: 20,
      routeToParkingMinutes: 20,
      transferType: 'shuttle',
    });

    expect(
      sortParkingOptionsForMode([closeUnreliable, liveReliable], 'easiest')[0]?.id,
    ).toBe('live');
  });

  test('12. sort score snapshot exposes DEBUG_LOGS ranking fields', () => {
    const option = eighthAveLot({
      originToParkingMinutes: 55,
      routeToParkingMinutes: 55,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      sourceLink: 'https://book.example',
    });

    const snapshot = buildParkingSortScoreSnapshot(option, 'fastest', null, [option]);

    expect(snapshot.driveMinutes).toBe(55);
    expect(snapshot.totalTimeToTerminalMinutes).toBeGreaterThan(55);
    expect(snapshot.fastestKey).toBe(snapshot.totalTimeToTerminalMinutes);
    expect(snapshot.priceTier).toBe('live_exact');
    expect(snapshot.qualifiesForCheapestBadge).toBe(true);
  });
});
