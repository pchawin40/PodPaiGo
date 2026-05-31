import { RecommendationEngine } from '../../recommendationEngine';
import { DataProvider } from '../../providers';
import type {
  FlightInfo,
  LocationInfo,
  RideshareOption,
  TrafficEstimate,
  TransitJourney,
  TripData,
  TsaEstimate,
} from '../../types';
import { filterParkingByAirport } from '../../parking/airportValidation';
import { getAirportById } from '../../airports/catalog';

const originalEnv = process.env.SEA_CURATED_ACCESS;
const originalProvider = RecommendationEngine.provider;

const emptyTsa: TsaEstimate = {
  destination: 'SEA',
  waitTime: 15,
  status: 'fallback',
  sourceName: 'Test',
  trustStatus: 'estimated',
  lastUpdated: new Date().toISOString(),
  assumptions: [],
};

const emptyTraffic: TrafficEstimate = {
  route: 'test',
  duration: 30,
  congestion: 'low',
  trustStatus: 'estimated',
  sourceName: 'Test',
  lastUpdated: new Date().toISOString(),
  assumptions: [],
};

function createMockProvider(): DataProvider {
  return {
    getParkingOptions: async (_origin, _destination, _dateTime, _duration, context) => {
      const airportCode = (context?.airportCode || 'SEA').toUpperCase();
      const airport = getAirportById(airportCode);
      return filterParkingByAirport([], airportCode, airport?.geoLocation);
    },
    getRideshareOptions: async () => [] as RideshareOption[],
    getTransitOptions: async () => [] as TransitJourney[],
    getTsaEstimate: async () => emptyTsa,
    getTrafficEstimate: async () => emptyTraffic,
    getFlightInfo: async () => null as unknown as FlightInfo,
    getAirportInfo: async () => ({}) as LocationInfo,
  };
}

describe('RecommendationEngine accessStrategies', () => {
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SEA_CURATED_ACCESS;
    } else {
      process.env.SEA_CURATED_ACCESS = originalEnv;
    }
    RecommendationEngine.setDataProvider(originalProvider);
  });

  const seaTrip: TripData = {
    type: 'one-way-departure',
    origin: 'Capitol Hill, Seattle, WA',
    destination: 'Seattle-Tacoma International Airport (SEA)',
    airportCode: 'SEA',
    departureDate: '2026-06-01',
    departureTime: '08:00',
    parkingDuration: 24 * 60,
    transportAvailability: 'all',
  };

  test('includes Northgate accessStrategies for SEA when flag enabled', async () => {
    process.env.SEA_CURATED_ACCESS = '1';
    RecommendationEngine.setDataProvider(createMockProvider());

    const rec = await RecommendationEngine.generateRecommendations(seaTrip);

    expect(rec.accessStrategies?.options?.length).toBeGreaterThan(0);
    expect(rec.accessStrategies?.options?.[0]?.displayName).toBe('Northgate Park + Link');
    expect(rec.accessStrategies?.topPickId).toBe('sea-northgate-park-link');
  });

  test('omits accessStrategies for SEA when flag disabled', async () => {
    delete process.env.SEA_CURATED_ACCESS;
    RecommendationEngine.setDataProvider(createMockProvider());

    const rec = await RecommendationEngine.generateRecommendations(seaTrip);

    expect(rec.accessStrategies).toBeUndefined();
  });

  test('omits accessStrategies for non-SEA airports', async () => {
    process.env.SEA_CURATED_ACCESS = '1';
    RecommendationEngine.setDataProvider(createMockProvider());

    const rec = await RecommendationEngine.generateRecommendations({
      ...seaTrip,
      airportCode: 'LAX',
      destination: 'Los Angeles International Airport (LAX)',
    });

    expect(rec.accessStrategies).toBeUndefined();
  });
});
