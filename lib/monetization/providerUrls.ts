import type { ParkingOption } from '../types';

export type ProviderKind = 'parkwhiz' | 'apr' | 'spothero' | 'other';

export type ProviderOutboundContext = {
  provider?: string | null;
  bookingProvider?: string | null;
  sourceName?: string | null;
  airportCode?: string | null;
  tripType?: string | null;
  parkingLotId?: string | null;
  clickId?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  searchQuery?: string | null;
  priceSource?: string | null;
};

export type ProviderAffiliateConfig = {
  parkwhiz: {
    affiliateId?: string;
    affiliateParam?: string;
    subIdParam?: string;
  };
  apr: {
    affiliateId?: string;
    affiliateParam?: string;
    subIdParam?: string;
  };
  spothero: {
    affiliateId?: string;
    affiliateParam?: string;
    subIdParam?: string;
  };
  generic: {
    subIdParam?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  };
};

export type ProviderOutboundUrlResult = {
  url: string;
  affiliateAttached: boolean;
  targetHost: string | null;
  subIdParam?: string;
};

const EMPTY_AFFILIATE_CONFIG: ProviderAffiliateConfig = {
  parkwhiz: {},
  apr: {},
  spothero: {},
  generic: {},
};

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getProviderAffiliateConfigFromEnv(): ProviderAffiliateConfig {
  return {
    parkwhiz: {
      affiliateId: trimEnv(process.env.PARKWHIZ_AFFILIATE_ID),
      affiliateParam: trimEnv(process.env.PARKWHIZ_AFFILIATE_PARAM),
      subIdParam: trimEnv(process.env.PARKWHIZ_SUB_ID_PARAM),
    },
    apr: {
      affiliateId: trimEnv(process.env.APR_AFFILIATE_ID),
      affiliateParam: trimEnv(process.env.APR_AFFILIATE_PARAM),
      subIdParam: trimEnv(process.env.APR_SUB_ID_PARAM),
    },
    spothero: {
      affiliateId: trimEnv(process.env.SPOTHERO_AFFILIATE_ID),
      affiliateParam: trimEnv(process.env.SPOTHERO_AFFILIATE_PARAM),
      subIdParam: trimEnv(process.env.SPOTHERO_SUB_ID_PARAM),
    },
    generic: {
      subIdParam: trimEnv(process.env.PODPAIGO_OUTBOUND_SUBID_PARAM),
      utmSource: trimEnv(process.env.PODPAIGO_UTM_SOURCE),
      utmMedium: trimEnv(process.env.PODPAIGO_UTM_MEDIUM),
      utmCampaign: trimEnv(process.env.PODPAIGO_UTM_CAMPAIGN),
    },
  };
}

export function resolveProviderKind(input: {
  provider?: string | null;
  bookingProvider?: string | null;
  sourceName?: string | null;
  url?: string | null;
}): ProviderKind {
  const text = [
    input.bookingProvider,
    input.sourceName,
    input.provider,
    input.url,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (text.includes('parkwhiz') || text.includes('parkwhiz.com')) return 'parkwhiz';
  if (
    text.includes('airportparkingreservations') ||
    text.includes('airport parking reservations')
  ) {
    return 'apr';
  }
  if (text.includes('spothero') || text.includes('spothero.com')) return 'spothero';
  return 'other';
}

export function extractSanitizedTargetHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function sanitizeToken(value: string | null | undefined, maxLength = 32): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!cleaned) return undefined;
  return cleaned.slice(0, maxLength);
}

export function buildSanitizedSubIdValue(context: ProviderOutboundContext): string {
  const parts = [
    sanitizeToken(context.provider || context.bookingProvider || context.sourceName, 20),
    sanitizeToken(context.airportCode || undefined, 8),
    sanitizeToken(context.tripType || undefined, 24),
    sanitizeToken(context.parkingLotId || undefined, 32),
    sanitizeToken(context.clickId || undefined, 16),
  ].filter(Boolean);

  return parts.join('_').slice(0, 120) || 'podpaigo';
}

function isGenericSpotHeroUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('spothero.com')) return false;
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return path === '' || path === '/' || path === '/airport-parking';
  } catch {
    return false;
  }
}

function resolveSpotHeroSearchTarget(
  url: string,
  context: ProviderOutboundContext,
): string {
  if (!isGenericSpotHeroUrl(url)) return url;

  const searchText =
    context.searchQuery?.trim() ||
    (context.airportCode ? `${context.airportCode} airport parking` : '');

  if (!searchText) return url;

  const parsed = new URL('https://spothero.com/search');
  parsed.searchParams.set('search', searchText);
  return parsed.toString();
}

function setQueryParamIfAbsent(url: URL, param: string, value: string): boolean {
  if (!param || !value || url.searchParams.has(param)) return false;
  url.searchParams.set(param, value);
  return true;
}

