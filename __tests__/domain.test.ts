import {
  parseTime,
  addMinutes,
  formatTime,
  calculateTripDuration,
  calculateOfficialParkingCost,
  calculateOffAirportParkingCost,
  calculateRideshareCost,
  calculateTransitCost,
  calculateLeaveByTime,
  rankRecommendations
} from '../lib/domain';
import { TripData, ParkingOption, RideshareOption, TransitOption, TsaEstimate } from '../lib/types';
import { MockProvider } from '../lib/providers';

describe('Time Utilities', () => {
  test('parseTime should correctly parse time string', () => {
    const result = parseTime('14:30');
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
  });

  test('addMinutes should add minutes correctly', () => {
    const baseTime = parseTime('10:00');
    const result = addMinutes(baseTime, 90);
    expect(result.getHours()).toBe(11);
    expect(result.getMinutes()).toBe(30);
  });

  test('formatTime should format time correctly', () => {
    const time = parseTime('09:05');
    const result = formatTime(time);
    expect(result).toBe('09:05');
  });
});

describe('Trip Duration Calculation', () => {
  test('calculateTripDuration should calculate duration between departure and return', () => {
    const tripData: TripData = {
      type: 'round-trip',
      origin: '98101',
      destination: 'Central Terminal',
      departureDate: '2024-01-01',
      departureTime: '10:00',
      returnDate: '2024-01-03',
      returnTime: '15:00'
    };
    const result = calculateTripDuration(tripData);
    expect(result).toBe(2 * 24 * 60 + 5 * 60); // 2 days + 5 hours in minutes
  });

  test('calculateTripDuration should return 0 for same date/time', () => {
    const tripData: TripData = {
      type: 'round-trip',
      origin: '98101',
      destination: 'Central Terminal',
      departureDate: '2024-01-01',
      departureTime: '10:00',
      returnDate: '2024-01-01',
      returnTime: '10:00'
    };
    const result = calculateTripDuration(tripData);
    expect(result).toBe(0);
  });
});

describe('Parking Cost Calculations', () => {
  const officialParking: ParkingOption = {
    id: 'official-1',
    name: 'SeaTac Official Parking',
    type: 'official',
    price: 25, // daily rate
    distance: 5,
    availability: 80,
    trustStatus: 'verified-source',
    sourceName: 'SeaTac Airport',
    sourceLink: 'https://www.portseattle.org/sea-tac',
    mapLink: 'https://maps.google.com/?q=SeaTac+Official+Parking',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Daily rate applies for full trip duration']
  };

  const offAirportParking: ParkingOption = {
    id: 'off-airport-1',
    name: 'Park & Fly Lot A',
    type: 'off-airport',
    price: 15, // daily rate
    distance: 10,
    availability: 90,
    trustStatus: 'estimated',
    sourceName: 'Third-party parking aggregator',
    sourceLink: 'https://example.com/parking',
    mapLink: 'https://maps.google.com/?q=Park+Fly+Lot+A+SeaTac',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Pricing may vary by season']
  };

  test('calculateOfficialParkingCost should calculate correctly', () => {
    const tripDuration = 3 * 24 * 60; // 3 days
    const result = calculateOfficialParkingCost(officialParking, tripDuration);
    expect(result).toBe(75); // 25 * 3
  });

  test('calculateOffAirportParkingCost should calculate correctly', () => {
    const tripDuration = 2 * 24 * 60; // 2 days
    const result = calculateOffAirportParkingCost(offAirportParking, tripDuration);
    expect(result).toBe(30); // 15 * 2
  });

  test('calculateOfficialParkingCost should return 0 for off-airport parking', () => {
    const tripDuration = 2 * 24 * 60;
    const result = calculateOfficialParkingCost(offAirportParking, tripDuration);
    expect(result).toBe(0);
  });

  test('calculateOffAirportParkingCost should return 0 for official parking', () => {
    const tripDuration = 2 * 24 * 60;
    const result = calculateOffAirportParkingCost(officialParking, tripDuration);
    expect(result).toBe(0);
  });
});

