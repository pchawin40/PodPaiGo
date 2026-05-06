export type FlightStatus =
  | 'scheduled'
  | 'boarding'
  | 'delayed'
  | 'departed'
  | 'arrived'
  | 'cancelled'
  | 'unknown';

export type FlightLegType = 'departure' | 'arrival';

export type FlightStatusResult = {
  flightNumber: string;
  airlineName?: string;
  airlineCode?: string;

  legType: FlightLegType;

  originAirportCode?: string;
  destinationAirportCode?: string;

  scheduledTime?: string;
  estimatedTime?: string;
  actualTime?: string;

  terminal?: string;
  concourse?: string;
  gate?: string;
  baggageClaim?: string;

  status: FlightStatus;
  statusLabel: string;
  delayMinutes?: number;

  sourceName: string;
  sourceType: 'mock' | 'live' | 'official' | 'provider';
  lastUpdated?: string;

  notes?: string[];
};