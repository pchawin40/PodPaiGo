import type { ProviderId } from './types';
import { auditAirportCoverage } from './audit';
import { buildProviderEnvAuditReport, type ProviderActivationState } from './envRequirements';

export type ProviderDiagnosticsRow = {
  provider: ProviderId;
  displayName: string;
  status: ProviderActivationState;
  enabled: boolean;
  resultsCount: number;
  livePriceCount: number;
  estimatedPriceCount: number;
  searchDurationMs: number;
  lastSuccess?: string;
  lastFailure?: string;
  healthMessage?: string;
};

export type ParkingDiagnosticsResponse = {
  checkedAt: string;
  airportCode: string;
  envAudit: ReturnType<typeof buildProviderEnvAuditReport>;
  providers: ProviderDiagnosticsRow[];
  coverageSummary?: {
    mergedOptionCount: number;
    livePriceCount: number;
    coverageGrade: string;
    providerCount: number;
  };
};

const DISPLAY_NAMES: Record<ProviderId, string> = {
  inventory: 'Inventory',
  parkwhiz: 'ParkWhiz',
  google: 'Google Places',
  apr: 'APR',
  snapshot: 'Snapshots',
  marketplace: 'Marketplace',
};

function mapEnvNameToProviderId(name: string): ProviderId | null {
  switch (name) {
    case 'Google Places':
      return 'google';
    case 'Inventory':
      return 'inventory';
    case 'Snapshots':
      return 'snapshot';
    case 'APR':
      return 'apr';
    case 'Marketplace':
      return 'marketplace';
    case 'ParkWhiz':
      return 'parkwhiz';
    default:
      return null;
  }
}

function resolveRowStatus(args: {
  envStatus: ProviderActivationState;
  enabled: boolean;
  failure?: string;
  resultsReturned: number;
  healthStatus: string;
}): ProviderActivationState {
  if (!args.enabled) return 'disabled';
  if (args.envStatus === 'missing_config') return 'missing_config';
  if (args.failure) return 'error';
  if (args.healthStatus === 'degraded') return 'degraded';
  if (args.resultsReturned > 0) return 'healthy';
  if (args.envStatus === 'healthy' || args.healthStatus === 'healthy') return 'degraded';
  return args.envStatus;
}

export async function buildParkingDiagnostics(args?: {
  airportCode?: string;
  checkInDate?: string;
  checkOutDate?: string;
}): Promise<ParkingDiagnosticsResponse> {
  const airportCode = (args?.airportCode || 'SEA').toUpperCase();
  const envAudit = buildProviderEnvAuditReport();
  const coverage = await auditAirportCoverage({
    airportCode,
    checkInDate: args?.checkInDate,
    checkOutDate: args?.checkOutDate,
  });

  const envByProvider = new Map(
    envAudit.providers
      .map((row) => {
        const id = mapEnvNameToProviderId(row.provider);
        return id ? [id, row] as const : null;
      })
      .filter((entry): entry is [ProviderId, (typeof envAudit.providers)[number]] => entry != null),
  );

  const providers: ProviderDiagnosticsRow[] = coverage.providerDiagnostics.map((diagnostic) => {
    const envRow = envByProvider.get(diagnostic.provider);

    return {
      provider: diagnostic.provider,
      displayName: DISPLAY_NAMES[diagnostic.provider],
      status: resolveRowStatus({
        envStatus: envRow?.currentStatus ?? 'degraded',
        enabled: diagnostic.enabled,
        failure: diagnostic.failure,
        resultsReturned: diagnostic.resultsReturned,
        healthStatus: diagnostic.healthStatus,
      }),
      enabled: diagnostic.enabled,
      resultsCount: diagnostic.resultsReturned,
      livePriceCount: diagnostic.livePriceCount,
      estimatedPriceCount: diagnostic.estimatedPriceCount,
      searchDurationMs: diagnostic.searchDurationMs,
      lastSuccess: diagnostic.lastSuccess,
      lastFailure: diagnostic.failure,
      healthMessage: diagnostic.healthMessage ?? envRow?.impact,
    };
  });

  return {
    checkedAt: new Date().toISOString(),
    airportCode,
    envAudit,
    providers,
    coverageSummary: {
      mergedOptionCount: coverage.mergedOptionCount,
      livePriceCount: coverage.livePriceCount,
      coverageGrade: coverage.coverageGrade,
      providerCount: coverage.providerCount,
    },
  };
}
