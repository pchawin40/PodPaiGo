export type EnvVarStatus = 'configured' | 'missing' | 'disabled';

export type ProviderActivationState =
  | 'healthy'
  | 'disabled'
  | 'missing_config'
  | 'error'
  | 'degraded';

export type ProviderEnvRequirement = {
  provider: string;
  requiredEnv: string[];
  optionalEnv: string[];
  currentStatus: ProviderActivationState;
  envStatus: Record<string, EnvVarStatus>;
  impact: string;
  activationNotes: string[];
};

export type ProviderEnvAuditReport = {
  checkedAt: string;
  providers: ProviderEnvRequirement[];
  summary: string;
};

function envConfigured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function envDisabledFlag(name: string, disabledWhenTrue: boolean): EnvVarStatus {
  if (!envConfigured(name)) return 'missing';
  const value = process.env[name]?.toLowerCase();
  if (disabledWhenTrue && value === 'true') return 'disabled';
  return 'configured';
}

function discoveryModeIncludes(provider: 'parkwhiz' | 'google'): boolean {
  const mode = process.env.PARKING_DISCOVERY_PROVIDER || 'all';
  return mode === 'all' || mode === provider;
}

function databaseConfigured(): boolean {
  return envConfigured('DATABASE_URL') || envConfigured('LOCAL_DATABASE_URL');
}

function inventoryCacheEnabled(): boolean {
  return process.env.DISABLE_PARKING_DB_CACHE !== 'true';
}

