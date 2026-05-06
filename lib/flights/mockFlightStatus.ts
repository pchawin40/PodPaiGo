import { FlightStatusResult } from './types';

function normalizeFlightNumber(input: string): string {
  return input.trim().replace(/\s+/g, '').toUpperCase();
}

export function getMockFlightStatus(
  flightInput: string,
  airportCode: string,
  legType: 'departure' | 'arrival' = 'departure'
): FlightStatusResult | null {
  const flightNumber = normalizeFlightNumber(flightInput);
  if (!flightNumber) return null;

  const now = new Date();

  const common = {
    flightNumber,
    airlineName: airlineNameFromFlight(flightNumber),
    airlineCode: flightNumber.match(/^[A-Z]+/)?.[0],
    legType,
    sourceName: 'Demo flight status',
    sourceType: 'mock' as const,
    lastUpdated: now.toISOString(),
  };

  if (flightNumber.includes('404') || flightNumber.includes('CANCEL')) {
    return {
      ...common,
      originAirportCode: airportCode,
      destinationAirportCode: 'LAX',
      scheduledTime: '18:30',
      estimatedTime: '18:30',
      terminal: 'Main Terminal',
      concourse: 'N Concourse',
      gate: 'N12',
      status: 'cancelled',
      statusLabel: 'Cancelled',
      notes: ['This is demo data. Live provider not connected yet.'],
    };
  }

  if (flightNumber.includes('123') || flightNumber.includes('AS')) {
    return {
      ...common,
      originAirportCode: airportCode,
      destinationAirportCode: 'LAX',
      scheduledTime: '18:30',
      estimatedTime: '18:45',
      terminal: 'Main Terminal',
      concourse: 'N Concourse',
      gate: 'N12',
      status: 'delayed',
      statusLabel: 'Delayed 15 min',
      delayMinutes: 15,
      notes: ['Gate and time are demo values until live provider is connected.'],
    };
  }

  if (legType === 'arrival') {
    return {
      ...common,
      originAirportCode: 'SFO',
      destinationAirportCode: airportCode,
      scheduledTime: '20:10',
      estimatedTime: '20:02',
      terminal: 'Main Terminal',
      gate: 'A8',
      baggageClaim: 'Carousel 6',
      status: 'arrived',
      statusLabel: 'Arrived',
      notes: ['Baggage claim is demo data until live provider is connected.'],
    };
  }

  return {
    ...common,
    originAirportCode: airportCode,
    destinationAirportCode: 'SFO',
    scheduledTime: '17:20',
    estimatedTime: '17:20',
    terminal: 'Main Terminal',
    concourse: 'A Concourse',
    gate: 'A8',
    status: 'scheduled',
    statusLabel: 'On time',
    delayMinutes: 0,
    notes: ['This is demo data. Live provider not connected yet.'],
  };
}

function airlineNameFromFlight(flightNumber: string): string | undefined {
  if (flightNumber.startsWith('AS')) return 'Alaska Airlines';
  if (flightNumber.startsWith('DL')) return 'Delta Air Lines';
  if (flightNumber.startsWith('UA')) return 'United Airlines';
  if (flightNumber.startsWith('AA')) return 'American Airlines';
  if (flightNumber.startsWith('WN')) return 'Southwest Airlines';
  if (flightNumber.startsWith('BA')) return 'British Airways';
  if (flightNumber.startsWith('JL')) return 'Japan Airlines';
  if (flightNumber.startsWith('NH')) return 'ANA';
  return undefined;
}