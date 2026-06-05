import { NextRequest } from 'next/server';

describe('/api/admin/status', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env.ADMIN_EMAILS = 'admin@example.com';
  });

  test('signed-out request returns non-admin status', async () => {
    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => null),
    }));

    const { GET } = await import('../route');
    const response = await GET(new NextRequest('http://localhost/api/admin/status'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      signedIn: false,
      isAdmin: false,
    });
  });

  test('admin email returns admin status without exposing allowlist', async () => {
    const authClient = {
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: { id: 'admin-1', email: 'admin@example.com' } },
        })),
      },
    };
    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => authClient),
    }));

    const { GET } = await import('../route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/status', {
        headers: { Authorization: 'Bearer token-1' },
      }),
    );
    const json = await response.json();

    expect(json).toEqual({
      signedIn: true,
      isAdmin: true,
      email: 'admin@example.com',
    });
    expect(JSON.stringify(json)).not.toContain('ADMIN_EMAILS');
  });

  test('non-admin signed-in user returns non-admin status', async () => {
    const authClient = {
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: { id: 'user-1', email: 'user@example.com' } },
        })),
      },
    };
    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => authClient),
    }));

    const { GET } = await import('../route');
    const response = await GET(
      new NextRequest('http://localhost/api/admin/status', {
        headers: { Authorization: 'Bearer token-1' },
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      signedIn: true,
      isAdmin: false,
      email: 'user@example.com',
    });
  });
});
