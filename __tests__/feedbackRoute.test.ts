/** @jest-environment node */

import { NextRequest } from 'next/server';

const insertMock = jest.fn();
const sendFeedbackAdminEmailNotificationMock = jest.fn();

jest.mock('@/lib/analytics/insertAnalyticsEvent', () => ({
  createSupabaseAnalyticsClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: jest.fn(() => ({
      insert: insertMock,
    })),
  })),
  createSupabaseServiceClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            limit: jest.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
    })),
  })),
  insertAnalyticsEvent: jest.fn(async (client: { from: () => { insert: typeof insertMock } }, row: unknown) => {
    const { error } = await client.from('analytics_events').insert(row);
    if (error) throw error;
  }),
}));

jest.mock('@/lib/feedback/feedbackEmail', () => ({
  sendFeedbackAdminEmailNotification: (...args: unknown[]) =>
    sendFeedbackAdminEmailNotificationMock(...args),
}));

describe('/api/feedback', () => {
  beforeEach(() => {
    jest.resetModules();
    sendFeedbackAdminEmailNotificationMock.mockReset();
    insertMock.mockReset();
    delete process.env.PUBLIC_API_RATE_LIMIT_MAX;
    delete process.env.PUBLIC_API_RATE_LIMIT_WINDOW_MS;
    delete process.env.FEEDBACK_EMAIL_THROTTLE_MS;
    insertMock.mockResolvedValue({ error: null });
    jest.spyOn(console, 'info').mockImplementation(() => {});
    sendFeedbackAdminEmailNotificationMock.mockResolvedValue({
      sent: true,
      recipientCount: 1,
      provider: 'resend',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.PUBLIC_API_RATE_LIMIT_MAX;
    delete process.env.PUBLIC_API_RATE_LIMIT_WINDOW_MS;
    delete process.env.FEEDBACK_EMAIL_THROTTLE_MS;
  });

  test('stores explicit feedback fields and attempts admin email notification', async () => {
    const { POST } = await import('../app/api/feedback/route');
    const response = await POST(
      new NextRequest('http://localhost/api/feedback', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-1',
          'user-agent': 'Jest Browser',
        },
        body: JSON.stringify({
          issueType: 'wrong_price',
          message: 'Provider checkout showed a different price.',
          email: 'beta@example.com',
          context: {
            pageUrl: 'https://podpaigo.test/results?type=general-trip',
            pagePath: '/results',
            tripType: 'general-trip',
            airportCode: 'sea',
            provider: 'ParkWhiz',
            lotId: 'lot-1',
            lotName: 'Public Garage',
            origin: '123 Main St should not be accepted',
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, stored: true });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: 'feedback_submitted',
        event_properties: expect.objectContaining({
          reportType: 'wrong_price',
          message: 'Provider checkout showed a different price.',
          email: 'beta@example.com',
          airportCode: 'SEA',
          provider: 'ParkWhiz',
          lotId: 'lot-1',
          lotName: 'Public Garage',
        }),
      }),
    );
    expect(JSON.stringify(insertMock.mock.calls[0][0])).not.toContain('123 Main St');
    expect(sendFeedbackAdminEmailNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        issueType: 'wrong_price',
        message: 'Provider checkout showed a different price.',
        email: 'beta@example.com',
        context: expect.objectContaining({
          pageUrl: 'https://podpaigo.test/results',
          provider: 'ParkWhiz',
          lotId: 'lot-1',
          lotName: 'Public Garage',
        }),
      }),
    );
  });

  test('rejects invalid feedback payloads without sending email', async () => {
    const { POST } = await import('../app/api/feedback/route');
    const response = await POST(
      new NextRequest('http://localhost/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ issueType: 'wrong_price', message: '' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(sendFeedbackAdminEmailNotificationMock).not.toHaveBeenCalled();
  });

  test('succeeds when email notification is skipped for missing env', async () => {
    sendFeedbackAdminEmailNotificationMock.mockResolvedValue({
      sent: false,
      skipped: true,
      reason: 'missing_resend_config',
      provider: 'resend',
    });

    const { POST } = await import('../app/api/feedback/route');
    const response = await POST(
      new NextRequest('http://localhost/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          issueType: 'app_bug',
          message: 'The page froze after clicking reserve.',
          context: {
            pageUrl: 'https://podpaigo.test/results?origin=123%20Main%20St',
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, stored: true });
    expect(sendFeedbackAdminEmailNotificationMock).toHaveBeenCalledTimes(1);
  });

  test('succeeds when email notification fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    sendFeedbackAdminEmailNotificationMock.mockRejectedValue(new Error('resend down'));

    const { POST } = await import('../app/api/feedback/route');
    const response = await POST(
      new NextRequest('http://localhost/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          issueType: 'review_issue',
          message: 'The review count looked stale.',
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, stored: true });
    expect(sendFeedbackAdminEmailNotificationMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[feedback] failed to send admin email notification',
      expect.objectContaining({ message: 'resend down' }),
    );
    warnSpy.mockRestore();
  });

  test('stores repeated feedback but throttles repeated admin email notifications per key', async () => {
    process.env.FEEDBACK_EMAIL_THROTTLE_MS = '60000';

    const { POST } = await import('../app/api/feedback/route');
    const buildRequest = (message: string) =>
      new NextRequest('http://localhost/api/feedback', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '198.51.100.44',
          'user-agent': 'Jest Browser',
        },
        body: JSON.stringify({
          issueType: 'app_bug',
          message,
          context: {
            pageUrl: 'https://podpaigo.test/results?type=general-trip',
            pagePath: '/results',
            tripType: 'general-trip',
          },
        }),
      });

    const first = await POST(buildRequest('The first feedback message.'));
    const second = await POST(buildRequest('The second feedback message.'));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(sendFeedbackAdminEmailNotificationMock).toHaveBeenCalledTimes(1);
  });
});

describe('/api/admin/feedback', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env.ADMIN_EMAILS = 'admin@example.com';
    delete process.env.ALLOW_LOCAL_ADMIN;
    delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;
  });

  test('non-admin cannot access feedback inbox data', async () => {
    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: { id: 'user-1', email: 'user@example.com' } },
            error: null,
          })),
        },
      })),
    }));

    const { GET } = await import('../app/api/admin/feedback/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/feedback', {
        headers: { Authorization: 'Bearer user-token' },
      }),
    );

    expect(response.status).toBe(403);
  });

  test('admin can access feedback inbox data', async () => {
    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: { id: 'admin-1', email: 'admin@example.com' } },
            error: null,
          })),
        },
      })),
    }));

    const { GET } = await import('../app/api/admin/feedback/route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/feedback', {
        headers: { Authorization: 'Bearer admin-token' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ feedback: [], stored: true });
  });
});
