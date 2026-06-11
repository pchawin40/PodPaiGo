/** @jest-environment node */

import { NextRequest } from 'next/server';

const sendFeedbackAdminEmailNotificationMock = jest.fn();

jest.mock('@/lib/analytics/insertAnalyticsEvent', () => ({
  createSupabaseAnalyticsClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: null }, error: null })),
    },
    from: jest.fn(() => ({
      insert: jest.fn(async () => ({ error: null })),
    })),
  })),
  createSupabaseServiceClient: jest.fn(() => null),
  insertAnalyticsEvent: jest.fn(async () => undefined),
}));

jest.mock('@/lib/feedback/feedbackEmail', () => ({
  sendFeedbackAdminEmailNotification: (...args: unknown[]) =>
    sendFeedbackAdminEmailNotificationMock(...args),
}));

jest.mock('../lib/monetization/recordOutboundClick', () => ({
  createSupabaseAuthClient: jest.fn(() => null),
}));

jest.mock('../lib/weather/nws', () => ({
  getWeatherForAirport: jest.fn(async () => ({ available: true, summary: 'Clear' })),
  getWeatherForPoint: jest.fn(async () => ({ available: true, summary: 'Clear' })),
}));

function expectRateLimited(response: Response) {
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBeTruthy();
}

describe('public endpoint rate limits', () => {
  beforeEach(() => {
    jest.resetModules();
    sendFeedbackAdminEmailNotificationMock.mockReset();
    sendFeedbackAdminEmailNotificationMock.mockResolvedValue({
      sent: true,
      recipientCount: 1,
      provider: 'resend',
    });
    process.env.PUBLIC_API_RATE_LIMIT_MAX = '1';
    process.env.PUBLIC_API_RATE_LIMIT_WINDOW_MS = '60000';
  });

  afterEach(() => {
    delete process.env.PUBLIC_API_RATE_LIMIT_MAX;
    delete process.env.PUBLIC_API_RATE_LIMIT_WINDOW_MS;
  });

  test('/api/feedback returns 429 when exceeded', async () => {
    const { POST } = await import('../app/api/feedback/route');
    const buildRequest = () =>
      new NextRequest('http://localhost/api/feedback', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.11' },
        body: JSON.stringify({
          issueType: 'app_bug',
          message: 'The feedback button works.',
        }),
      });

    expect((await POST(buildRequest())).status).toBe(200);
    expectRateLimited(await POST(buildRequest()));
  });

  test('/api/parking/validation-report returns 429 when exceeded', async () => {
    const { POST } = await import('../app/api/parking/validation-report/route');
    const buildRequest = () =>
      new NextRequest('http://localhost/api/parking/validation-report', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.12' },
        body: JSON.stringify({
          report_type: 'validated',
          destination_text: 'Public Garage',
          notes: 'Validated with receipt.',
        }),
      });

    expect((await POST(buildRequest())).status).toBe(200);
    expectRateLimited(await POST(buildRequest()));
  });

  test('/api/parking-reviews returns 429 when exceeded', async () => {
    const { GET } = await import('../app/api/parking-reviews/route');
    const buildRequest = () =>
      new NextRequest('http://localhost/api/parking-reviews', {
        headers: { 'x-forwarded-for': '203.0.113.13' },
      });

    expect((await GET(buildRequest())).status).toBe(200);
    expectRateLimited(await GET(buildRequest()));
  });

  test('/api/weather returns 429 when exceeded', async () => {
    const { GET } = await import('../app/api/weather/route');
    const buildRequest = () =>
      new NextRequest('http://localhost/api/weather?airport=SEA', {
        headers: { 'x-forwarded-for': '203.0.113.14' },
      });

    expect((await GET(buildRequest())).status).toBe(200);
    expectRateLimited(await GET(buildRequest()));
  });
});
