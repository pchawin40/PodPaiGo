import { sanitizeAnalyticsProperties } from '../../analytics/sanitizeAnalytics';
import {
  appendClickCorrelationToOutboundUrl,
  appendParkingAffiliateParams,
  buildAprOutboundUrl,
  buildParkWhizOutboundUrl,
  buildProviderOutboundUrl,
  buildSpotHeroOutboundUrl,
  enrichParkingOptionOutboundUrl,
  getProviderAffiliateConfigFromEnv,
  resolveProviderKind,
  resolveProviderReserveLabel,
  type ProviderAffiliateConfig,
} from '../providerUrls';
import type { ParkingOption } from '../../types';

const parkWhizConfig: ProviderAffiliateConfig = {
  parkwhiz: {
    affiliateId: 'pw-aff-123',
    affiliateParam: 'aid',
    subIdParam: 'subid',
  },
  apr: {},
  spothero: {},
  generic: {
    utmSource: 'podpaigo',
    utmMedium: 'referral',
    utmCampaign: 'parking',
  },
};

const aprConfig: ProviderAffiliateConfig = {
  parkwhiz: {},
  apr: {
    affiliateId: 'apr-aff-9',
    affiliateParam: 'ref',
    subIdParam: 'sub',
  },
  spothero: {},
  generic: {},
};

const spotHeroConfig: ProviderAffiliateConfig = {
  parkwhiz: {},
  apr: {},
  spothero: {
    affiliateId: 'sh-aff',
    affiliateParam: 'partner',
  },
  generic: {
    utmSource: 'podpaigo',
    utmMedium: 'referral',
    utmCampaign: 'parking',
  },
};

function baseParkingOption(overrides: Partial<ParkingOption> = {}): ParkingOption {
  return {
    id: 'lot-1',
    name: 'Test Lot',
    type: 'off-airport',
    price: 20,
    availability: 50,
    trustStatus: 'estimated',
    sourceName: 'ParkWhiz',
    lastUpdated: '2026-06-09T00:00:00.000Z',
    assumptions: [],
    ...overrides,
  };
}

