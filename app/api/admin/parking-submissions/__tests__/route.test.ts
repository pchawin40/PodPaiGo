import { NextRequest } from 'next/server';

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

function adminAuthClient(email = 'admin@example.com') {
  return {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { id: email === 'admin@example.com' ? 'admin-1' : 'user-1', email } },
      })),
    },
  };
}

function queryResult(result: QueryResult) {
  return {
    ...result,
    select: jest.fn(function select() { return this; }),
    order: jest.fn(function order() { return this; }),
    limit: jest.fn(function limit() { return this; }),
    eq: jest.fn(function eq() { return this; }),
  };
}

function updateResult(result: QueryResult) {
  return {
    update: jest.fn(() => ({
      eq: jest.fn(function eq() { return this; }),
      select: jest.fn(function select() { return this; }),
      maybeSingle: jest.fn(async () => result),
    })),
  };
}

describe('/api/admin/parking-submissions', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env.ADMIN_EMAILS = 'admin@example.com';
    delete process.env.ALLOW_LOCAL_ADMIN;
    delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;
  });

  test('admin can list parking validation reports and legacy user submissions', async () => {
    const serviceFrom = jest.fn((table: string) => {
      if (table === 'parking_validation_reports') {
        return queryResult({
          data: [
            {
              id: 'report-1',
              user_id: null,
              parking_lot_id: 'lot-1',
              lot_name: 'Public Garage',
              airport_code: 'PAE',
              destination_text: 'Paine Field',
              report_type: 'validated',
              validation_status: null,
              access_type: null,
              free_minutes: 30,
              validation_business: null,
              badge_required: null,
              permit_required: null,
              visitor_allowed: null,
              notes: null,
              status: 'pending',
              created_at: '2026-06-10T01:00:00Z',
              updated_at: '2026-06-10T01:00:00Z',
            },
          ],
          error: null,
        });
      }

      return queryResult({
        data: [
          {
            id: 'space-1',
            name: 'Pending Lot',
            address: '123 Main St',
            status: 'pending',
            created_at: '2026-06-10T00:00:00Z',
            updated_at: '2026-06-10T00:00:00Z',
          },
        ],
        error: null,
      });
    });

    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => adminAuthClient()),
    }));
    jest.doMock('@/lib/analytics/insertAnalyticsEvent', () => ({
      createSupabaseServiceClient: jest.fn(() => ({ from: serviceFrom })),
    }));

    const { GET } = await import('../route');

    const response = await GET(
      new NextRequest('http://localhost/api/admin/parking-submissions?status=pending', {
        headers: { Authorization: 'Bearer token-1' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      parking: [
        {
          id: 'report-1',
          name: 'Public Garage',
          address: 'Paine Field',
          status: 'pending',
          source: 'parking-validation-report',
        },
        { id: 'space-1', status: 'pending', source: 'user-submitted' },
      ],
    });
  });

  test('empty result returns 200 with an empty array', async () => {
    const serviceFrom = jest.fn(() => queryResult({ data: [], error: null }));

    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => adminAuthClient()),
    }));
    jest.doMock('@/lib/analytics/insertAnalyticsEvent', () => ({
      createSupabaseServiceClient: jest.fn(() => ({ from: serviceFrom })),
    }));

    const { GET } = await import('../route');

    const response = await GET(
      new NextRequest('http://localhost/api/admin/parking-submissions?status=pending', {
        headers: { Authorization: 'Bearer token-1' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ parking: [] });
  });

  test('admin API maps null optional fields without crashing', async () => {
    const serviceFrom = jest.fn((table: string) => {
      if (table === 'parking_validation_reports') {
        return queryResult({
          data: [
            {
              id: 'report-null',
              lot_name: null,
              parking_lot_id: null,
              airport_code: null,
              destination_text: null,
              report_type: null,
              free_minutes: null,
              notes: null,
              status: null,
              created_at: null,
              updated_at: null,
            },
          ],
          error: null,
        });
      }
      return queryResult({ data: [], error: null });
    });

    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => adminAuthClient()),
    }));
    jest.doMock('@/lib/analytics/insertAnalyticsEvent', () => ({
      createSupabaseServiceClient: jest.fn(() => ({ from: serviceFrom })),
    }));

    const { GET } = await import('../route');

    const response = await GET(
      new NextRequest('http://localhost/api/admin/parking-submissions', {
        headers: { Authorization: 'Bearer token-1' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      parking: [
        {
          id: 'report-null',
          name: 'Parking validation report',
          address: 'Location not provided',
          status: 'pending',
        },
      ],
    });
  });

  test('admin can moderate validation reports and legacy submissions', async () => {
    const serviceFrom = jest.fn((table: string) => {
      if (table === 'parking_validation_reports') {
        return updateResult({
          data: {
            id: 'report-1',
            lot_name: 'Public Garage',
            destination_text: 'Paine Field',
            report_type: 'validated',
            status: 'verified',
            created_at: '2026-06-10T00:00:00Z',
            updated_at: '2026-06-10T00:00:00Z',
          },
          error: null,
        });
      }

      return updateResult({ data: null, error: null });
    });

    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => adminAuthClient()),
    }));
    jest.doMock('@/lib/analytics/insertAnalyticsEvent', () => ({
      createSupabaseServiceClient: jest.fn(() => ({ from: serviceFrom })),
    }));

    const { POST } = await import('../route');

    const verifyResponse = await POST(
      new NextRequest('http://localhost/api/admin/parking-submissions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: 'report-1', status: 'verified' }),
      }),
    );

    expect(verifyResponse.status).toBe(200);
    await expect(verifyResponse.json()).resolves.toMatchObject({
      parking: { id: 'report-1', status: 'verified', source: 'parking-validation-report' },
    });

    const fallbackFrom = jest.fn((table: string) => {
      if (table === 'parking_validation_reports') {
        return updateResult({ data: null, error: null });
      }

      return updateResult({
        data: {
          id: 'space-1',
          name: 'Pending Lot',
          address: '123 Main St',
          status: 'rejected',
          rejection_reason: 'No public parking signs.',
          created_at: '2026-06-10T00:00:00Z',
          updated_at: '2026-06-10T00:00:00Z',
        },
        error: null,
      });
    });

    jest.resetModules();
    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => adminAuthClient()),
    }));
    jest.doMock('@/lib/analytics/insertAnalyticsEvent', () => ({
      createSupabaseServiceClient: jest.fn(() => ({ from: fallbackFrom })),
    }));

    const { POST: postFallback } = await import('../route');

    const rejectResponse = await postFallback(
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
    await expect(rejectResponse.json()).resolves.toMatchObject({
      parking: { id: 'space-1', status: 'rejected', rejection_reason: 'No public parking signs.' },
    });
  });

  test('invalid moderation status is rejected before database update', async () => {
    const serviceFrom = jest.fn();

    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => adminAuthClient()),
    }));
    jest.doMock('@/lib/analytics/insertAnalyticsEvent', () => ({
      createSupabaseServiceClient: jest.fn(() => ({ from: serviceFrom })),
    }));

    const { POST } = await import('../route');

    const response = await POST(
      new NextRequest('http://localhost/api/admin/parking-submissions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: 'report-1', status: 'published' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  test('list failure returns generic 500 without exposing database details', async () => {
    const serviceFrom = jest.fn(() =>
      queryResult({ data: null, error: { message: 'column reviewed_by does not exist' } }),
    );
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => adminAuthClient()),
    }));
    jest.doMock('@/lib/analytics/insertAnalyticsEvent', () => ({
      createSupabaseServiceClient: jest.fn(() => ({ from: serviceFrom })),
    }));

    const { GET } = await import('../route');

    const response = await GET(
      new NextRequest('http://localhost/api/admin/parking-submissions', {
        headers: { Authorization: 'Bearer token-1' },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({
      error: 'list_failed',
      message: 'Could not load parking submissions.',
    });
  });

  test('legacy mocked admin workflow remains compatible with service client flow', async () => {
    const serviceFrom = jest.fn((table: string) =>
      queryResult({
        data:
          table === 'parking_validation_reports'
            ? []
            : [
                {
                  id: 'space-1',
                  name: 'Pending Lot',
                  address: '123 Main St',
                  status: 'pending',
                },
              ],
        error: null,
      }),
    );

    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => adminAuthClient()),
    }));
    jest.doMock('@/lib/analytics/insertAnalyticsEvent', () => ({
      createSupabaseServiceClient: jest.fn(() => ({ from: serviceFrom })),
    }));

    const { GET } = await import('../route');

    const listResponse = await GET(
      new NextRequest('http://localhost/api/admin/parking-submissions?status=pending', {
        headers: { Authorization: 'Bearer token-1' },
      }),
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      parking: [{ id: 'space-1', status: 'pending' }],
    });
  });

  test('non-admin user cannot moderate submissions', async () => {
    jest.doMock('@/lib/monetization/recordOutboundClick', () => ({
      createSupabaseAuthClient: jest.fn(() => adminAuthClient('user@example.com')),
    }));
    jest.doMock('@/lib/analytics/insertAnalyticsEvent', () => ({
      createSupabaseServiceClient: jest.fn(() => ({ from: jest.fn() })),
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
    jest.doMock('@/lib/analytics/insertAnalyticsEvent', () => ({
      createSupabaseServiceClient: jest.fn(() => ({ from: jest.fn() })),
    }));

    const { GET } = await import('../route');

    const response = await GET(
      new NextRequest('http://localhost/api/admin/parking-submissions'),
    );

    expect(response.status).toBe(401);
  });
});