function resolveProviderAffiliateSettings(
  kind: ProviderKind,
  config: ProviderAffiliateConfig,
): {
  affiliateId?: string;
  affiliateParam?: string;
  subIdParam?: string;
} {
  if (kind === 'parkwhiz') return config.parkwhiz;
  if (kind === 'apr') return config.apr;
  if (kind === 'spothero') return config.spothero;
  return {};
}

function resolveSubIdParam(
  kind: ProviderKind,
  config: ProviderAffiliateConfig,
): string | undefined {
  const providerSettings = resolveProviderAffiliateSettings(kind, config);
  return providerSettings.subIdParam || config.generic.subIdParam;
}

export function appendParkingAffiliateParams(
  rawUrl: string,
  providerKind: ProviderKind,
  context: ProviderOutboundContext,
  config: ProviderAffiliateConfig = EMPTY_AFFILIATE_CONFIG,
): ProviderOutboundUrlResult {
  if (!rawUrl?.trim()) {
    return { url: rawUrl, affiliateAttached: false, targetHost: null };
  }

  let workingUrl = rawUrl.trim();
  if (providerKind === 'spothero') {
    workingUrl = resolveSpotHeroSearchTarget(workingUrl, context);
  }

  let affiliateAttached = false;
  let subIdParam: string | undefined;

  try {
    const parsed = new URL(workingUrl);
    const providerSettings = resolveProviderAffiliateSettings(providerKind, config);

    if (providerSettings.affiliateId && providerSettings.affiliateParam) {
      const added = setQueryParamIfAbsent(
        parsed,
        providerSettings.affiliateParam,
        providerSettings.affiliateId,
      );
      if (
        added ||
        parsed.searchParams.get(providerSettings.affiliateParam) === providerSettings.affiliateId
      ) {
        affiliateAttached = true;
      }
    }

    subIdParam = resolveSubIdParam(providerKind, config);
    if (context.clickId && subIdParam) {
      setQueryParamIfAbsent(parsed, subIdParam, buildSanitizedSubIdValue(context));
    }

    const shouldAttachUtm =
      affiliateAttached ||
      Boolean(
        config.generic.utmSource ||
          config.generic.utmMedium ||
          config.generic.utmCampaign,
      );

    if (shouldAttachUtm) {
      if (config.generic.utmSource) {
        setQueryParamIfAbsent(parsed, 'utm_source', config.generic.utmSource);
      }
      if (config.generic.utmMedium) {
        setQueryParamIfAbsent(parsed, 'utm_medium', config.generic.utmMedium);
      }
      if (config.generic.utmCampaign) {
        setQueryParamIfAbsent(parsed, 'utm_campaign', config.generic.utmCampaign);
      }
    }

    const finalUrl = parsed.toString();
    return {
      url: finalUrl,
      affiliateAttached,
      targetHost: extractSanitizedTargetHost(finalUrl),
      subIdParam,
    };
  } catch {
    return {
      url: workingUrl,
      affiliateAttached: false,
      targetHost: extractSanitizedTargetHost(workingUrl),
      subIdParam: resolveSubIdParam(providerKind, config),
    };
  }
}

export function buildParkWhizOutboundUrl(
  rawUrl: string,
  context: ProviderOutboundContext,
  config: ProviderAffiliateConfig = EMPTY_AFFILIATE_CONFIG,
): ProviderOutboundUrlResult {
  return appendParkingAffiliateParams(rawUrl, 'parkwhiz', context, config);
}

export function buildAprOutboundUrl(
  rawUrl: string,
  context: ProviderOutboundContext,
  config: ProviderAffiliateConfig = EMPTY_AFFILIATE_CONFIG,
): ProviderOutboundUrlResult {
  return appendParkingAffiliateParams(rawUrl, 'apr', context, config);
}

export function buildSpotHeroOutboundUrl(
  rawUrl: string,
  context: ProviderOutboundContext,
  config: ProviderAffiliateConfig = EMPTY_AFFILIATE_CONFIG,
): ProviderOutboundUrlResult {
  return appendParkingAffiliateParams(rawUrl, 'spothero', context, config);
}

