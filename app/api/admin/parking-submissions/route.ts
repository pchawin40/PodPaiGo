import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import {
  isUserParkingStatus,
  type UserParkingStatus,
} from '@/lib/parking/userParkingSpacesTypes';
import {
  listUserParkingSubmissionsForAdmin,
  updateUserParkingSubmissionStatus,
} from '@/lib/parking/userParkingSpacesServer';

export const runtime = 'nodejs';

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const statusRaw = request.nextUrl.searchParams.get('status') || 'pending';
  const status = statusRaw === 'all' || isUserParkingStatus(statusRaw)
    ? (statusRaw as UserParkingStatus | 'all')
    : 'pending';

  const parking = await listUserParkingSubmissionsForAdmin({ status });
  return NextResponse.json({ parking });
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

  const parking = await updateUserParkingSubmissionStatus({
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
}
