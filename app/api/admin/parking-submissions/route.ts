import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { createSupabaseServiceClient } from '@/lib/analytics/insertAnalyticsEvent';
import {
  isUserParkingStatus,
  type UserParkingSpaceRecord,
  type UserParkingStatus,
} from '@/lib/parking/userParkingSpacesTypes';

export const runtime = 'nodejs';

type SupabaseLike = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;

type ParkingValidationReportRow = {
  id?: string | null;
  user_id?: string | null;
  parking_lot_id?: string | null;
  lot_name?: string | null;
  airport_code?: string | null;
  destination_text?: string | null;
  report_type?: string | null;
  validation_status?: string | null;
  access_type?: string | null;
  free_minutes?: number | null;
  validation_business?: string | null;
  badge_required?: boolean | null;
  permit_required?: boolean | null;
  visitor_allowed?: boolean | null;
  notes?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const VALIDATION_REPORT_SELECT = [
  'id',
  'user_id',
  'parking_lot_id',
  'lot_name',
  'airport_code',
  'destination_text',
  'report_type',
  'validation_status',
  'access_type',
  'free_minutes',
  'validation_business',
  'badge_required',
  'permit_required',
  'visitor_allowed',
  'notes',
  'status',
  'created_at',
  'updated_at',
].join(',');

function emptyParkingRecord(overrides: Partial<UserParkingSpaceRecord>): UserParkingSpaceRecord {
  const now = new Date(0).toISOString();
  return {
    id: '',
    user_id: '',
    name: 'Parking submission',
    address: 'Location not provided',
    lat: null,
    lng: null,
    google_place_id: null,
    parking_type: 'unknown',
    price: 0,
    is_free: false,
    time_limit_minutes: null,
    overnight_allowed: null,
    validation_required: false,
    business_name: null,
    lot_rules: null,
    notes: null,
    evidence_url: null,
    source: 'parking-validation-report',
    status: 'pending',
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function mapReportTypeToParkingType(reportType: string | null | undefined): UserParkingSpaceRecord['parking_type'] {
  switch (reportType) {
    case 'free':
      return 'free';
    case 'validated':
      return 'customer_only';
    case 'restricted':
      return 'unknown';
    case 'paid_only':
    case 'wrong_info':
    default:
      return 'unknown';
  }
}

function normalizeStatus(value: string | null | undefined): UserParkingStatus {
  return isUserParkingStatus(value) ? value : 'pending';
}

function mapValidationReport(row: ParkingValidationReportRow): UserParkingSpaceRecord {
  const createdAt = row.created_at || new Date(0).toISOString();
  const updatedAt = row.updated_at || createdAt;
  const status = normalizeStatus(row.status);
  const accessDetails = [
    row.validation_status ? `Validation status: ${row.validation_status}` : null,
    row.access_type ? `Access: ${row.access_type}` : null,
    row.free_minutes != null ? `Free minutes: ${row.free_minutes}` : null,
    row.badge_required ? 'Badge required' : null,
    row.permit_required ? 'Permit required' : null,
    row.visitor_allowed === false ? 'Visitors not allowed' : null,
  ].filter(Boolean);

  return emptyParkingRecord({
    id: row.id || '',
    user_id: row.user_id || '',
    name: row.lot_name || row.parking_lot_id || 'Parking validation report',
    address: row.destination_text || row.airport_code || 'Location not provided',
    parking_type: mapReportTypeToParkingType(row.report_type),
    time_limit_minutes: row.free_minutes ?? null,
    validation_required: row.report_type === 'validated',
    business_name: row.validation_business || null,
    lot_rules: accessDetails.join(' · ') || null,
    notes: row.notes || null,
    source: 'parking-validation-report',
    status,
    created_at: createdAt,
    updated_at: updatedAt,
  });
}

function mapUserParkingSpace(row: Partial<UserParkingSpaceRecord>): UserParkingSpaceRecord {
  return emptyParkingRecord({
    ...row,
    id: row.id || '',
    user_id: row.user_id || '',
    name: row.name || 'Parking submission',
    address: row.address || 'Location not provided',
    parking_type: row.parking_type || 'unknown',
    price: typeof row.price === 'number' ? row.price : 0,
    is_free: row.is_free ?? true,
    validation_required: row.validation_required ?? false,
    source: row.source || 'user-submitted',
    status: normalizeStatus(row.status),
    created_at: row.created_at || new Date(0).toISOString(),
    updated_at: row.updated_at || row.created_at || new Date(0).toISOString(),
  });
}

async function listValidationReportsForAdmin(
  client: SupabaseLike,
  status: UserParkingStatus | 'all',
): Promise<UserParkingSpaceRecord[]> {
  let query = client
    .from('parking_validation_reports')
    .select(VALIDATION_REPORT_SELECT)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data || []) as ParkingValidationReportRow[]).map(mapValidationReport);
}

async function listUserParkingSpacesForAdmin(
  client: SupabaseLike,
  status: UserParkingStatus | 'all',
): Promise<UserParkingSpaceRecord[]> {
  let query = client
    .from('user_parking_spaces')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data || []) as Partial<UserParkingSpaceRecord>[]).map(mapUserParkingSpace);
}

