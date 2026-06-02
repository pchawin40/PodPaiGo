export type ApiProvider =
  | 'google_routes'
  | 'google_places'
  | 'geocoding'
  | 'apr'
  | 'parkwhiz';

export type ProviderCallLog = {
  provider: ApiProvider;
  requestKey: string;
  cacheHit?: boolean;
  snapshotHit?: boolean;
  liveCall?: boolean;
  blockedByBudget?: boolean;
  blockedByKillSwitch?: boolean;
  estimatedCost?: number;
  timestamp?: string;
  note?: string;
};

export type ApiUsageDiagnostics = {
  providers: Record<
    ApiProvider,
    {
      dailyCount: number;
      monthlyCount: number;
      dailyLimit: number;
      monthlyLimit: number;
      estimatedCostToday: number;
      estimatedCostMonth: number;
      lastRequestAt: string | null;
      disabled: boolean;
    }
  >;
  session: {
    cacheHits: number;
    snapshotHits: number;
    liveCalls: number;
    blockedByBudget: number;
    blockedByKillSwitch: number;
  };
  searchBudget: {
    active: boolean;
    routeCalls: number;
    quoteCalls: number;
    maxRouteCalls: number;
    maxQuoteCalls: number;
  };
};