describe('provider outbound URL builder', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('ParkWhiz preserves site:purchase URL and appends configured affiliate/sub-id params', () => {
    const baseUrl =
      'https://www.parkwhiz.com/seattle-parking/garage-1/?foo=bar&site=purchase#checkout';
    const result = buildParkWhizOutboundUrl(
      baseUrl,
      {
        provider: 'ParkWhiz',
        tripType: 'general-trip',
        parkingLotId: 'pw-65141',
        clickId: 'click-abc',
      },
      parkWhizConfig,
    );

    const parsed = new URL(result.url);
    expect(parsed.origin + parsed.pathname).toBe('https://www.parkwhiz.com/seattle-parking/garage-1/');
    expect(parsed.searchParams.get('foo')).toBe('bar');
    expect(parsed.searchParams.get('aid')).toBe('pw-aff-123');
    expect(parsed.searchParams.get('subid')?.toLowerCase()).toContain('parkwhiz');
    expect(parsed.searchParams.get('subid')).toContain('click-abc');
    expect(parsed.searchParams.get('utm_source')).toBe('podpaigo');
    expect(result.affiliateAttached).toBe(true);
    expect(result.targetHost).toBe('www.parkwhiz.com');
  });

  test('ParkWhiz URL unchanged when affiliate env vars are missing', () => {
    const baseUrl = 'https://www.parkwhiz.com/seattle-parking/garage-1/?foo=bar';
    const result = buildParkWhizOutboundUrl(baseUrl, { provider: 'ParkWhiz' }, {
      parkwhiz: {},
      apr: {},
      spothero: {},
      generic: {},
    });

    expect(result.url).toBe(baseUrl);
    expect(result.affiliateAttached).toBe(false);
  });

  test('APR URL appends configured affiliate/sub-id params without changing pricing provenance fields', () => {
    const baseUrl =
      'https://www.airportparkingreservations.com/sea/lot-a?checkindate=June%2010,%202026';
    const option = baseParkingOption({
      bookingProvider: 'AirportParkingReservations',
      sourceName: 'AirportParkingReservations',
      sourceLink: baseUrl,
      priceSource: 'marketplace-link',
      priceDisplay: 'from-per-day',
      priceConfidence: 'low',
    });

    const result = buildAprOutboundUrl(
      baseUrl,
      {
        provider: 'AirportParkingReservations',
        airportCode: 'SEA',
        tripType: 'airport-trip',
        parkingLotId: option.id,
        clickId: 'apr-click',
      },
      aprConfig,
    );

    const parsed = new URL(result.url);
    expect(parsed.searchParams.get('checkindate')).toBe('June 10, 2026');
    expect(parsed.searchParams.get('ref')).toBe('apr-aff-9');
    expect(parsed.searchParams.get('sub')?.toLowerCase()).toContain('sea');
    expect(result.affiliateAttached).toBe(true);

    const enriched = enrichParkingOptionOutboundUrl(option, { airportCode: 'SEA', tripType: 'airport-trip' }, aprConfig);
    expect(enriched.priceSource).toBe('marketplace-link');
    expect(enriched.priceDisplay).toBe('from-per-day');
    expect(enriched.priceConfidence).toBe('low');
    expect(enriched.outboundAffiliateAttached).toBe(true);
  });

  test('SpotHero generic URL uses search deep link and only safe configured params', () => {
    const result = buildSpotHeroOutboundUrl(
      'https://spothero.com/airport-parking/',
      {
        provider: 'SpotHero',
        airportCode: 'SEA',
        searchQuery: 'Seattle-Tacoma International Airport parking',
      },
      spotHeroConfig,
    );

    const parsed = new URL(result.url);
    expect(parsed.pathname).toBe('/search');
    expect(parsed.searchParams.get('search')).toBe('Seattle-Tacoma International Airport parking');
    expect(parsed.searchParams.get('partner')).toBe('sh-aff');
    expect(parsed.searchParams.get('utm_source')).toBe('podpaigo');
    expect(result.affiliateAttached).toBe(true);
  });

  test('SpotHero does not claim live/bookable pricing labels', () => {
    const option = baseParkingOption({
      bookingProvider: 'SpotHero',
      sourceName: 'SpotHero',
      sourceLink: 'https://spothero.com/airport-parking/',
      priceDisplay: 'check-live',
      priceSource: 'marketplace-link',
      trustStatus: 'estimated',
    });

    expect(resolveProviderReserveLabel(option)).toBe('Compare on SpotHero');
    expect(resolveProviderKind({ sourceName: 'SpotHero', url: option.sourceLink })).toBe('spothero');
  });

  test('existing query params are preserved', () => {
    const result = appendParkingAffiliateParams(
      'https://www.parkwhiz.com/book?existing=1&foo=bar',
      'parkwhiz',
      { provider: 'ParkWhiz' },
      parkWhizConfig,
    );

    const parsed = new URL(result.url);
    expect(parsed.searchParams.get('existing')).toBe('1');
    expect(parsed.searchParams.get('foo')).toBe('bar');
    expect(parsed.searchParams.get('aid')).toBe('pw-aff-123');
  });

  test('no raw origin/home address is added to outbound URL', () => {
    const result = buildProviderOutboundUrl(
      baseParkingOption({
        sourceLink: 'https://www.parkwhiz.com/book?foo=1',
        bookingProvider: 'ParkWhiz',
      }),
      {
        provider: 'ParkWhiz',
        tripType: 'general-trip',
        parkingLotId: 'lot-1',
        clickId: 'click-1',
      },
      parkWhizConfig,
    );

    expect(result.url).not.toMatch(/123 Main St|Monroe|home/i);
    expect(result.url).not.toContain('@');
  });

  test('outbound analytics payload is sanitized and records affiliateAttached', () => {
    const sanitized = sanitizeAnalyticsProperties({
      provider: 'ParkWhiz',
      lotId: 'lot-1',
      tripType: 'general-trip',
      airportCode: 'SEA',
      priceSource: 'parkwhiz-live',
      affiliateAttached: true,
      targetHost: 'www.parkwhiz.com',
      outboundClickId: 'click-abc123',
      originText: '123 Main Street, Monroe, WA',
    });

    expect(sanitized.affiliateAttached).toBe(true);
    expect(sanitized.targetHost).toBe('www.parkwhiz.com');
    expect(sanitized.priceSource).toBe('parkwhiz-live');
    expect(sanitized.outboundClickId).toBe('click-abc123');
    expect(sanitized.originText).toBe('[redacted]');
  });

  test('click correlation sub-id avoids sensitive values', () => {
    const result = appendClickCorrelationToOutboundUrl(
      'https://www.parkwhiz.com/book',
      {
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        tripType: 'general-trip',
        parkingLotId: 'lot-1',
        clickId: 'opaque-click-id',
      },
      'subid',
    );

    expect(result.url).toContain('subid=');
    expect(result.url).not.toMatch(/main street|monroe|@/i);
    expect(result.url).toContain('opaque-click-id');
  });

  test('airport, city, and event parking use separate trip context without mixing providers', () => {
    const airportOption = enrichParkingOptionOutboundUrl(
      baseParkingOption({
        serviceAirportCode: 'SEA',
        bookingProvider: 'AirportParkingReservations',
        sourceName: 'AirportParkingReservations',
        sourceLink: 'https://www.airportparkingreservations.com/sea/lot',
      }),
      { airportCode: 'SEA', tripType: 'airport-trip' },
      aprConfig,
    );
    const cityOption = enrichParkingOptionOutboundUrl(
      baseParkingOption({
        bookingProvider: 'ParkWhiz',
        sourceName: 'ParkWhiz',
        sourceLink: 'https://www.parkwhiz.com/seattle/lot',
        priceSource: 'parkwhiz-live',
      }),
      { tripType: 'general-trip' },
      parkWhizConfig,
    );
    const eventOption = enrichParkingOptionOutboundUrl(
      baseParkingOption({
        bookingProvider: 'ParkWhiz',
        sourceName: 'ParkWhiz',
        sourceLink: 'https://www.parkwhiz.com/lumen-field/lot',
      }),
      { tripType: 'general-trip' },
      parkWhizConfig,
    );

    expect(airportOption.sourceLink).toContain('ref=apr-aff-9');
    expect(cityOption.sourceLink).toContain('aid=pw-aff-123');
    expect(cityOption.priceSource).toBe('parkwhiz-live');
    expect(eventOption.sourceLink).toContain('aid=pw-aff-123');
    expect(resolveProviderKind({ sourceName: 'AirportParkingReservations' })).toBe('apr');
  });

  test('getProviderAffiliateConfigFromEnv reads optional env vars', () => {
    process.env.PARKWHIZ_AFFILIATE_ID = 'pw-1';
    process.env.PARKWHIZ_AFFILIATE_PARAM = 'aid';
    process.env.PODPAIGO_UTM_SOURCE = 'podpaigo';

    const config = getProviderAffiliateConfigFromEnv();
    expect(config.parkwhiz.affiliateId).toBe('pw-1');
    expect(config.parkwhiz.affiliateParam).toBe('aid');
    expect(config.generic.utmSource).toBe('podpaigo');
  });
});
