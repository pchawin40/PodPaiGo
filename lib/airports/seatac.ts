import { TsaDataStatus } from '../types';

export type TrustStatus = 'live' | 'verified-source' | 'estimated' | 'fallback';

// Re-export for compatibility
export type { TsaDataStatus };

export type TsaEstimate = {
  destination: string;
  waitTime: number; // minutes
  status: TsaDataStatus;
  lastUpdated?: string; // ISO timestamp
  trustStatus: TrustStatus;
  sourceName: string;
  assumptions: string[];
};

export type AirportTerminal = {
  id: string;
  name: string;
  type: 'main' | 'satellite';
  checkpoints: string[];
};

export type AirportData = {
  code: string;
  name: string;
  terminals: AirportTerminal[];
  getTsaEstimate(terminal: string): Promise<TsaEstimate>;
};

// SeaTac Airport Configuration
export const SEATAC_TERMINALS: AirportTerminal[] = [
  {
    id: 'central',
    name: 'Central Terminal',
    type: 'main',
    checkpoints: ['A', 'B', 'C', 'D']
  },
  {
    id: 'north-satellite',
    name: 'North Satellite',
    type: 'satellite',
    checkpoints: ['N1', 'N2', 'N3']
  },
  {
    id: 'south-satellite',
    name: 'South Satellite',
    type: 'satellite',
    checkpoints: ['S1', 'S2', 'S3']
  }
];

// Mock TSA data for SeaTac
const MOCK_TSA_DATA: Record<string, TsaEstimate> = {
  'Central Terminal': {
    destination: 'Central Terminal',
    waitTime: 20,
    status: 'estimated',
    lastUpdated: new Date().toISOString(),
    trustStatus: 'estimated',
    sourceName: 'TSA.gov',
    assumptions: ['Based on historical averages', 'May vary by time of day and season']
  },
  'North Satellite': {
    destination: 'North Satellite',
    waitTime: 25,
    status: 'estimated',
    lastUpdated: new Date().toISOString(),
    trustStatus: 'estimated',
    sourceName: 'TSA.gov',
    assumptions: ['Based on historical averages', 'May vary by time of day and season']
  },
  'South Satellite': {
    destination: 'South Satellite',
    waitTime: 22,
    status: 'estimated',
    lastUpdated: new Date().toISOString(),
    trustStatus: 'estimated',
    sourceName: 'TSA.gov',
    assumptions: ['Based on historical averages', 'May vary by time of day and season']
  }
};

// SeaTac Airport Data Provider
export class SeaTacAirportData implements AirportData {
  code = 'SEA';
  name = 'Seattle-Tacoma International Airport';
  terminals = SEATAC_TERMINALS;

  async getTsaEstimate(destination: string): Promise<TsaEstimate> {
    try {
      // TODO: Implement live TSA data integration
      // For now, return mock data with estimated status
      const estimate = MOCK_TSA_DATA[destination];
      if (estimate) {
        return estimate;
      }

      // Fallback for unknown terminals
      return {
        destination,
        waitTime: 20,
        status: 'fallback',
        lastUpdated: new Date().toISOString(),
        trustStatus: 'fallback',
        sourceName: 'Estimated',
        assumptions: ['Default fallback value', 'No specific data available']
      };
    } catch (error) {
      console.warn('Failed to get TSA estimate for SeaTac:', error);
      return {
        destination,
        waitTime: 20,
        status: 'fallback',
        lastUpdated: new Date().toISOString(),
        trustStatus: 'fallback',
        sourceName: 'Estimated',
        assumptions: ['Error fallback value', 'Unable to retrieve data']
      };
    }
  }
}

// Factory function for creating airport data providers
export function createAirportData(code: string): AirportData | null {
  switch (code.toUpperCase()) {
    case 'SEA':
      return new SeaTacAirportData();
    // Future airports can be added here
    // case 'LAX':
    //   return new LaxAirportData();
    default:
      return null;
  }
}

// Export the SeaTac instance for convenience
export const seaTacAirport = new SeaTacAirportData();