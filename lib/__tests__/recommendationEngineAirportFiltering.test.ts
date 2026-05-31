import { RecommendationEngine } from '../recommendationEngine';
import { DataProvider } from '../providers';
import { mockParkingOptions } from '../../data/mockData';
import {
  ParkingOption,
  RideshareOption,
  TrafficEstimate,
  TransitJourney,
  TripData,
  TsaEstimate,
  LocationInfo,
  FlightInfo,
} from '../types';
import { filterParkingByAirport } from '../parking/airportValidation';
import { getAirportById } from '../airports/catalog';

jest.setTimeout(15000);

const emptyTsa: TsaEstimate = {
  destination: 'Airport',
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

function createMockProvider(parking: ParkingOption[]): DataProvider {
  return {
    getParkingOptions: async (_origin, _destination, _dateTime, _duration, context) => {
      if (context?.destinationKind !== 'airport') {
        return parking;
      }

      const airportCode = (context?.airportCode || 'SEA').toUpperCase();
      const airport = getAirportById(airportCode);
      const airportCoordinates =
        airport?.geoLocation ??
        (typeof context?.destinationLat === 'number' && typeof context?.destinationLng === 'number'
          ? { lat: context.destinationLat, lng: context.destinationLng }
          : undefined);

      return filterParkingByAirport(parking, airportCode, airportCoordinates);
    },
    getRideshareOptions: async () => [] as RideshareOption[],
    getTransitOptions: async () => [] as TransitJourney[],
    getTsaEstimate: async () => emptyTsa,
    getTrafficEstimate: async () => emptyTraffic,
    getFlightInfo: async () => null as unknown as FlightInfo,
    getAirportInfo: async () => ({}) as LocationInfo,
  };
}

function wrongAirportLot(serviceAirportCode: string, name: string): ParkingOption {
  return {
    ...mockParkingOptions[0],
    id: `wrong-${serviceAirportCode.toLowerCase()}`,
    name,
    serviceAirportCode,
  };
}

describe('RecommendationEngine airport-specific filtering', () => {
  const originalProvider = RecommendationEngine.provider;

  afterEach(() => {
    RecommendationEngine.setDataProvider(originalProvider);
  });

  const crossAirportCases: Array<{
    selected: string;
    forbidden: string;
    forbiddenName: string;
  }> = [
    { selected: 'PAE', forbidden: 'SEA', forbiddenName: 'WallyPark SeaTac' },
    { selected: 'LAX', forbidden: 'SFO', forbiddenName: 'SFO Economy Parking' },
    { selected: 'ORD', forbidden: 'MDW', forbiddenName: 'MDW Long Term Parking' },
    { selected: 'JFK', forbidden: 'EWR', forbiddenName: 'EWR Airport Parking' },
  ];

  it.each(crossAirportCases)(
    'never returns $forbidden parking for $selected trips',
    async ({ selected, forbidden, forbiddenName }) => {
      RecommendationEngine.setDataProvider(
        createMockProvider([
          wrongAirportLot(forbidden, forbiddenName),
          wrongAirportLot(selected, `${selected} Airport Parking`),
        ]),
      );

      const tripData: TripData = {
        type: 'one-way-departure',
        origin: selected,
        destination: `${selected} Airport`,
        departureDate: '2024-07-01',
        departureTime: '12:00',
        airportCode: selected,
        transportAvailability: 'all',
      };

      const rec = await RecommendationEngine.generateRecommendations(tripData);

      expect(rec.parking.every((p) => p.serviceAirportCode === selected)).toBe(true);
      expect(rec.parking.some((p) => p.serviceAirportCode === forbidden)).toBe(false);
      expect(
        rec.parking.every((p) => !p.name.toLowerCase().includes(forbidden.toLowerCase())),
      ).toBe(true);
    },
  );

  it('never injects mock SEA lots for PAE when live parking is empty', async () => {
    RecommendationEngine.setDataProvider(createMockProvider(mockParkingOptions));

    const tripData: TripData = {
      type: 'one-way-departure',
      origin: 'Everett, WA',
      destination: 'Paine Field (PAE)',
      departureDate: '2024-07-01',
      departureTime: '12:00',
      airportCode: 'PAE',
      transportAvailability: 'car',
    };

    const rec = await RecommendationEngine.generateRecommendations(tripData);

    expect(rec.parking.some((p) => p.serviceAirportCode === 'SEA')).toBe(false);
    expect(rec.parking.some((p) => p.id.startsWith('sea-'))).toBe(false);
    expect(rec.parking.some((p) => p.id.startsWith('off-airport-'))).toBe(false);
  });

  it('allows SEA-tagged parking for SEA airport trips', async () => {
    RecommendationEngine.setDataProvider(
      createMockProvider([
        wrongAirportLot('SEA', 'SEA Official Parking'),
      ]),
    );

    const tripData: TripData = {
      type: 'one-way-departure',
      origin: 'Seattle, WA',
      destination: 'SeaTac Airport',
      departureDate: '2024-07-01',
      departureTime: '12:00',
      airportCode: 'SEA',
      transportAvailability: 'car',
    };

    const rec = await RecommendationEngine.generateRecommendations(tripData);

    expect(rec.parking.length).toBeGreaterThan(0);
    expect(rec.parking.every((p) => p.serviceAirportCode === 'SEA')).toBe(true);
  });
});
