import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAuthClient } from '../../../../lib/monetization/recordOutboundClick';

export const runtime = 'nodejs';

const MAX_NOTES_LENGTH = 2000;
const ALLOWED_REPORT_TYPES = new Set([
  'free',
  'validated',
  'paid_only',
  'restricted',
  'wrong_info',
]);

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

type ValidationReportBody = {
  report_type?: unknown;
  parking_lot_id?: unknown;
  lot_name?: unknown;
  airport_code?: unknown;
  destination_text?: unknown;
  validation_status?: unknown;
  access_type?: unknown;
  free_minutes?: unknown;
  validation_business?: unknown;
  badge_required?: unknown;
  permit_required?: unknown;
  visitor_allowed?: unknown;
  notes?: unknown;
};

export async function POST(request: NextRequest) {
  let body: ValidationReportBody;

  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_request_body', 'Expected JSON body.');
  }

  const reportType = typeof body.report_type === 'string' ? body.report_type.trim() : '';
  if (!reportType || !ALLOWED_REPORT_TYPES.has(reportType)) {
    return jsonError(400, 'invalid_report_type', 'report_type is required and must be a supported value.');
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() : null;
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return jsonError(400, 'notes_too_long', `notes must be at most ${MAX_NOTES_LENGTH} characters.`);
  }

  let freeMinutes: number | null = null;
  if (body.free_minutes !== undefined && body.free_minutes !== null && body.free_minutes !== '') {
    const parsed =
      typeof body.free_minutes === 'number'
        ? body.free_minutes
        : Number.parseInt(String(body.free_minutes), 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return jsonError(400, 'invalid_free_minutes', 'free_minutes must be a number greater than or equal to 0.');
    }

    freeMinutes = parsed;
  }

  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
  const authClient = createSupabaseAuthClient(accessToken);
  let userId: string | null = null;

  if (authClient && accessToken) {
    const { data } = await authClient.auth.getUser();
    userId = data.user?.id ?? null;
  }

  const client = authClient ?? createSupabaseAuthClient(null);
  if (!client) {
    return NextResponse.json({
      ok: true,
      stored: false,
      message: 'Report accepted locally; database storage is not configured.',
    });
  }

  const payload = {
    parking_lot_id:
      typeof body.parking_lot_id === 'string' && body.parking_lot_id.trim()
        ? body.parking_lot_id.trim().slice(0, 120)
        : null,
    lot_name:
      typeof body.lot_name === 'string' && body.lot_name.trim()
        ? body.lot_name.trim().slice(0, 200)
        : null,
    airport_code:
      typeof body.airport_code === 'string' && body.airport_code.trim()
        ? body.airport_code.trim().slice(0, 8).toUpperCase()
        : null,
    destination_text:
      typeof body.destination_text === 'string' && body.destination_text.trim()
        ? body.destination_text.trim().slice(0, 240)
        : null,
    user_id: userId,
    report_type: reportType,
    validation_status:
      typeof body.validation_status === 'string' && body.validation_status.trim()
        ? body.validation_status.trim().slice(0, 40)
        : null,
    access_type:
      typeof body.access_type === 'string' && body.access_type.trim()
        ? body.access_type.trim().slice(0, 40)
        : null,
    free_minutes: freeMinutes,
    validation_business:
      typeof body.validation_business === 'string' && body.validation_business.trim()
        ? body.validation_business.trim().slice(0, 200)
        : null,
    badge_required: body.badge_required === true,
    permit_required: body.permit_required === true,
    visitor_allowed: body.visitor_allowed !== false,
    notes,
    status: 'pending',
  };

  const { data, error } = await client
    .from('parking_validation_reports')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    return jsonError(500, 'insert_failed', error.message);
  }

  return NextResponse.json({
    ok: true,
    stored: true,
    id: data?.id ?? null,
  });
}
