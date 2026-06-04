import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAuthClient } from '../../../../lib/monetization/recordOutboundClick';
import {
  validateUserParkingInput,
  isUserParkingEditable,
  type UserParkingStatus,
} from '../../../../lib/parking/userParkingSpacesTypes';
import { geocodeUserParkingAddress } from '../../../../lib/parking/userParkingSpacesServer';

export const runtime = 'nodejs';

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

const SIGN_IN_MESSAGE =
  'Register or sign in first so PodPaiGo can verify your free parking spot.';

async function resolveUser(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
  const authClient = createSupabaseAuthClient(accessToken);
  if (!authClient || !accessToken) {
    return { userId: null, client: authClient };
  }
  const { data } = await authClient.auth.getUser();
  return { userId: data.user?.id ?? null, client: authClient };
}

export async function GET(request: NextRequest) {
  const { userId, client } = await resolveUser(request);
  if (!client) {
    return jsonError(503, 'not_configured', 'Database storage is not configured.');
  }
  if (!userId) {
    return jsonError(401, 'sign_in_required', SIGN_IN_MESSAGE);
  }

  const { data, error } = await client
    .from('user_parking_spaces')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return jsonError(500, 'list_failed', error.message);
  }

  return NextResponse.json({ ok: true, spaces: data ?? [] });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_request_body', 'Expected JSON body.');
  }

  const { userId, client } = await resolveUser(request);
  if (!client) {
    return jsonError(503, 'not_configured', 'Database storage is not configured.');
  }
  if (!userId) {
    return jsonError(401, 'sign_in_required', SIGN_IN_MESSAGE);
  }

  const validation = validateUserParkingInput(body);
  if (!validation.ok) {
    return jsonError(400, 'invalid_submission', validation.error);
  }
  const input = validation.value;

  let lat = input.lat ?? null;
  let lng = input.lng ?? null;
  if ((lat == null || lng == null) && input.address) {
    const geocoded = await geocodeUserParkingAddress(input.address);
    if (geocoded) {
      lat = geocoded.lat;
      lng = geocoded.lng;
    }
  }

  const payload = {
    user_id: userId,
    name: input.name,
    address: input.address,
    lat,
    lng,
    google_place_id: input.google_place_id ?? null,
    parking_type: input.parking_type,
    price: 0,
    is_free: true,
    time_limit_minutes: input.time_limit_minutes ?? null,
    overnight_allowed: input.overnight_allowed ?? null,
    validation_required: input.validation_required ?? false,
    business_name: input.business_name ?? null,
    lot_rules: input.lot_rules ?? null,
    notes: input.notes ?? null,
    evidence_url: input.evidence_url ?? null,
    source: 'user-submitted',
    status: 'pending' as UserParkingStatus,
  };

  const { data, error } = await client
    .from('user_parking_spaces')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    return jsonError(500, 'insert_failed', error.message);
  }

  return NextResponse.json({ ok: true, space: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  let body: { id?: unknown } & Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_request_body', 'Expected JSON body.');
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return jsonError(400, 'missing_id', 'A submission id is required.');
  }

  const { userId, client } = await resolveUser(request);
  if (!client) {
    return jsonError(503, 'not_configured', 'Database storage is not configured.');
  }
  if (!userId) {
    return jsonError(401, 'sign_in_required', SIGN_IN_MESSAGE);
  }

  const { data: existing, error: fetchError } = await client
    .from('user_parking_spaces')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !existing) {
    return jsonError(404, 'not_found', 'Submission not found.');
  }

  if (!isUserParkingEditable(existing.status as UserParkingStatus)) {
    return jsonError(
      409,
      'not_editable',
      'Verified or rejected submissions can no longer be edited.',
    );
  }

  const validation = validateUserParkingInput(body);
  if (!validation.ok) {
    return jsonError(400, 'invalid_submission', validation.error);
  }
  const input = validation.value;

  let lat = input.lat ?? null;
  let lng = input.lng ?? null;
  if ((lat == null || lng == null) && input.address && input.address !== existing.address) {
    const geocoded = await geocodeUserParkingAddress(input.address);
    if (geocoded) {
      lat = geocoded.lat;
      lng = geocoded.lng;
    }
  } else if (lat == null || lng == null) {
    lat = existing.lat ?? null;
    lng = existing.lng ?? null;
  }

  const { data, error } = await client
    .from('user_parking_spaces')
    .update({
      name: input.name,
      address: input.address,
      lat,
      lng,
      google_place_id: input.google_place_id ?? null,
      parking_type: input.parking_type,
      time_limit_minutes: input.time_limit_minutes ?? null,
      overnight_allowed: input.overnight_allowed ?? null,
      validation_required: input.validation_required ?? false,
      business_name: input.business_name ?? null,
      lot_rules: input.lot_rules ?? null,
      notes: input.notes ?? null,
      evidence_url: input.evidence_url ?? null,
      // Edits always return the submission to pending re-verification.
      status: 'pending' as UserParkingStatus,
      rejection_reason: null,
      verified_at: null,
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    return jsonError(500, 'update_failed', error.message);
  }

  return NextResponse.json({ ok: true, space: data });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim() || '';
  if (!id) {
    return jsonError(400, 'missing_id', 'A submission id is required.');
  }

  const { userId, client } = await resolveUser(request);
  if (!client) {
    return jsonError(503, 'not_configured', 'Database storage is not configured.');
  }
  if (!userId) {
    return jsonError(401, 'sign_in_required', SIGN_IN_MESSAGE);
  }

  const { error } = await client
    .from('user_parking_spaces')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    return jsonError(500, 'delete_failed', error.message);
  }

  return NextResponse.json({ ok: true });
}
