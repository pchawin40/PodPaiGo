import { NextRequest } from 'next/server';

function adminAuthClient(email = 'admin@example.com') {
  return {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { id: email === 'admin@example.com' ? 'admin-1' : 'user-1', email } },
      })),
    },
  };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    to: 'partner@spothero.com',
    subject: 'Partner / deep-link tracking for PodPaiGo parking referrals',
    body: 'Hello partner team,\n\nCan you share affiliate and deep-link docs?',
    fromName: 'Ham from PodPaiGo',
    fromEmail: 'hello@podpaigo.com',
    replyTo: 'p.chawin40@gmail.com',
    templateId: 'spothero-partner',
    testMode: false,
    ...overrides,
  };
}

function request(body: Record<string, unknown>, token = 'admin-token') {
  return new NextRequest('http://localhost/api/admin/outreach-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe('/api/admin/outreach-email', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env.ADMIN_EMAILS = 'admin@example.com';
    process.env.RESEND_API_KEY = 'resend-test-key';
    process.env.OUTREACH_FROM_EMAIL = 'hello@podpaigo.com';
    process.env.OUTREACH_FROM_NAME = 'Ham from PodPaiGo';
    process.env.OUTREACH_REPLY_TO = 'p.chawin40@gmail.com';
    process.env.OUTREACH_TEST_RECIPIENT = 'test@podpaigo.com';
    process.env.OUTREACH_EMAIL_RATE_LIMIT_MAX = '100';
    delete process.env.ALLOW_LOCAL_ADMIN;
    delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;
  });

  function mockAdmin(email = 'admin@example.com') {
    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => adminAuthClient(email)),
    }));
  }

  function mockAnalytics() {
    const insert = jest.fn(async () => ({ error: null }));
    const from = jest.fn(() => ({ insert }));
    jest.doMock('@/lib/analytics/insertAnalyticsEvent', () => ({
      createSupabaseServiceClient: jest.fn(() => ({ from })),
      insertAnalyticsEvent: jest.fn(async (_client, row) => {
        await insert(row);
      }),
    }));
    return { insert };
  }

  test('non-admin cannot access API', async () => {
    mockAdmin('user@example.com');

    const { POST } = await import('../route');
    const response = await POST(request(validPayload(), 'user-token'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'admin_required' });
  });

  test('GET returns safe defaults and templates without secrets', async () => {
    mockAdmin();

    const { GET } = await import('../route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/outreach-email', {
        headers: { Authorization: 'Bearer admin-token' },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.defaults).toMatchObject({
      fromName: 'Ham from PodPaiGo',
      fromEmail: 'hello@podpaigo.com',
      replyTo: 'p.chawin40@gmail.com',
      testRecipient: 'test@podpaigo.com',
    });
    expect(json.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'spothero-partner' }),
      ]),
    );
    expect(JSON.stringify(json)).not.toContain('resend-test-key');
    expect(JSON.stringify(json)).not.toContain('RESEND_API_KEY');
  });

  test('admin can send valid one-off email with mocked Resend', async () => {
    mockAdmin();
    const analytics = mockAnalytics();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: 'resend-msg-1' }),
    } as Response);

    const { POST } = await import('../route');
    const response = await POST(request(validPayload()));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      sent: true,
      to: 'partner@spothero.com',
      recipientDomain: 'spothero.com',
      messageId: 'resend-msg-1',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer resend-test-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const resendBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(resendBody).toMatchObject({
      from: 'Ham from PodPaiGo <hello@podpaigo.com>',
      to: ['partner@spothero.com'],
      subject: 'Partner / deep-link tracking for PodPaiGo parking referrals',
      text: expect.stringContaining('Hello partner team'),
      reply_to: 'p.chawin40@gmail.com',
    });
    expect(resendBody).not.toHaveProperty('html');
    expect(resendBody).not.toHaveProperty('attachments');

    expect(analytics.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: 'admin_outreach_email_sent',
        event_properties: expect.objectContaining({
          recipientDomain: 'spothero.com',
          subject: 'Partner / deep-link tracking for PodPaiGo parking referrals',
          templateName: 'spothero-partner',
          providerMessageId: 'resend-msg-1',
          adminUserId: 'admin-1',
          testMode: false,
        }),
      }),
    );
    expect(JSON.stringify(analytics.insert.mock.calls)).not.toContain('resend-test-key');
  });

  test('missing RESEND_API_KEY returns safe error and does not call Resend', async () => {
    mockAdmin();
    delete process.env.RESEND_API_KEY;
    const fetchSpy = jest.spyOn(global, 'fetch');

    const { POST } = await import('../route');
    const response = await POST(request(validPayload()));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toMatchObject({ error: 'missing_resend_api_key' });
    expect(JSON.stringify(json)).not.toContain('resend-test-key');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('invalid recipient is rejected', async () => {
    mockAdmin();
    const fetchSpy = jest.spyOn(global, 'fetch');

    const { POST } = await import('../route');
    const response = await POST(request(validPayload({ to: 'not-an-email' })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_recipient' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('empty subject and body are rejected', async () => {
    mockAdmin();
    const { POST } = await import('../route');

    const emptySubject = await POST(request(validPayload({ subject: '' })));
    expect(emptySubject.status).toBe(400);
    await expect(emptySubject.json()).resolves.toMatchObject({ error: 'empty_subject' });

    const emptyBody = await POST(request(validPayload({ body: '   ' })));
    expect(emptyBody.status).toBe(400);
    await expect(emptyBody.json()).resolves.toMatchObject({ error: 'empty_body' });
  });

  test('test-send mode sends to configured test recipient, not partner', async () => {
    mockAdmin();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: 'test-msg-1' }),
    } as Response);

    const { POST } = await import('../route');
    const response = await POST(request(validPayload({ testMode: true })));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      testMode: true,
      to: 'test@podpaigo.com',
    });

    const resendBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(resendBody.to).toEqual(['test@podpaigo.com']);
    expect(resendBody.to).not.toContain('partner@spothero.com');
  });

  test('rate limits repeated admin sends', async () => {
    mockAdmin();
    process.env.OUTREACH_EMAIL_RATE_LIMIT_MAX = '1';
    process.env.OUTREACH_EMAIL_RATE_LIMIT_WINDOW_MS = '60000';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ id: 'msg-1' }),
    } as Response);

    const { POST } = await import('../route');
    const first = await POST(request(validPayload()));
    const second = await POST(request(validPayload({ to: 'second@example.com' })));

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toMatchObject({ error: 'rate_limited' });
  });
});
