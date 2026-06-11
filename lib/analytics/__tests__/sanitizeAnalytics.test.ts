import { sanitizeAnalyticsProperties, stripAnalyticsUrlQueryAndHash } from '../sanitizeAnalytics';

describe('sanitizeAnalytics', () => {
  it('removes email, phone, and token-like fields', () => {
    const result = sanitizeAnalyticsProperties({
      airportCode: 'SEA',
      email: 'user@example.com',
      contactEmail: 'hidden@example.com',
      phone: '206-555-0100',
      apiKey: 'sk_test_secret_value',
      provider: 'ParkWhiz',
    });

    expect(result).toEqual({
      airportCode: 'SEA',
      provider: 'ParkWhiz',
    });
  });

  it('redacts raw originText unless marked safe', () => {
    const redacted = sanitizeAnalyticsProperties({
      originText: '123 Main St, Seattle',
      airportCode: 'SEA',
    });

    expect(redacted).toEqual({
      airportCode: 'SEA',
      originText: '[redacted]',
    });

    const allowed = sanitizeAnalyticsProperties({
      originText: '123 Main St, Seattle',
      originTextSafe: true,
      airportCode: 'SEA',
    });

    expect(allowed.originText).toBe('123 Main St, Seattle');
    expect(allowed).not.toHaveProperty('originTextSafe');
  });

  it('strips query and hash fragments from analytics URLs', () => {
    expect(stripAnalyticsUrlQueryAndHash('https://podpaigo.test/results?origin=123+Main#x')).toBe(
      'https://podpaigo.test/results',
    );

    expect(
      sanitizeAnalyticsProperties({
        pageUrl: 'https://podpaigo.test/results?origin=123+Main',
        pagePath: '/results?origin=123+Main#details',
      }),
    ).toEqual({
      pageUrl: 'https://podpaigo.test/results',
      pagePath: '/results',
    });
  });
});
