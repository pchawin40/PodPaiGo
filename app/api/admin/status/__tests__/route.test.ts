import { NextRequest } from 'next/server';

describe('/api/admin/status', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env.ADMIN_EMAILS = 'admin@example.com';
    delete process.env.ALLOW_LOCAL_ADMIN;
    delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;
  });

  test('signed-out request is rejected', async () => {
    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => null),
    }));

    const { GET } = await import('../route');
    const response = await GET(new NextRequest('http://localhost/api/admin/status'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'authentication_required',
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

  test('non-admin signed-in user is rejected', async () => {
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

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'admin_required',
    });
  });
});