async function listParkingSubmissionsForAdmin(
  client: SupabaseLike,
  status: UserParkingStatus | 'all',
): Promise<UserParkingSpaceRecord[]> {
  const results = await Promise.allSettled([
    listValidationReportsForAdmin(client, status),
    listUserParkingSpacesForAdmin(client, status),
  ]);

  const fulfilled = results
    .filter((result): result is PromiseFulfilledResult<UserParkingSpaceRecord[]> => result.status === 'fulfilled')
    .flatMap((result) => result.value);

  if (fulfilled.length > 0 || results.some((result) => result.status === 'fulfilled')) {
    return fulfilled.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }

  throw results.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
}

async function updateValidationReportStatus(
  client: SupabaseLike,
  id: string,
  status: UserParkingStatus,
): Promise<UserParkingSpaceRecord | null> {
  const { data, error } = await client
    .from('parking_validation_reports')
    .update({ status })
    .eq('id', id)
    .select(VALIDATION_REPORT_SELECT)
    .maybeSingle();

  if (error) throw error;
  return data ? mapValidationReport(data as ParkingValidationReportRow) : null;
}

async function updateUserParkingSpaceStatus(args: {
  client: SupabaseLike;
  id: string;
  status: UserParkingStatus;
  adminUserId: string | null;
  rejectionReason: string | null;
}): Promise<UserParkingSpaceRecord | null> {
  const verifiedAt = args.status === 'verified' ? new Date().toISOString() : null;
  const rejectionReason =
    args.status === 'rejected' || args.status === 'needs_more_info'
      ? args.rejectionReason?.trim()?.slice(0, 2000) || null
      : null;

  const { data, error } = await args.client
    .from('user_parking_spaces')
    .update({
      status: args.status,
      verified_by: args.status === 'verified' ? args.adminUserId : null,
      verified_at: verifiedAt,
      rejection_reason: rejectionReason,
    })
    .eq('id', args.id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data ? mapUserParkingSpace(data as Partial<UserParkingSpaceRecord>) : null;
}

function getParkingSubmissionsStorageAdminHint(): string {
  const missing = [
    process.env.NEXT_PUBLIC_SUPABASE_URL ? null : 'NEXT_PUBLIC_SUPABASE_URL',
    process.env.SUPABASE_SERVICE_ROLE_KEY ? null : 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);

  if (missing.length > 0) {
    return `Missing server env: ${missing.join(', ')}.`;
  }

  return 'Supabase service-role client could not be created.';
}

function jsonError(status: number, error: string, message: string, adminHint?: string) {
  return NextResponse.json(
    {
      error,
      message,
      ...(adminHint ? { adminHint } : {}),
    },
    { status },
  );
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const client = createSupabaseServiceClient();
  if (!client) {
    return jsonError(
      503,
      'database_not_configured',
      'Parking submissions storage is not configured.',
      getParkingSubmissionsStorageAdminHint(),
    );
  }

  const statusRaw = request.nextUrl.searchParams.get('status') || 'pending';
  const status = statusRaw === 'all' || isUserParkingStatus(statusRaw)
    ? (statusRaw as UserParkingStatus | 'all')
    : 'pending';

  try {
    const parking = await listParkingSubmissionsForAdmin(client, status);
    return NextResponse.json({ parking });
  } catch (error) {
    console.warn('[admin-parking-submissions] list failed', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return jsonError(500, 'list_failed', 'Could not load parking submissions.');
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, 'invalid_json', 'Expected JSON body.');
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const status = typeof body.status === 'string' && isUserParkingStatus(body.status)
    ? body.status
    : null;
  if (!id || !status) {
    return jsonError(400, 'invalid_moderation_request', 'id and valid status are required.');
  }

  const client = createSupabaseServiceClient();
  if (!client) {
    return jsonError(
      503,
      'database_not_configured',
      'Parking submissions storage is not configured.',
      getParkingSubmissionsStorageAdminHint(),
    );
  }

  try {
    const validationReport = await updateValidationReportStatus(client, id, status);
    if (validationReport) {
      return NextResponse.json({ parking: validationReport });
    }

    const parking = await updateUserParkingSpaceStatus({
      client,
      id,
      status,
      adminUserId: admin.userId,
      rejectionReason:
        typeof body.rejection_reason === 'string' ? body.rejection_reason : null,
    });

    if (!parking) {
      return jsonError(404, 'not_found', 'Parking submission not found.');
    }

    return NextResponse.json({ parking });
  } catch (error) {
    console.warn('[admin-parking-submissions] moderation failed', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return jsonError(500, 'moderation_failed', 'Could not update parking submission.');
  }
}
