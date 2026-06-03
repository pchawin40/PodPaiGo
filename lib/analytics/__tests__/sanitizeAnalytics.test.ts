import { sanitizeAnalyticsProperties } from '../sanitizeAnalytics';

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
});