describe('Rideshare Cost Calculations', () => {
  const rideshare: RideshareOption = {
    id: 'uber',
    name: 'Uber',
    price: 45, // one-way price
    duration: 25,
    availability: 85,
    trustStatus: 'live',
    sourceName: 'Uber API',
    sourceLink: 'https://www.uber.com',
    mapLink: 'https://maps.google.com/?q=Uber+SeaTac',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Traffic conditions considered']
  };

  test('calculateRideshareCost should return one-way price for one-way trips', () => {
    const tripData: TripData = {
      type: 'one-way-departure',
      origin: '98101',
      destination: 'Central Terminal',
      departureDate: '2024-01-01',
      departureTime: '10:00'
    };
    const result = calculateRideshareCost(rideshare, tripData);
    expect(result).toBe(45);
  });

  test('calculateRideshareCost should double the price for round trip', () => {
    const tripData: TripData = {
      type: 'round-trip',
      origin: '98101',
      destination: 'Central Terminal',
      departureDate: '2024-01-01',
      departureTime: '10:00',
      returnDate: '2024-01-03',
      returnTime: '15:00'
    };
    const result = calculateRideshareCost(rideshare, tripData);
    expect(result).toBe(90);
  });
});

describe('Transit Cost Calculations', () => {
  const transit: TransitOption = {
    id: 'light-rail',
    name: 'Light Rail',
    price: 3.25, // one-way price
    duration: 40,
    frequency: 10,
    trustStatus: 'verified-source',
    sourceName: 'Sound Transit',
    sourceLink: 'https://www.soundtransit.org',
    mapLink: 'https://maps.google.com/?q=SeaTac+Light+Rail',
    lastUpdated: new Date().toISOString(),
    assumptions: ['ORCA card required for discounted fare']
  };

  test('calculateTransitCost should return the base price for one-way trips', () => {
    const tripData: TripData = {
      type: 'one-way-arrival',
      origin: '98101',
      destination: 'Central Terminal',
      arrivalDate: '2024-01-01',
      arrivalTime: '10:00'
    };
    const result = calculateTransitCost(transit, tripData);
    expect(result).toBe(3.25);
  });

  test('calculateTransitCost should double for round-trip', () => {
    const tripData: TripData = {
      type: 'round-trip',
      origin: '98101',
      destination: 'Central Terminal',
      departureDate: '2024-01-01',
      departureTime: '10:00',
      returnDate: '2024-01-03',
      returnTime: '15:00'
    };
    const result = calculateTransitCost(transit, tripData);
    expect(result).toBe(6.5);
  });
});

describe('Leave-by Time Calculation', () => {
  const tripData: TripData = {
    type: 'one-way-departure',
    origin: '98101',
    destination: 'Central Terminal',
    departureDate: '2024-01-01',
    departureTime: '14:00', // 2:00 PM flight
  };

  test('calculateLeaveByTime should calculate departure time correctly', () => {
    const tsaEstimate: TsaEstimate = {
      destination: 'Central Terminal',
      waitTime: 20,
      status: 'estimated',
      trustStatus: 'estimated',
      sourceName: 'Mock TSA',
      assumptions: ['Based on historical wait times']
    };
    const transportDuration = 25;
    const buffer = 30;
    const result = calculateLeaveByTime(tripData, tsaEstimate, transportDuration, buffer);
    // 14:00 - (20 + 25 + 30) = 14:00 - 75 min = 12:45
    expect(result).toBe('12:45');
  });
});

