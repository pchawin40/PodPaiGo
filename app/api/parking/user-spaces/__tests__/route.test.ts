import { NextRequest } from 'next/server';

function jsonRequest(url: string, body: unknown, token = 'token-1'): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      : {
          'Content-Type': 'application/json',
        },
    body: JSON.stringify(body),
  });
}

function createAuthClientMock(options?: {
  user?: { id: string; email?: string } | null;
  existing?: Record<string, unknown> | null;
}) {
  const user = options?.user ?? { id: 'user-1', email: 'user@example.com' };
  const existing = options?.existing ?? null;
  const insertPayloads: Record<string, unknown>[] = [];
  const updatePayloads: Record<string, unknown>[] = [];

  const client = {
    auth: {
      getUser: jest.fn(async () => ({ data: { user } })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: existing, error: null })),
          })),
          order: jest.fn(async () => ({ data: [], error: null })),
        })),
      })),
      insert: jest.fn((payload: Record<string, unknown>) => {
        insertPayloads.push(payload);
        return {
          select: jest.fn(() => ({
            single: jest.fn(async () => ({
              data: { id: 'space-1', ...payload },
              error: null,
            })),
          })),
        };
      }),
      update: jest.fn((payload: Record<string, unknown>) => {
        updatePayloads.push(payload);
        return {
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(async () => ({
                  data: { ...existing, ...payload },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(async () => ({ error: null })),
        })),
      })),
    })),
  };

  return { client, insertPayloads, updatePayloads };
}

describe('/api/parking/user-spaces', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('unauthenticated user cannot create parking', async () => {
    const { POST } = await import('../route');

    const response = await POST(
      jsonRequest(
        'http://localhost/api/parking/user-spaces',
        {
          name: 'Free Lot',
          address: '100 Main St, Monroe, WA',
          parking_type: 'free',
        },
        '',
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'auth_required' });
  });

  test('signed-in user can create pending parking with budgeted geocoding', async () => {
    const { client, insertPayloads } = createAuthClientMock();
    const geocodeUserParkingAddress = jest.fn(async () => ({ lat: 47.85, lng: -121.97 }));

    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => client),
    }));
    jest.doMock('@/lib/parking/userParkingSpacesServer', () => ({
      geocodeUserParkingAddress,
    }));

    const { POST } = await import('../route');

    const response = await POST(
      jsonRequest('http://localhost/api/parking/user-spaces', {
        name: 'Free Lot',
        address: '100 Main St, Monroe, WA',
        parking_type: 'street_free',
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      parking: {
        id: 'space-1',
        user_id: 'user-1',
        status: 'pending',
        is_free: true,
        price: 0,
      },
    });
    expect(geocodeUserParkingAddress).toHaveBeenCalledWith('100 Main St, Monroe, WA');
    expect(insertPayloads[0]).toMatchObject({
      user_id: 'user-1',
      status: 'pending',
      lat: 47.85,
      lng: -121.97,
    });
  });

  test('user can edit and delete own pending submission', async () => {
    const existing = {
      id: 'space-1',
      user_id: 'user-1',
      name: 'Old Lot',
      address: '100 Main St, Monroe, WA',
      lat: 47.85,
      lng: -121.97,
      google_place_id: null,
      parking_type: 'free',
      status: 'pending',
    };
    const { client, updatePayloads } = createAuthClientMock({ existing });

    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => client),
    }));
    jest.doMock('@/lib/parking/userParkingSpacesServer', () => ({
      geocodeUserParkingAddress: jest.fn(),
    }));

    const route = await import('../[id]/route');

    const patchResponse = await route.PATCH(
      new NextRequest('http://localhost/api/parking/user-spaces/space-1', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Updated Lot',
          address: '100 Main St, Monroe, WA',
          parking_type: 'street_free',
        }),
      }),
      { params: Promise.resolve({ id: 'space-1' }) },
    );

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      parking: { name: 'Updated Lot', status: 'pending' },
    });
    expect(updatePayloads[0]).toMatchObject({
      name: 'Updated Lot',
      status: 'pending',
      rejection_reason: null,
      verified_at: null,
    });

    const deleteResponse = await route.DELETE(
      new NextRequest('http://localhost/api/parking/user-spaces/space-1', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer token-1' },
      }),
      { params: Promise.resolve({ id: 'space-1' }) },
    );

    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toMatchObject({ ok: true });
  });
});