export function buildProviderOutboundUrl(
  option: Pick<
    ParkingOption,
    | 'sourceLink'
    | 'bookingProvider'
    | 'sourceName'
    | 'id'
    | 'priceSource'
    | 'searchQuery'
    | 'lat'
    | 'lng'
    | 'serviceAirportCode'
  >,
  context: ProviderOutboundContext = {},
  config: ProviderAffiliateConfig = EMPTY_AFFILIATE_CONFIG,
): ProviderOutboundUrlResult {
  const baseUrl = option.sourceLink?.trim() || '';
  if (!baseUrl) {
    return { url: '', affiliateAttached: false, targetHost: null };
  }

  const providerKind = resolveProviderKind({
    bookingProvider: option.bookingProvider,
    sourceName: option.sourceName,
    provider: context.provider,
    url: baseUrl,
  });

  const mergedContext: ProviderOutboundContext = {
    ...context,
    bookingProvider: option.bookingProvider || context.bookingProvider,
    sourceName: option.sourceName || context.sourceName,
    parkingLotId: context.parkingLotId || option.id,
    priceSource: context.priceSource || option.priceSource,
    searchQuery: context.searchQuery || option.searchQuery,
    airportCode: context.airportCode || option.serviceAirportCode,
    destinationLat: context.destinationLat ?? option.lat,
    destinationLng: context.destinationLng ?? option.lng,
  };

  if (providerKind === 'parkwhiz') {
    return buildParkWhizOutboundUrl(baseUrl, mergedContext, config);
  }
  if (providerKind === 'apr') {
    return buildAprOutboundUrl(baseUrl, mergedContext, config);
  }
  if (providerKind === 'spothero') {
    return buildSpotHeroOutboundUrl(baseUrl, mergedContext, config);
  }

  return appendParkingAffiliateParams(baseUrl, 'other', mergedContext, config);
}

export function enrichParkingOptionOutboundUrl(
  option: ParkingOption,
  context: {
    airportCode?: string | null;
    tripType?: string | null;
    searchQuery?: string | null;
  } = {},
  config: ProviderAffiliateConfig = getProviderAffiliateConfigFromEnv(),
): ParkingOption {
  if (!option.sourceLink?.trim()) return option;

  const result = buildProviderOutboundUrl(option, {
    airportCode: context.airportCode,
    tripType: context.tripType,
    searchQuery: context.searchQuery,
    provider: option.bookingProvider || option.sourceName,
  }, config);

  if (result.url === option.sourceLink && !result.affiliateAttached && !result.subIdParam) {
    return option;
  }

  return {
    ...option,
    sourceLink: result.url,
    outboundAffiliateAttached: result.affiliateAttached,
    outboundSubIdParam: result.subIdParam,
  };
}

export function enrichParkingOptionsOutboundUrls(
  options: ParkingOption[],
  context: {
    airportCode?: string | null;
    tripType?: string | null;
    searchQuery?: string | null;
  } = {},
  config?: ProviderAffiliateConfig,
): ParkingOption[] {
  const resolvedConfig = config ?? getProviderAffiliateConfigFromEnv();
  return options.map((option) =>
    enrichParkingOptionOutboundUrl(option, context, resolvedConfig),
  );
}

export function appendClickCorrelationToOutboundUrl(
  rawUrl: string,
  context: ProviderOutboundContext,
  subIdParam?: string | null,
): ProviderOutboundUrlResult {
  if (!rawUrl?.trim() || !subIdParam?.trim() || !context.clickId?.trim()) {
    return {
      url: rawUrl,
      affiliateAttached: false,
      targetHost: extractSanitizedTargetHost(rawUrl),
      subIdParam: subIdParam || undefined,
    };
  }

  try {
    const parsed = new URL(rawUrl);
    setQueryParamIfAbsent(parsed, subIdParam.trim(), buildSanitizedSubIdValue(context));
    const finalUrl = parsed.toString();
    return {
      url: finalUrl,
      affiliateAttached: false,
      targetHost: extractSanitizedTargetHost(finalUrl),
      subIdParam: subIdParam.trim(),
    };
  } catch {
    return {
      url: rawUrl,
      affiliateAttached: false,
      targetHost: extractSanitizedTargetHost(rawUrl),
      subIdParam: subIdParam || undefined,
    };
  }
}

export function resolveProviderReserveLabel(option: {
  bookingProvider?: string;
  sourceName?: string;
  priceDisplay?: string;
  priceSource?: string;
  sourceLink?: string;
  trustStatus?: string;
}): string | undefined {
  const kind = resolveProviderKind({
    bookingProvider: option.bookingProvider,
    sourceName: option.sourceName,
    url: option.sourceLink,
  });

  if (kind === 'parkwhiz') {
    if (
      option.priceSource === 'parkwhiz-live' ||
      option.priceDisplay === 'live' ||
      option.trustStatus === 'live'
    ) {
      return 'Reserve';
    }
    return undefined;
  }

  if (kind === 'apr') {
    return 'Check live price';
  }

  if (kind === 'spothero') {
    return 'Compare on SpotHero';
  }

  return undefined;
}

export function resolveProviderViewLabel(option: {
  bookingProvider?: string;
  sourceName?: string;
  sourceLink?: string;
}): string | undefined {
  const kind = resolveProviderKind({
    bookingProvider: option.bookingProvider,
    sourceName: option.sourceName,
    url: option.sourceLink,
  });

  if (kind === 'spothero') {
    return 'Compare on SpotHero';
  }

  if (kind === 'apr') {
    return 'Check live price';
  }

  return undefined;
}