export function buildProviderEnvAuditReport(): ProviderEnvAuditReport {
  const googleKey = envConfigured('GOOGLE_MAPS_SERVER_API_KEY');
  const dbReady = databaseConfigured();
  const inventoryEnabled = inventoryCacheEnabled();
  const parkWhizEnabled = discoveryModeIncludes('parkwhiz');
  const googleDiscoveryEnabled = discoveryModeIncludes('google');
  const aprEnabled = process.env.DISABLE_APR_PARKING !== 'true';

  const providers: ProviderEnvRequirement[] = [
    {
      provider: 'Google Places',
      requiredEnv: ['GOOGLE_MAPS_SERVER_API_KEY'],
      optionalEnv: [
        'PARKING_DISCOVERY_PROVIDER',
        'PARKING_SEARCH_RADIUS_METERS',
        'PARKING_MAX_DISTANCE_MILES',
      ],
      envStatus: {
        GOOGLE_MAPS_SERVER_API_KEY: googleKey ? 'configured' : 'missing',
        PARKING_DISCOVERY_PROVIDER: envConfigured('PARKING_DISCOVERY_PROVIDER')
          ? 'configured'
          : 'missing',
      },
      currentStatus: !googleDiscoveryEnabled
        ? 'disabled'
        : !googleKey
          ? 'missing_config'
          : 'healthy',
      impact: googleKey
        ? 'Airport parking discovery via Google Places Text Search.'
        : 'Zero Google results at every airport; discovery relies on ParkWhiz only.',
      activationNotes: [
        'Enable Places API (New) on the Google Cloud project.',
        'Set GOOGLE_MAPS_SERVER_API_KEY in .env.local (local) and hosting env (production).',
        'Ensure PARKING_DISCOVERY_PROVIDER is all or google.',
      ],
    },
    {
      provider: 'Inventory',
      requiredEnv: ['DATABASE_URL or LOCAL_DATABASE_URL', 'DISABLE_PARKING_DB_CACHE=false'],
      optionalEnv: ['PARKING_DB_READ_TIMEOUT_MS'],
      envStatus: {
        DATABASE_URL: envConfigured('DATABASE_URL') ? 'configured' : 'missing',
        LOCAL_DATABASE_URL: envConfigured('LOCAL_DATABASE_URL') ? 'configured' : 'missing',
        DISABLE_PARKING_DB_CACHE: envDisabledFlag('DISABLE_PARKING_DB_CACHE', true),
      },
      currentStatus: !inventoryEnabled
        ? 'disabled'
        : !dbReady
          ? 'missing_config'
          : 'healthy',
      impact: dbReady && inventoryEnabled
        ? 'Reads discovered lots from parking_lots table per airport.'
        : 'Inventory provider returns empty; no DB-backed lot catalog.',
      activationNotes: [
        'Set DATABASE_URL to Postgres (Supabase transaction pooler in production).',
        'Set DISABLE_PARKING_DB_CACHE=false (or remove the variable).',
        'Populate lots via POST /api/parking/discover per airport.',
      ],
    },
    {
      provider: 'Snapshots',
      requiredEnv: ['DATABASE_URL or LOCAL_DATABASE_URL', 'DISABLE_PARKING_DB_CACHE=false'],
      optionalEnv: [
        'PARKING_PRICE_SNAPSHOT_READ_TIMEOUT_MS',
        'PARKING_SNAPSHOT_CACHE_TTL_MS',
      ],
      envStatus: {
        DATABASE_URL: envConfigured('DATABASE_URL') ? 'configured' : 'missing',
        DISABLE_PARKING_DB_CACHE: envDisabledFlag('DISABLE_PARKING_DB_CACHE', true),
      },
      currentStatus: !inventoryEnabled
        ? 'disabled'
        : !dbReady
          ? 'missing_config'
          : 'degraded',
      impact: dbReady && inventoryEnabled
        ? 'Cached selected-date prices from ParkWhiz saves enrich merged results.'
        : 'No snapshot prices; merge skips cached price enrichment.',
      activationNotes: [
        'Same DB activation as Inventory.',
        'Snapshots populate when ParkWhiz provider saves quotes (requires dates on search).',
      ],
    },
    {
      provider: 'APR',
      requiredEnv: [
        'DATABASE_URL or LOCAL_DATABASE_URL',
        'DISABLE_PARKING_DB_CACHE=false',
        'DISABLE_APR_PARKING unset or false',
      ],
      optionalEnv: ['DISABLE_APR_PARKING'],
      envStatus: {
        DATABASE_URL: envConfigured('DATABASE_URL') ? 'configured' : 'missing',
        DISABLE_PARKING_DB_CACHE: envDisabledFlag('DISABLE_PARKING_DB_CACHE', true),
        DISABLE_APR_PARKING: envDisabledFlag('DISABLE_APR_PARKING', true),
      },
      currentStatus: !aprEnabled
        ? 'disabled'
        : !dbReady || !inventoryEnabled
          ? 'missing_config'
          : 'degraded',
      impact: 'SEA-only APR lots from DB cache. Without cache refresh, returns 0 even when enabled.',
      activationNotes: [
        'APR code path is SEA-only.',
        'Refresh cache: GET /api/admin/refresh-apr?checkInDate=YYYY-MM-DD&checkOutDate=YYYY-MM-DD',
        'Requires DATABASE_URL and DISABLE_PARKING_DB_CACHE=false.',
      ],
    },
    {
      provider: 'Marketplace',
      requiredEnv: [],
      optionalEnv: [],
      envStatus: {},
      currentStatus: 'healthy',
      impact: 'Always returns SpotHero link card (estimated, not live API).',
      activationNotes: ['No environment variables required.'],
    },
    {
      provider: 'ParkWhiz',
      requiredEnv: ['checkInDate + checkOutDate on search context'],
      optionalEnv: [
        'PARKING_DISCOVERY_PROVIDER',
        'PARKWHIZ_CACHE_READ_TIMEOUT_MS',
        'PARKWHIZ_CACHE_SAVE_TIMEOUT_MS',
        'DATABASE_URL (for quote cache)',
      ],
      envStatus: {
        PARKING_DISCOVERY_PROVIDER: parkWhizEnabled ? 'configured' : 'disabled',
        DATABASE_URL: dbReady ? 'configured' : 'missing',
      },
      currentStatus: !parkWhizEnabled ? 'disabled' : 'healthy',
      impact: parkWhizEnabled
        ? 'Live bookable quotes via ParkWhiz public API (primary live price source today).'
        : 'ParkWhiz disabled when PARKING_DISCOVERY_PROVIDER excludes parkwhiz.',
      activationNotes: [
        'No API key required for ParkWhiz public quotes endpoint.',
        'Trip must include parking check-in and check-out dates.',
        'Optional DATABASE_URL caches quotes between requests.',
      ],
    },
  ];

  const missing = providers.filter((p) => p.currentStatus === 'missing_config').length;
  const disabled = providers.filter((p) => p.currentStatus === 'disabled').length;

  return {
    checkedAt: new Date().toISOString(),
    providers,
    summary: `${missing} provider(s) missing configuration, ${disabled} disabled by env flags.`,
  };
}
