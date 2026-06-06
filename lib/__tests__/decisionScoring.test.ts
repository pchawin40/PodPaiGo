import { rankRecommendations } from '../domain';
import type { ParkingOption, RideshareOption, TransitOption, TripData, TsaEstimate } from '../types';
import type { WeatherImpact } from '../weather/types';

const tripData: TripData = {
  type: 'one-way-departure',
  origin: 'Seattle, WA',
  destination: 'SEA Airport',
  departureDate: '2026-06-01',
  departureTime: '09:00',
  airportCode: 'SEA',
  transportAvailability: 'all',
};

const tsaEstimate: TsaEstimate = {
  destination: 'SEA',
  waitTime: 15,
  status: 'estimated',
  trustStatus: 'estimated',
  sourceName: 'Test',
  assumptions: [],
};

const badWeather: WeatherImpact = {
  condition: 'rain',
  precipitationChance: 90,
  windMph: 18,
  riskLevel: 'high',
  parkingScoreAdjustments: {
    coveredBonus: 18,
    officialGarageBonus: 10,
    shuttlePenalty: -8,
    uncoveredPenalty: -12,
  },
  summary: 'Rain expected',
  sourceName: 'Test',
  lastUpdated: '2026-06-01T00:00:00Z',
};

function parking(overrides: Partial<ParkingOption>): ParkingOption {
  return {
    id: overrides.id || 'parking',
    name: overrides.name || 'Parking',
    serviceAirportCode: 'SEA',
    type: overrides.type || 'off-airport',
    price: overrides.price ?? 20,
    distance: overrides.distance ?? 12,
    availability: overrides.availability ?? 80,
    trustStatus: overrides.trustStatus || 'estimated',
    sourceName: overrides.sourceName || 'Test parking',
    lastUpdated: '2026-06-01T00:00:00Z',
    assumptions: [],
    routeUnavailable: false,
    parkingBufferMinutes: overrides.parkingBufferMinutes ?? 10,
    transferToTerminalMinutes: overrides.transferToTerminalMinutes ?? 10,
    transferType: overrides.transferType || 'shuttle',
    covered: overrides.covered,
    ...overrides,
  };
}

describe('decision scoring', () => {
  test('bad weather favors covered close-in parking over a cheaper exposed shuttle lot', () => {
    const ranked = rankRecommendations(
      tripData,
      [
        parking({
          id: 'cheap-shuttle',
          name: 'Cheap Shuttle Lot',
          price: 9,
          transferToTerminalMinutes: 24,
          transferType: 'shuttle',
          covered: false,
        }),
        parking({
          id: 'covered-garage',
          name: 'Covered Airport Garage',
          type: 'official',
          price: 24,
          transferToTerminalMinutes: 5,
          transferType: 'airport-garage',
          covered: true,
        }),
      ],
      [],
      [],
      tsaEstimate,
      { weatherImpact: badWeather, preference: 'easiest' },
    );

    expect((ranked[0]?.option as ParkingOption).id).toBe('covered-garage');
    expect(ranked[0]?.reasons).toContain('Weather-friendly covered parking');
  });

  test('family and luggage preference penalizes high-walk transit against rideshare', () => {
    const rideshare: RideshareOption = {
      id: 'ride',
      name: 'Rideshare',
      price: 38,
      duration: 28,
      availability: 80,
      trustStatus: 'estimated',
      sourceName: 'Test rideshare',
      lastUpdated: '2026-06-01T00:00:00Z',
      assumptions: [],
    };
    const transit: TransitOption = {
      id: 'transit',
      name: 'Transit',
      price: 4,
      duration: 42,
      frequency: 15,
      availability: 80,
      trustStatus: 'estimated',
      sourceName: 'Test transit',
      lastUpdated: '2026-06-01T00:00:00Z',
      assumptions: [],
    };

    const ranked = rankRecommendations(
      tripData,
      [],
      [rideshare],
      [transit],
      tsaEstimate,
      { familyFriendly: true, preference: 'easiest' },
    );

    expect(ranked[0]?.type).toBe('rideshare');
    expect(ranked[0]?.reasons).toContain('Easy with luggage');
  });
});
