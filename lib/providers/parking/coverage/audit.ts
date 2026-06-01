import { getGoogleMapsServerApiKey } from '../../../env/googleMapsServerKey';
import { getAirportById } from '../../../airports/catalog';
import type { ParkingOption } from '../../../types';
import { parkingProviderRegistry } from '../registry';
import { registerDefaultParkingProviders, resetDefaultParkingProvidersForTests } from '../registerDefaults';
import { aggregateAirportParkingOptions } from '../aggregator';
import { resetParkingSearchCacheForTests } from '../searchCache';
import { resetParkingPriceSnapshotCacheForTests } from '../shared/snapshots';
import { gradeAirportCoverage } from './grades';
import type {
  AirportCoverageDashboard,
  AirportCoverageReport,
  ProviderBreakdown,
  ProviderDiagnostic,
  ProviderId,
} from './types';
import { countPriceFreshness } from './types';

const ALL_PROVIDERS: ProviderId[] = [
  'inventory',
  'parkwhiz',
  'google',
  'apr',
  'snapshot',
  'marketplace',
];

const DEFAULT_AUDIT_AIRPORTS = ['SEA', 'PAE', 'LAX', 'JFK', 'ORD', 'ATL', 'DFW', 'LAS', 'MCO'];

function defaultCheckInDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function defaultCheckOutDate(checkIn: string): string {
  const date = new Date(`${checkIn}T12:00:00`);
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

function discoveryModeIncludes(provider: 'parkwhiz' | 'google'): boolean {
  const mode = process.env.PARKING_DISCOVERY_PROVIDER || 'all';
  return mode === 'all' || mode === provider;
}

function readEnvironmentFlags() {
  return {
    googleApiConfigured: Boolean(getGoogleMapsServerApiKey()),
    inventoryEnabled: process.env.DISABLE_PARKING_DB_CACHE !== 'true',
    parkWhizDiscoveryEnabled: discoveryModeIncludes('parkwhiz'),
    aprEnabled: process.env.DISABLE_APR_PARKING !== 'true',
  };
}

async function auditProvider(
  providerId: ProviderId,
  context: {
    airportCode: string;
    destination: string;
    checkInDate: string;
    checkOutDate: string;
    airportCoordinates?: { lat: number; lng: number };
  },
): Promise<ProviderDiagnostic> {
  const provider = parkingProviderRegistry.getProvider(providerId);

  if (!provider) {
    return {
      provider: providerId,
      enabled: false,
      healthStatus: 'offline',
      healthMessage: 'Provider not registered',
      searchDurationMs: 0,
      resultsReturned: 0,
      livePriceCount: 0,
      estimatedPriceCount: 0,
      failure: 'not registered',
    };
  }

  const enabled = provider.enabled();
  const health = await provider.health().catch((error) => ({
    status: 'offline' as const,
    message: error instanceof Error ? error.message : String(error),
    checkedAt: new Date().toISOString(),
  }));

  if (!enabled || health.status === 'offline') {
    return {
      provider: providerId,
      enabled,
      healthStatus: health.status,
      healthMessage: health.message,
      searchDurationMs: 0,
      resultsReturned: 0,
      livePriceCount: 0,
      estimatedPriceCount: 0,
      failure: health.message || (enabled ? 'offline' : 'disabled'),
    };
  }

  const started = Date.now();

  try {
    const options = await provider.search({
      airportCode: context.airportCode,
      airportCoordinates: context.airportCoordinates,
      destination: context.destination,
      checkInDate: context.checkInDate,
      checkOutDate: context.checkOutDate,
    });

    const durationMs = Date.now() - started;
    const freshness = countPriceFreshness(options);

    return {
      provider: providerId,
      enabled,
      healthStatus: health.status,
      healthMessage: health.message,
      searchDurationMs: durationMs,
      resultsReturned: options.length,
      livePriceCount: freshness.live,
      estimatedPriceCount: freshness.estimated,
      lastSuccess: new Date().toISOString(),
    };
  } catch (error) {
    return {
      provider: providerId,
      enabled,
      healthStatus: 'offline',
      healthMessage: health.message,
      searchDurationMs: Date.now() - started,
      resultsReturned: 0,
      livePriceCount: 0,
      estimatedPriceCount: 0,
      failure: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildProviderBreakdown(diagnostics: ProviderDiagnostic[]): ProviderBreakdown {
  return ALL_PROVIDERS.reduce((acc, providerId) => {
    acc[providerId] = diagnostics.find((d) => d.provider === providerId)?.resultsReturned ?? 0;
    return acc;
  }, {} as ProviderBreakdown);
}

function buildMissingProviders(
  breakdown: ProviderBreakdown,
  diagnostics: ProviderDiagnostic[],
): ProviderId[] {
  return ALL_PROVIDERS.filter((providerId) => {
    const diagnostic = diagnostics.find((d) => d.provider === providerId);
    if (!diagnostic?.enabled) return true;
    if (diagnostic.failure) return true;
    return breakdown[providerId] === 0;
  });
}

function buildNotes(
  airportCode: string,
  breakdown: ProviderBreakdown,
  diagnostics: ProviderDiagnostic[],
  env: ReturnType<typeof readEnvironmentFlags>,
): string[] {
  const notes: string[] = [];

  if (airportCode === 'SEA' && breakdown.apr > 0) {
    notes.push('APR cache available for SEA only.');
  } else if (airportCode !== 'SEA' && diagnostics.find((d) => d.provider === 'apr')?.enabled) {
    notes.push('APR provider enabled but returns no lots outside SEA.');
  }

  if (!env.googleApiConfigured && breakdown.google === 0) {
    notes.push('Google Places returned 0 — GOOGLE_MAPS_SERVER_API_KEY not configured.');
  }

  if (!env.inventoryEnabled && breakdown.inventory === 0) {
    notes.push('Inventory disabled via DISABLE_PARKING_DB_CACHE=true.');
  }

  if (!env.inventoryEnabled && breakdown.snapshot === 0) {
    notes.push('Snapshot provider disabled with inventory cache flag.');
  }

  if (breakdown.parkwhiz === 0 && env.parkWhizDiscoveryEnabled) {
    notes.push('ParkWhiz returned 0 — may need dates, API timeout, or sparse market coverage.');
  }

  if (breakdown.marketplace > 0) {
    notes.push('Marketplace adds link-only SpotHero card (not live inventory).');
  }

  return notes;
}

export async function auditAirportCoverage(args: {
  airportCode: string;
  checkInDate?: string;
  checkOutDate?: string;
}): Promise<AirportCoverageReport> {
  resetDefaultParkingProvidersForTests();
  resetParkingSearchCacheForTests();
  resetParkingPriceSnapshotCacheForTests();

  const airportCode = args.airportCode.toUpperCase();
  const airport = getAirportById(airportCode);
  const checkInDate = args.checkInDate ?? defaultCheckInDate();
  const checkOutDate = args.checkOutDate ?? defaultCheckOutDate(checkInDate);
  const destination = airport?.routingAddress ?? `${airport?.label ?? airportCode} (${airportCode})`;
  const env = readEnvironmentFlags();

  registerDefaultParkingProviders();

  const diagnostics = await Promise.all(
    ALL_PROVIDERS.map((providerId) =>
      auditProvider(providerId, {
        airportCode,
        destination,
        checkInDate,
        checkOutDate,
        airportCoordinates: airport?.geoLocation,
      }),
    ),
  );

  const providerBreakdown = buildProviderBreakdown(diagnostics);
  const rawOptionCount = ALL_PROVIDERS.reduce((sum, id) => sum + providerBreakdown[id], 0);
  const providerCount = diagnostics.filter(
    (d) => d.enabled && !d.failure && d.resultsReturned > 0,
  ).length;

  const rawFreshness = countPriceFreshness(
    diagnostics.flatMap((d) => Array(d.resultsReturned).fill(null).map((_, i) => ({
      priceFreshness: i < d.livePriceCount
        ? 'live' as const
        : i < d.livePriceCount + d.estimatedPriceCount
          ? 'estimated' as const
          : 'unknown' as const,
    }))) as ParkingOption[],
  );

  let mergedOptionCount = 0;
  let mergedFreshness = { live: 0, estimated: 0, unknown: 0 };

  try {
    const merged = await aggregateAirportParkingOptions({
      airportCode,
      airportCoordinates: airport?.geoLocation,
      destination,
      checkInDate,
      checkOutDate,
    });
    mergedOptionCount = merged.length;
    mergedFreshness = countPriceFreshness(merged);
  } catch (error) {
    diagnostics.push({
      provider: 'inventory',
      enabled: true,
      healthStatus: 'offline',
      searchDurationMs: 0,
      resultsReturned: 0,
      livePriceCount: 0,
      estimatedPriceCount: 0,
      failure: error instanceof Error ? error.message : String(error),
    });
  }

  const reportBase = {
    providerCount,
    parkingOptionCount: rawOptionCount,
    livePriceCount: mergedFreshness.live,
    estimatedPriceCount: mergedFreshness.estimated,
  };

  return {
    airportCode,
    airportLabel: airport?.label ?? airportCode,
    destination,
    ...reportBase,
    unknownPriceCount: mergedFreshness.unknown,
    mergedOptionCount,
    coverageGrade: gradeAirportCoverage({
      ...reportBase,
      mergedOptionCount,
    }),
    providerBreakdown,
    providerDiagnostics: diagnostics,
    missingProviders: buildMissingProviders(providerBreakdown, diagnostics),
    notes: buildNotes(airportCode, providerBreakdown, diagnostics, env),
  };
}

export async function buildAirportCoverageDashboard(args?: {
  airportCodes?: string[];
  checkInDate?: string;
  checkOutDate?: string;
}): Promise<AirportCoverageDashboard> {
  const airportCodes = args?.airportCodes ?? DEFAULT_AUDIT_AIRPORTS;
  const checkInDate = args?.checkInDate ?? defaultCheckInDate();
  const checkOutDate = args?.checkOutDate ?? defaultCheckOutDate(checkInDate);
  const env = readEnvironmentFlags();

  const airports: AirportCoverageReport[] = [];

  for (const airportCode of airportCodes) {
    airports.push(await auditAirportCoverage({ airportCode, checkInDate, checkOutDate }));
  }

  const poorCoverageAirports = airports
    .filter((report) => report.coverageGrade === 'D' || report.coverageGrade === 'F')
    .map((report) => report.airportCode);

  const avgLive = airports.reduce((sum, r) => sum + r.livePriceCount, 0) / airports.length;
  const parkWhizGap = airports.filter((r) => r.providerBreakdown.parkwhiz === 0).length;
  const inventoryGap = airports.filter((r) => r.providerBreakdown.inventory === 0).length;

  let recommendedNextProvider = 'ParkWhiz API expansion (already integrated; improve geo/dates coverage)';
  if (!env.googleApiConfigured) {
    recommendedNextProvider = 'Configure GOOGLE_MAPS_SERVER_API_KEY — unlocks Google Places for all airports';
  } else if (inventoryGap >= airportCodes.length * 0.7) {
    recommendedNextProvider = 'Enable inventory DB + run /api/parking/discover cron for each hub airport';
  } else if (avgLive < 2) {
    recommendedNextProvider = 'SpotHero live API (marketplace is link-only today)';
  } else if (parkWhizGap >= airportCodes.length * 0.5) {
    recommendedNextProvider = 'Improve ParkWhiz search radius and timeout before adding new providers';
  }

  return {
    generatedAt: new Date().toISOString(),
    checkInDate,
    checkOutDate,
    environment: env,
    airports,
    poorCoverageAirports,
    recommendedNextProvider,
    summary: `${airports.filter((r) => r.coverageGrade === 'C' || r.coverageGrade === 'D' || r.coverageGrade === 'F').length}/${airports.length} airports at grade C or below; ${poorCoverageAirports.length} at D/F.`,
  };
}

export function formatCoverageDashboardMarkdown(dashboard: AirportCoverageDashboard): string {
  const lines: string[] = [
    `# Airport Parking Coverage Report`,
    ``,
    `Generated: ${dashboard.generatedAt}`,
    `Trip dates: ${dashboard.checkInDate} → ${dashboard.checkOutDate}`,
    ``,
    `## Environment`,
    `- Google API: ${dashboard.environment.googleApiConfigured ? 'yes' : 'no'}`,
    `- Inventory enabled: ${dashboard.environment.inventoryEnabled ? 'yes' : 'no'}`,
    `- ParkWhiz discovery: ${dashboard.environment.parkWhizDiscoveryEnabled ? 'yes' : 'no'}`,
    `- APR enabled: ${dashboard.environment.aprEnabled ? 'yes' : 'no'}`,
    ``,
    `## Summary`,
    dashboard.summary,
    ``,
    `**Recommended next provider:** ${dashboard.recommendedNextProvider}`,
    ``,
    `**Poor coverage (D/F):** ${dashboard.poorCoverageAirports.join(', ') || 'none'}`,
    ``,
  ];

  for (const report of dashboard.airports) {
    lines.push(`## ${report.airportCode} — Grade ${report.coverageGrade}`);
    lines.push(`- Merged options: ${report.mergedOptionCount}`);
    lines.push(`- Raw provider options: ${report.parkingOptionCount}`);
    lines.push(`- Active providers: ${report.providerCount}`);
    lines.push(`- Live prices: ${report.livePriceCount} | Estimated: ${report.estimatedPriceCount}`);
    lines.push(`- Provider counts: inventory=${report.providerBreakdown.inventory}, google=${report.providerBreakdown.google}, parkwhiz=${report.providerBreakdown.parkwhiz}, apr=${report.providerBreakdown.apr}, snapshot=${report.providerBreakdown.snapshot}, marketplace=${report.providerBreakdown.marketplace}`);
    lines.push(`- Missing/empty: ${report.missingProviders.join(', ') || 'none'}`);
    if (report.notes.length > 0) {
      lines.push(`- Notes: ${report.notes.join(' ')}`);
    }
    lines.push(``);
    lines.push(`| Provider | Duration (ms) | Results | Live | Est | Status |`);
    lines.push(`|----------|---------------|---------|------|-----|--------|`);
    for (const d of report.providerDiagnostics) {
      lines.push(`| ${d.provider} | ${d.searchDurationMs} | ${d.resultsReturned} | ${d.livePriceCount} | ${d.estimatedPriceCount} | ${d.failure ?? d.healthStatus} |`);
    }
    lines.push(``);
  }

  return lines.join('\n');
}
