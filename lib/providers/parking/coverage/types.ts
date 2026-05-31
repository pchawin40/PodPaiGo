import type { ParkingOption } from '../../../types';
import type { ProviderHealthStatus } from '../types';

export type ProviderId =
  | 'inventory'
  | 'parkwhiz'
  | 'google'
  | 'apr'
  | 'snapshot'
  | 'marketplace';

export type ProviderDiagnostic = {
  provider: ProviderId;
  enabled: boolean;
  healthStatus: ProviderHealthStatus;
  healthMessage?: string;
  searchDurationMs: number;
  resultsReturned: number;
  livePriceCount: number;
  estimatedPriceCount: number;
  failure?: string;
  lastSuccess?: string;
};

export type ProviderBreakdown = Record<ProviderId, number>;

export type AirportCoverageReport = {
  airportCode: string;
  airportLabel: string;
  destination: string;
  providerCount: number;
  parkingOptionCount: number;
  livePriceCount: number;
  estimatedPriceCount: number;
  unknownPriceCount: number;
  mergedOptionCount: number;
  coverageGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  providerBreakdown: ProviderBreakdown;
  providerDiagnostics: ProviderDiagnostic[];
  missingProviders: ProviderId[];
  notes: string[];
};

export type AirportCoverageDashboard = {
  generatedAt: string;
  checkInDate: string;
  checkOutDate: string;
  environment: {
    googleApiConfigured: boolean;
    inventoryEnabled: boolean;
    parkWhizDiscoveryEnabled: boolean;
    aprEnabled: boolean;
  };
  airports: AirportCoverageReport[];
  poorCoverageAirports: string[];
  recommendedNextProvider: string;
  summary: string;
};

export function countPriceFreshness(options: ParkingOption[]): {
  live: number;
  estimated: number;
  unknown: number;
} {
  let live = 0;
  let estimated = 0;
  let unknown = 0;

  for (const option of options) {
    switch (option.priceFreshness) {
      case 'live':
      case 'recent':
        live += 1;
        break;
      case 'estimated':
        estimated += 1;
        break;
      default:
        if (
          option.trustStatus === 'live' ||
          option.priceDisplay === 'live' ||
          option.priceDisplay === 'from-per-day'
        ) {
          live += 1;
        } else if (
          option.trustStatus === 'estimated' ||
          option.priceDisplay === 'estimated' ||
          option.priceDisplay === 'check-live'
        ) {
          estimated += 1;
        } else {
          unknown += 1;
        }
        break;
    }
  }

  return { live, estimated, unknown };
}
