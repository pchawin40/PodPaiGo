import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAuthClient } from '@/lib/monetization/recordOutboundClick';
import {
  isUserParkingEditable,
  validateUserParkingInput,
  type UserParkingSpaceRecord,
} from '@/lib/parking/userParkingSpacesTypes';
import { geocodeUserParkingAddress } from '@/lib/parking/userParkingSpacesServer';

export const runtime = 'nodejs';

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

async function requireUser(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
  if (!accessToken) {
    return { error: jsonError(401, 'auth_required', 'Sign in to manage parking.'), client: null, userId: null };
  }

  const client = createSupabaseAuthClient(accessToken);
  if (!client) {
    return { error: jsonError(503, 'supabase_not_configured', 'Supabase auth is not configured.'), client: null, userId: null };
  }

  const { data } = await client.auth.getUser();
  const userId = data.user?.id ?? null;
  if (!userId) {
    return { error: jsonError(401, 'auth_required', 'Sign in to manage parking.'), client: null, userId: null };
  }

  return { error: null, client, userId };
}

async function getOwnSubmission(
  client: NonNullable<ReturnType<typeof createSupabaseAuthClient>>,
  userId: string,
  id: string,
): Promise<{ record: UserParkingSpaceRecord | null; error: string | null }> {
  const { data, error } = await client
    .from('user_parking_spaces')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { record: null, error: error.message };
  return { record: (data as UserParkingSpaceRecord | null) ?? null, error: null };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await requireUser(request);
  if (auth.error) return auth.error;

  const existing = await getOwnSubmission(auth.client!, auth.userId!, id);
  if (existing.error) return jsonError(500, 'lookup_failed', existing.error);
  if (!existing.record) return jsonError(404, 'not_found', 'Parking submission not found.');
  if (!isUserParkingEditable(existing.record.status)) {
    return jsonError(
      409,
      'not_editable',
      'Verified parking cannot be edited directly. Submit a new correction instead.',
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Expected JSON body.');
  }

  const validated = validateUserParkingInput(body);
  if (!validated.ok) {
    return jsonError(400, 'invalid_parking_submission', validated.error);
  }

  const addressChanged = validated.value.address !== existing.record.address;
  const coords =
    typeof validated.value.lat === 'number' && typeof validated.value.lng === 'number'
      ? { lat: validated.value.lat, lng: validated.value.lng }
      : addressChanged
        ? await geocodeUserParkingAddress(validated.value.address)
        : { lat: existing.record.lat, lng: existing.record.lng };

  const { data, error } = await auth.client!
    .from('user_parking_spaces')
    .update({
      name: validated.value.name,
      address: validated.value.address,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      google_place_id: validated.value.google_place_id ?? existing.record.google_place_id,
      parking_type: validated.value.parking_type,
      time_limit_minutes: validated.value.time_limit_minutes ?? null,
      overnight_allowed: validated.value.overnight_allowed ?? null,
      validation_required: validated.value.validation_required ?? false,
      business_name: validated.value.business_name ?? null,
      lot_rules: validated.value.lot_rules ?? null,
      notes: validated.value.notes ?? null,
      evidence_url: validated.value.evidence_url ?? null,
      status: 'pending',
      rejection_reason: null,
      verified_by: null,
      verified_at: null,
    })
    .eq('id', id)
    .eq('user_id', auth.userId!)
    .select('*')
    .single();

  if (error) return jsonError(500, 'update_failed', error.message);

  return NextResponse.json({ parking: data as UserParkingSpaceRecord });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await requireUser(request);
  if (auth.error) return auth.error;

  const existing = await getOwnSubmission(auth.client!, auth.userId!, id);
  if (existing.error) return jsonError(500, 'lookup_failed', existing.error);
  if (!existing.record) return jsonError(404, 'not_found', 'Parking submission not found.');
  if (!isUserParkingEditable(existing.record.status)) {
    return jsonError(409, 'not_editable', 'Only pending submissions can be deleted.');
  }

  const { error } = await auth.client!
    .from('user_parking_spaces')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId!);

  if (error) return jsonError(500, 'delete_failed', error.message);

  return NextResponse.json({ ok: true });
}
