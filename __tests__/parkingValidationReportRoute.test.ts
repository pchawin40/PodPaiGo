/** @jest-environment node */

import { NextRequest } from 'next/server';

const insertMock = jest.fn();
const selectMock = jest.fn();
const singleMock = jest.fn();
const createSupabaseServiceClientMock = jest.fn();
const createSupabaseAuthClientMock = jest.fn();

jest.mock('@/lib/analytics/insertAnalyticsEvent', () => ({
  createSupabaseServiceClient: () => createSupabaseServiceClientMock(),
}));

jest.mock('../lib/monetization/recordOutboundClick', () => ({
  createSupabaseAuthClient: (...args: unknown[]) => createSupabaseAuthClientMock(...args),
}));

function validRequest(overrides: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/parking/validation-report', {
    method: 'POST',
    body: JSON.stringify({
      report_type: 'validated',
      parking_lot_id: 'lot-1',
      lot_name: 'Public Garage',
      airport_code: 'pae',
      destination_text: 'Paine Field Passenger Terminal',
      free_minutes: 30,
      validation_business: 'Coffee Shop',
      access_type: 'validated_customer',
      badge_required: false,
      permit_required: false,
      visitor_allowed: true,
      notes: 'Validated with receipt.',
      ...overrides,
    }),
  });
}

describe('/api/parking/validation-report service-role insert', () => {
  beforeEach(() => {
    jest.resetModules();
    insertMock.mockReset();
    selectMock.mockReset();
    singleMock.mockReset();
    createSupabaseServiceClientMock.mockReset();
    createSupabaseAuthClientMock.mockReset();

    singleMock.mockResolvedValue({ data: { id: 'report-1' }, error: null });
    selectMock.mockReturnValue({ single: singleMock });
    insertMock.mockReturnValue({ select: selectMock });
    createSupabaseServiceClientMock.mockReturnValue({
      from: jest.fn(() => ({
        insert: insertMock,
      })),
    });
    createSupabaseAuthClientMock.mockReturnValue(null);
  });

  test('stores a valid sanitized report through service role', async () => {
    const { POST } = await import('../app/api/parking/validation-report/route');

    const response = await POST(validRequest({ destination_text: 'x'.repeat(500) }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, stored: true, id: 'report-1' });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parking_lot_id: 'lot-1',
        lot_name: 'Public Garage',
        airport_code: 'PAE',
        destination_text: 'x'.repeat(240),
        report_type: 'validated',
        validation_status: null,
        access_type: 'validated_customer',
        free_minutes: 30,
        validation_business: 'Coffee Shop',
        visitor_allowed: true,
        status: 'pending',
      }),
    );
  });

  test('rejects invalid report before service-role insert', async () => {
    const { POST } = await import('../app/api/parking/validation-report/route');

    const response = await POST(validRequest({ report_type: 'unsupported' }));

    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