describe('Recommendation Ranking', () => {
  const parkingOptions: ParkingOption[] = [
    {
      id: 'official-1',
      name: 'SeaTac Official Parking',
      type: 'official',
      price: 25,
      distance: 5,
      availability: 80,
      trustStatus: 'verified-source',
      sourceName: 'SeaTac Airport',
      sourceLink: 'https://www.portseattle.org/sea-tac',
      mapLink: 'https://maps.google.com/?q=SeaTac+Official+Parking',
      lastUpdated: new Date().toISOString(),
      assumptions: ['Daily rate applies for full trip duration']
    },
    {
      id: 'off-airport-1',
      name: 'Park & Fly Lot A',
      type: 'off-airport',
      price: 15,
      distance: 10,
      availability: 90,
      trustStatus: 'estimated',
      sourceName: 'Third-party parking aggregator',
      sourceLink: 'https://example.com/parking',
      mapLink: 'https://maps.google.com/?q=Park+Fly+Lot+A+SeaTac',
      lastUpdated: new Date().toISOString(),
      assumptions: ['Pricing may vary by season']
    }
  ];

  const rideshareOptions: RideshareOption[] = [
    {
      id: 'uber',
      name: 'Uber',
      price: 45,
      duration: 25,
      availability: 85,
      trustStatus: 'live',
      sourceName: 'Uber API',
      sourceLink: 'https://www.uber.com',
      mapLink: 'https://maps.google.com/?q=Uber+SeaTac',
      lastUpdated: new Date().toISOString(),
      assumptions: ['Live traffic conditions considered']
    }
  ];

  const transitOptions: TransitOption[] = [
    {
      id: 'light-rail',
      name: 'Light Rail',
      price: 3.25,
      duration: 40,
      frequency: 10,
      trustStatus: 'verified-source',
      sourceName: 'Sound Transit',
      sourceLink: 'https://www.soundtransit.org',
      mapLink: 'https://maps.google.com/?q=SeaTac+Light+Rail',
      lastUpdated: new Date().toISOString(),
      assumptions: ['ORCA card required for discounted fare']
    }
  ];

  const tripData: TripData = {
    type: 'round-trip',
    origin: '98101',
    destination: 'Central Terminal',
    departureDate: '2024-01-01',
    departureTime: '10:00',
    returnDate: '2024-01-03',
    returnTime: '15:00'
  };

  test('rankRecommendations should return ranked recommendations', () => {
    const tsaEstimate: TsaEstimate = {
      destination: 'Central Terminal',
      waitTime: 20,
      status: 'estimated',
      trustStatus: 'estimated',
      sourceName: 'Mock TSA',
      assumptions: ['Based on historical wait times']
    };
    const result = rankRecommendations(tripData, parkingOptions, rideshareOptions, transitOptions, tsaEstimate);

    expect(result).toHaveLength(4); // 2 parking + 1 rideshare + 1 transit
    expect(result[0]).toHaveProperty('score');
    expect(result[0]).toHaveProperty('stressScore');
    expect(result[0]).toHaveProperty('cost');
    expect(result[0]).toHaveProperty('reasons');
    expect(result[0].type).toBeDefined();
  });

  test('rankRecommendations should compute true minimum cost correctly', () => {
    const tsaEstimate: TsaEstimate = {
      destination: 'Central Terminal',
      waitTime: 20,
      status: 'estimated',
      trustStatus: 'estimated',
      sourceName: 'Mock TSA',
      assumptions: ['Based on historical wait times']
    };
    const result = rankRecommendations(tripData, parkingOptions, rideshareOptions, transitOptions, tsaEstimate);
    const minCost = Math.min(...result.map(item => item.cost));
    expect(result.some(item => item.cost === minCost)).toBe(true);
    expect(minCost).toBe(6.5);
  });

  test('rankRecommendations should sort by score descending', () => {
    const tsaEstimate: TsaEstimate = {
      destination: 'Central Terminal',
      waitTime: 20,
      status: 'estimated',
      trustStatus: 'estimated',
      sourceName: 'Mock TSA',
      assumptions: ['Based on historical wait times']
    };
    const result = rankRecommendations(tripData, parkingOptions, rideshareOptions, transitOptions, tsaEstimate);

    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].score).toBeGreaterThanOrEqual(result[i + 1].score);
    }
  });

  test('rankRecommendations should include reasons for recommendations', () => {
    const tsaEstimate: TsaEstimate = {
      destination: 'Central Terminal',
      waitTime: 20,
      status: 'estimated',
      trustStatus: 'estimated',
      sourceName: 'Mock TSA',
      assumptions: ['Based on historical wait times']
    };
    const result = rankRecommendations(tripData, parkingOptions, rideshareOptions, transitOptions, tsaEstimate);

    result.forEach(rec => {
      expect(Array.isArray(rec.reasons)).toBe(true);
      expect(rec.reasons.length).toBeGreaterThan(0);
    });
  });

  test('Monroe 98272 transit returns door-to-door hub recommendations with chosen hub names', async () => {
    const provider = new MockProvider();
    const transitJourneys = await provider.getTransitOptions(
      'Monroe, WA 98272',
      'Seattle-Tacoma International Airport',
      new Date().toISOString()
    );

    expect(transitJourneys.length).toBeGreaterThan(0);
    expect(transitJourneys.every(journey => journey.name.startsWith('Drive to'))).toBe(true);
    expect(transitJourneys.some(journey => journey.name.includes('Light Rail to SeaTac'))).toBe(true);
    expect(transitJourneys.some(journey => journey.totalDuration <= 120)).toBe(true);
  });
});