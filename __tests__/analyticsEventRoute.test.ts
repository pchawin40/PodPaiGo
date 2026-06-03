/** @jest-environment node */

const insertMock = jest.fn();

jest.mock('../lib/analytics/insertAnalyticsEvent', () => ({
  createSupabaseAnalyticsClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: null }, error: null })),
    },
    from: jest.fn(() => ({
      insert: insertMock,
    })),
  })),
  insertAnalyticsEvent: jest.fn(async (client: { from: () => { insert: typeof insertMock } }) => {
    const { error } = await client.from('analytics_events').insert({});
    if (error) throw error;
  }),
}));

describe('/api/analytics/event route', () => {
  beforeEach(() => {
    insertMock.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('accepts a valid analytics event', async () => {
    insertMock.mockResolvedValue({ error: null });

    const { POST } = await import('../app/api/analytics/event/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest('http://localhost/api/analytics/event', {
      method: 'POST',
      body: JSON.stringify({
        eventName: 'home_viewed',
        eventProperties: { airportCode: 'SEA' },
        anonymousId: 'anon-test',
        sessionId: 'sess-test',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, stored: true });
  });

  it('fails safely when DB insert fails', async () => {
    insertMock.mockResolvedValue({ error: { message: 'insert failed' } });

    const { POST } = await import('../app/api/analytics/event/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest('http://localhost/api/analytics/event', {
      method: 'POST',
      body: JSON.stringify({
        eventName: 'results_viewed',
        eventProperties: { airportCode: 'SEA' },
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, stored: false, reason: 'store_failed' });
  });
});
