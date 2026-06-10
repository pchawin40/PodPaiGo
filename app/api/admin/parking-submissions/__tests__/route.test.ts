import { NextRequest } from 'next/server';

describe('/api/admin/parking-submissions', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env.ADMIN_EMAILS = 'admin@example.com';
    delete process.env.ALLOW_LOCAL_ADMIN;
    delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;
  });

  test('admin can list and verify or reject submissions', async () => {
    const authClient = {
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: { id: 'admin-1', email: 'admin@example.com' } },
        })),
      },
    };
    const listUserParkingSubmissionsForAdmin = jest.fn(async () => [
      {
        id: 'space-1',
        name: 'Pending Lot',
        status: 'pending',
      },
    ]);
    const updateUserParkingSubmissionStatus = jest.fn(async (input: {
      id: string;
      status: string;
      rejectionReason?: string | null;
    }) => ({
      id: input.id,
      status: input.status,
      rejection_reason: input.rejectionReason,
    }));

    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => authClient),
    }));
    jest.doMock('@/lib/parking/userParkingSpacesServer', () => ({
      listUserParkingSubmissionsForAdmin,
      updateUserParkingSubmissionStatus,
    }));

    const { GET, POST } = await import('../route');

    const listResponse = await GET(
      new NextRequest('http://localhost/api/admin/parking-submissions?status=pending', {
        headers: { Authorization: 'Bearer token-1' },
      }),
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      parking: [{ id: 'space-1', status: 'pending' }],
    });
    expect(listUserParkingSubmissionsForAdmin).toHaveBeenCalledWith({ status: 'pending' });

    const verifyResponse = await POST(
      new NextRequest('http://localhost/api/admin/parking-submissions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: 'space-1', status: 'verified' }),
      }),
    );

    expect(verifyResponse.status).toBe(200);
    await expect(verifyResponse.json()).resolves.toMatchObject({
      parking: { id: 'space-1', status: 'verified' },
    });
    expect(updateUserParkingSubmissionStatus).toHaveBeenCalledWith({
      id: 'space-1',
      status: 'verified',
      adminUserId: 'admin-1',
      rejectionReason: null,
    });

    const rejectResponse = await POST(
      new NextRequest('http://localhost/api/admin/parking-submissions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'space-1',
          status: 'rejected',
          rejection_reason: 'No public parking signs.',
        }),
      }),
    );

    expect(rejectResponse.status).toBe(200);
    expect(updateUserParkingSubmissionStatus).toHaveBeenLastCalledWith({
      id: 'space-1',
      status: 'rejected',
      adminUserId: 'admin-1',
      rejectionReason: 'No public parking signs.',
    });
  });

  test('non-admin user cannot moderate submissions', async () => {
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
      new NextRequest('http://localhost/api/admin/parking-submissions', {
        headers: { Authorization: 'Bearer token-1' },
      }),
    );

    expect(response.status).toBe(403);
  });

  test('signed-out user cannot list submissions', async () => {
    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => null),
    }));

    const { GET } = await import('../route');

    const response = await GET(
      new NextRequest('http://localhost/api/admin/parking-submissions'),
    );

    expect(response.status).toBe(401);
  });
});
