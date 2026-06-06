import { RecommendationEngine } from '../recommendationEngine';
import type { DataProvider } from '../providers';
import { getAirportById } from '../airports/catalog';
import type {
  FlightInfo,
  LocationInfo,
  RideshareOption,
  TrafficEstimate,
  TransitJourney,
  TripData,
  TsaEstimate,
} from '../types';

jest.setTimeout(15000);

const emptyTsa: TsaEstimate = {
  destination: 'Destination',
  waitTime: 0,
  status: 'fallback',
  sourceName: 'Test',
  trustStatus: 'estimated',
  lastUpdated: new Date().toISOString(),
  assumptions: [],
};

const okTraffic: TrafficEstimate = {
  route: 'test',
  duration: 18,
  congestion: 'low',
  trustStatus: 'estimated',
  sourceName: 'Test',
  lastUpdated: new Date().toISOString(),
  assumptions: [],
};

describe('RecommendationEngine passes destination coordinates to getTrafficEstimate', () => {
  const originalProvider = RecommendationEngine.provider;
  const originalParkingTimeout = process.env.PARKING_FETCH_TIMEOUT_MS;
  const originalRouteTimeout = process.env.ROUTE_FETCH_TIMEOUT_MS;

  afterEach(() => {
    RecommendationEngine.setDataProvider(originalProvider);
    if (originalParkingTimeout == null) {
      delete process.env.PARKING_FETCH_TIMEOUT_MS;
    } else {
      process.env.PARKING_FETCH_TIMEOUT_MS = originalParkingTimeout;
    }
    if (originalRouteTimeout == null) {
      delete process.env.ROUTE_FETCH_TIMEOUT_MS;
    } else {
      process.env.ROUTE_FETCH_TIMEOUT_MS = originalRouteTimeout;
    }
  });

  test('general Quick Go trip forwards origin and destination coordinates', async () => {
    const trafficSpy = jest.fn(async () => okTraffic);

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: trafficSpy as unknown as DataProvider['getTrafficEstimate'],
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const tripData: TripData = {
      type: 'general-trip',
      origin: '123 Main Street, Example City, ST',
      originLat: 47.855,
      originLng: -121.97,
      destination: 'Costco, Everett, WA',
      destinationName: 'Costco, Everett, WA',
      destinationKind: 'general',
      destinationLat: 47.9,
      destinationLng: -122.2,
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    };

    await RecommendationEngine.generateRecommendations(tripData);

    expect(trafficSpy).toHaveBeenCalled();
    const trafficCalls = trafficSpy.mock.calls as Array<Parameters<DataProvider['getTrafficEstimate']>>;
    const mainCall = trafficCalls.find(
      (call) => (call[4] as { routePurpose?: string } | undefined)?.routePurpose === 'main_to_destination',
    );
    expect(mainCall).toBeDefined();
    expect(mainCall?.[3]).toEqual({ lat: 47.9, lng: -122.2 });
    expect(mainCall?.[4]).toEqual(
      expect.objectContaining({
        routePurpose: 'main_to_destination',
        originLatLng: { lat: 47.855, lng: -121.97 },
      }),
    );
  });

  test('general arrival-time trip sends an arrival-aware route departure', async () => {
    const trafficSpy = jest.fn(async () => okTraffic);

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: trafficSpy as unknown as DataProvider['getTrafficEstimate'],
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const tripData: TripData = {
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Pike Place Market',
      destinationName: 'Pike Place Market',
      destinationKind: 'general',
      destinationLat: 47.6097,
      destinationLng: -122.3425,
      arrivalDate: '2026-06-01',
      arrivalTime: '09:00',
      parkingDuration: 8 * 60,
      transportAvailability: 'all',
    };

    await RecommendationEngine.generateRecommendations(tripData);

    const trafficCalls = trafficSpy.mock.calls as Array<Parameters<DataProvider['getTrafficEstimate']>>;
    const mainCall = trafficCalls.find(
      (call) => (call[4] as { routePurpose?: string } | undefined)?.routePurpose === 'main_to_destination',
    );
    expect(mainCall).toBeDefined();
    expect(mainCall?.[2]).toContain('2026-06-01T08:30:00');
    expect(mainCall?.[3]).toEqual({ lat: 47.6097, lng: -122.3425 });
  });

  test('nearby Quick Go timeout uses coordinate fallback instead of 35 minute provider fallback', async () => {
    process.env.ROUTE_FETCH_TIMEOUT_MS = '1';

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: async () => new Promise(() => {}) as Promise<never>,
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: '19944 Colleens Ln SE, Monroe, WA',
      originLat: 47.8508,
      originLng: -121.987,
      destination: 'Fred Meyer, U.S. 2, Monroe, WA, USA',
      destinationName: 'Fred Meyer',
      destinationKind: 'general',
      destinationLat: 47.859,
      destinationLng: -121.972,
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(recommendation.trafficEstimate?.sourceName).toBe('Estimated from coordinates');
    expect(recommendation.trafficEstimate?.trustStatus).toBe('estimated');
    expect(recommendation.trafficEstimate?.routeUnavailable).not.toBe(true);
    expect(recommendation.trafficEstimate?.duration).toBeGreaterThan(0);
    expect(recommendation.trafficEstimate?.duration).toBeLessThanOrEqual(8);
    expect(recommendation.trafficEstimate?.duration).not.toBe(35);
  });

  test('local Quick Go missing coordinates returns confirm-timing state instead of bad 35 minute estimate', async () => {
    process.env.ROUTE_FETCH_TIMEOUT_MS = '1';

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: async () => new Promise(() => {}) as Promise<never>,
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: 'Current location',
      destination: 'Fred Meyer, U.S. 2, Monroe, WA, USA',
      destinationName: 'Fred Meyer',
      destinationKind: 'general',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(recommendation.trafficEstimate?.routeUnavailable).toBe(true);
    expect(recommendation.trafficEstimate?.duration).toBe(0);
    expect(recommendation.trafficEstimate?.duration).not.toBe(35);
    expect(recommendation.trafficEstimate?.routeUnavailableReason).toMatch(/open directions/i);
  });

  test('local Quick Go does not reuse a prior SEA traffic estimate when fallback runs', async () => {
    process.env.ROUTE_FETCH_TIMEOUT_MS = '1';

    const trafficSpy = jest
      .fn()
      .mockResolvedValueOnce({
        ...okTraffic,
        route: 'home-airport',
        duration: 35,
        trustStatus: 'fallback',
        sourceName: 'Prior SEA fallback',
      } satisfies TrafficEstimate)
      .mockImplementationOnce(async () => new Promise(() => {}) as Promise<never>);

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => ({
        ...emptyTsa,
        destination: 'SEA',
        waitTime: 15,
      }),
      getTrafficEstimate: trafficSpy as unknown as DataProvider['getTrafficEstimate'],
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const airportRecommendation = await RecommendationEngine.generateRecommendations({
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '12:00',
      transportAvailability: 'all',
    });

    const localRecommendation = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: '19944 Colleens Ln SE, Monroe, WA',
      originLat: 47.8508,
      originLng: -121.987,
      destination: 'Fred Meyer, U.S. 2, Monroe, WA, USA',
      destinationName: 'Fred Meyer',
      destinationKind: 'general',
      destinationLat: 47.859,
      destinationLng: -121.972,
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(airportRecommendation.trafficEstimate?.duration).toBe(35);
    expect(localRecommendation.trafficEstimate?.sourceName).toBe('Estimated from coordinates');
    expect(localRecommendation.trafficEstimate?.duration).toBeLessThanOrEqual(8);
    expect(localRecommendation.trafficEstimate?.duration).not.toBe(35);
  });

  test('slow parking provider returns partial results instead of blocking', async () => {
    process.env.PARKING_FETCH_TIMEOUT_MS = '1';

    const mockProvider: DataProvider = {
      getParkingOptions: async () => new Promise(() => {}) as Promise<never>,
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: async () => okTraffic,
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const tripData: TripData = {
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Bellevue Square',
      destinationKind: 'general',
      arrivalDate: '2026-06-01',
      arrivalTime: '09:00',
      transportAvailability: 'all',
    };

    const recommendation = await RecommendationEngine.generateRecommendations(tripData);

    expect(recommendation.parking).toEqual([]);
    expect(recommendation.parkingDataStatus).toBe('unavailable');
    expect(recommendation.parkingDataMessage).toMatch(/Live parking is still updating/);
    expect(recommendation.trafficEstimate?.duration).toBe(18);
  });

  test('no-parking preference still requests ride and transit fallbacks for legacy car URLs', async () => {
    const parkingSpy = jest.fn(async () => []);
    const rideshareSpy = jest.fn(async () => [] as RideshareOption[]);
    const transitSpy = jest.fn(async () => [] as TransitJourney[]);

    const mockProvider: DataProvider = {
      getParkingOptions: parkingSpy,
      getRideshareOptions: rideshareSpy,
      getTransitOptions: transitSpy,
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: async () => okTraffic,
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const tripData: TripData = {
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Bellevue Square',
      destinationKind: 'general',
      arrivalDate: '2026-06-01',
      arrivalTime: '09:00',
      transportAvailability: 'car',
      parkingPreference: 'none',
    };

    await RecommendationEngine.generateRecommendations(tripData);

    expect(parkingSpy).not.toHaveBeenCalled();
    expect(rideshareSpy).toHaveBeenCalled();
    expect(transitSpy).toHaveBeenCalled();
  });

  test('geocodes missing coordinates and forwards them to getTrafficEstimate', async () => {
    const trafficSpy = jest.fn(async () => okTraffic);
    const geocodeSpy = jest.fn(async (address: string) => {
      if (/fred meyer/i.test(address)) return { lat: 47.859, lng: -121.972 };
      if (/chain lake|monroe/i.test(address)) return { lat: 47.8508, lng: -121.987 };
      return null;
    });

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: trafficSpy as unknown as DataProvider['getTrafficEstimate'],
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
      geocodeAddress: geocodeSpy,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    // Destination/origin selected from address autocomplete: text only, NO lat/lng.
    await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: '13907 Chain Lake Rd, Monroe, WA 98272',
      destination: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
      destinationName: 'Fred Meyer',
      destinationKind: 'general',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(geocodeSpy).toHaveBeenCalled();
    const trafficCalls = trafficSpy.mock.calls as Array<Parameters<DataProvider['getTrafficEstimate']>>;
    const mainCall = trafficCalls.find(
      (call) => (call[4] as { routePurpose?: string } | undefined)?.routePurpose === 'main_to_destination',
    );
    expect(mainCall).toBeDefined();
    expect(mainCall?.[3]).toEqual({ lat: 47.859, lng: -121.972 });
    expect(mainCall?.[4]).toEqual(
      expect.objectContaining({ originLatLng: { lat: 47.8508, lng: -121.987 } }),
    );
  });

  test('Monroe -> Fred Meyer with geocoded coords falls back to a small straight-line time (not unknown, not 35)', async () => {
    process.env.ROUTE_FETCH_TIMEOUT_MS = '1';

    const geocodeSpy = jest.fn(async (address: string) => {
      if (/fred meyer/i.test(address)) return { lat: 47.859, lng: -121.972 };
      if (/chain lake|monroe/i.test(address)) return { lat: 47.8508, lng: -121.987 };
      return null;
    });

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      // Live route never settles -> engine traffic fetch times out.
      getTrafficEstimate: async () => new Promise(() => {}) as Promise<never>,
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
      geocodeAddress: geocodeSpy,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: '13907 Chain Lake Rd, Monroe, WA 98272',
      destination: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
      destinationName: 'Fred Meyer',
      destinationKind: 'general',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(recommendation.trafficEstimate?.sourceName).toBe('Estimated from coordinates');
    expect(recommendation.trafficEstimate?.routeUnavailable).not.toBe(true);
    expect(recommendation.trafficEstimate?.duration).toBeGreaterThan(0);
    expect(recommendation.trafficEstimate?.duration).not.toBe(35);
  });

  test('live route result wins over straight-line fallback', async () => {
    const liveTraffic: TrafficEstimate = {
      route: 'custom',
      duration: 4,
      congestion: 'low',
      trustStatus: 'live',
      sourceName: 'Google Routes API',
      lastUpdated: new Date().toISOString(),
      assumptions: ['Real-time traffic data from Google Routes API'],
    };

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: async () => liveTraffic,
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
      geocodeAddress: async () => ({ lat: 47.859, lng: -121.972 }),
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: '13907 Chain Lake Rd, Monroe, WA 98272',
      destination: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
      destinationName: 'Fred Meyer',
      destinationKind: 'general',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(recommendation.trafficEstimate?.trustStatus).toBe('live');
    expect(recommendation.trafficEstimate?.sourceName).toBe('Google Routes API');
    expect(recommendation.trafficEstimate?.duration).toBe(4);
    expect(recommendation.trafficEstimate?.sourceName).not.toBe('Estimated from coordinates');
  });

  test('Quick Go main route uses Mapbox provider result instead of straight-line fallback', async () => {
    const mapboxTraffic: TrafficEstimate = {
      route: 'custom',
      duration: 4,
      congestion: 'low',
      trustStatus: 'live',
      routeUnavailable: false,
      sourceName: 'Mapbox Directions',
      lastUpdated: new Date().toISOString(),
      assumptions: ['Backup route timing from Mapbox Directions (Google Routes unavailable).'],
    };

    const trafficSpy = jest.fn(async () => mapboxTraffic);

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: trafficSpy as unknown as DataProvider['getTrafficEstimate'],
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
      geocodeAddress: async (address: string) =>
        /fred meyer/i.test(address) ? { lat: 47.859, lng: -121.972 } : { lat: 47.8508, lng: -121.987 },
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      tripMode: 'quick-go',
      origin: '13907 Chain Lake Rd, Monroe, WA 98272',
      destination: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
      destinationName: 'Fred Meyer',
      destinationKind: 'general',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(trafficSpy).toHaveBeenCalled();
    const trafficCalls = trafficSpy.mock.calls as Array<Parameters<DataProvider['getTrafficEstimate']>>;
    const mainCall = trafficCalls.find(
      (call) => (call[4] as { routePurpose?: string } | undefined)?.routePurpose === 'main_to_destination',
    );
    expect(mainCall?.[4]).toEqual(
      expect.objectContaining({
        routePurpose: 'main_to_destination',
        tripType: 'general-trip',
        tripMode: 'quick-go',
      }),
    );
    expect(recommendation.trafficEstimate?.sourceName).toBe('Mapbox Directions');
    expect(recommendation.trafficEstimate?.trustStatus).toBe('live');
    expect(recommendation.trafficEstimate?.routeUnavailable).not.toBe(true);
    expect(recommendation.trafficEstimate?.duration).toBeGreaterThanOrEqual(3);
    expect(recommendation.trafficEstimate?.duration).toBeLessThanOrEqual(4);
  });

  test('Monroe -> Fred Meyer mocked live route shows live 3-4 min, not fallback', async () => {
    const liveTraffic: TrafficEstimate = {
      route: 'custom',
      duration: 3,
      congestion: 'low',
      trustStatus: 'live',
      sourceName: 'Google Routes API',
      lastUpdated: new Date().toISOString(),
      assumptions: [],
    };

    const trafficSpy = jest.fn(async () => liveTraffic);

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: trafficSpy as unknown as DataProvider['getTrafficEstimate'],
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
      geocodeAddress: async (address: string) =>
        /fred meyer/i.test(address) ? { lat: 47.859, lng: -121.972 } : { lat: 47.8508, lng: -121.987 },
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: '13907 Chain Lake Rd, Monroe, WA 98272',
      destination: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
      destinationName: 'Fred Meyer',
      destinationKind: 'general',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(trafficSpy).toHaveBeenCalled();
    expect(recommendation.trafficEstimate?.duration).toBeGreaterThanOrEqual(3);
    expect(recommendation.trafficEstimate?.duration).toBeLessThanOrEqual(4);
    expect(recommendation.trafficEstimate?.trustStatus).toBe('live');
    expect(recommendation.trafficEstimate?.routeUnavailable).not.toBe(true);
    expect(recommendation.trafficEstimate?.sourceName).not.toBe('Estimated from coordinates');
  });

  test('missing coordinates with no geocoder still returns unavailable (not 35)', async () => {
    process.env.ROUTE_FETCH_TIMEOUT_MS = '1';

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: async () => new Promise(() => {}) as Promise<never>,
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
      // No geocodeAddress, and the address can't be resolved.
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: 'Current location',
      destination: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
      destinationName: 'Fred Meyer',
      destinationKind: 'general',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(recommendation.trafficEstimate?.routeUnavailable).toBe(true);
    expect(recommendation.trafficEstimate?.duration).not.toBe(35);
  });

  test('airport main route forwards geocoded origin and airport catalog coordinates', async () => {
    const sea = getAirportById('SEA')!;
    const monroeCoords = { lat: 47.855, lng: -121.97 };
    const trafficSpy = jest.fn(async () => okTraffic);
    const geocodeSpy = jest.fn(async (address: string) =>
      /monroe/i.test(address) ? monroeCoords : null,
    );

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: trafficSpy as unknown as DataProvider['getTrafficEstimate'],
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
      geocodeAddress: geocodeSpy,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    await RecommendationEngine.generateRecommendations({
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '12:00',
      timeAnchor: 'flight-departure',
      transportAvailability: 'all',
    });

    const trafficCalls = trafficSpy.mock.calls as Array<Parameters<DataProvider['getTrafficEstimate']>>;
    const mainCall = trafficCalls.find(
      (call) => (call[4] as { routePurpose?: string } | undefined)?.routePurpose === 'main_to_destination',
    );
    expect(mainCall).toBeDefined();
    expect(mainCall?.[3]).toEqual(sea.geoLocation);
    expect(mainCall?.[4]).toEqual(
      expect.objectContaining({
        airportCode: 'SEA',
        routePurpose: 'main_to_destination',
        tripType: 'one-way-departure',
        originLatLng: monroeCoords,
      }),
    );
    expect(geocodeSpy).toHaveBeenCalledWith('Monroe, WA');
    expect(geocodeSpy).not.toHaveBeenCalledWith('Seattle-Tacoma International Airport');
  });

  test('airport Mapbox backup estimate is accepted for leave-by timing', async () => {
    const mapboxTraffic: TrafficEstimate = {
      route: 'home-airport',
      duration: 42,
      congestion: 'medium',
      trustStatus: 'live',
      routeUnavailable: false,
      sourceName: 'Mapbox Directions',
      lastUpdated: new Date().toISOString(),
      assumptions: ['Backup route timing from Mapbox Directions (Google Routes unavailable).'],
    };

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: async () => mapboxTraffic,
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
      geocodeAddress: async () => ({ lat: 47.855, lng: -121.97 }),
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '12:00',
      timeAnchor: 'flight-departure',
      transportAvailability: 'all',
      securityOption: 'standard',
      flightType: 'domestic',
      cabin: 'economy',
      bagPlan: 'none',
    });

    expect(recommendation.trafficEstimate?.sourceName).toBe('Mapbox Directions');
    expect(recommendation.trafficEstimate?.routeUnavailable).not.toBe(true);
    expect(recommendation.airportRouteUnavailable).toBe(false);
    expect(recommendation.leaveByTime).toMatch(/^\d{2}:\d{2}$/);
    expect(recommendation.tsaEstimate).toBeDefined();
  });

  test('airport traffic timeout uses coordinate fallback before unavailable', async () => {
    process.env.ROUTE_FETCH_TIMEOUT_MS = '1';

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: async () => new Promise(() => {}) as Promise<never>,
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
      geocodeAddress: async () => ({ lat: 47.855, lng: -121.97 }),
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '12:00',
      timeAnchor: 'flight-departure',
      transportAvailability: 'all',
    });

    expect(recommendation.trafficEstimate?.sourceName).toBe('Estimated from coordinates');
    expect(recommendation.trafficEstimate?.routeUnavailable).not.toBe(true);
    expect(recommendation.airportRouteUnavailable).toBe(false);
    expect(recommendation.leaveByTime).toMatch(/^\d{2}:\d{2}$/);
  });

  test('airport route stays unavailable only when no usable fallback coordinates exist', async () => {
    process.env.ROUTE_FETCH_TIMEOUT_MS = '1';

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: async () => new Promise(() => {}) as Promise<never>,
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'one-way-departure',
      origin: 'Current location',
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '12:00',
      timeAnchor: 'flight-departure',
      transportAvailability: 'all',
    });

    expect(recommendation.trafficEstimate?.routeUnavailable).toBe(true);
    expect(recommendation.airportRouteUnavailable).toBe(true);
    expect(recommendation.leaveByTime).toBeNull();
  });
});
