import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAuthClient } from '@/lib/monetization/recordOutboundClick';
import {
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
    return { error: jsonError(401, 'auth_required', 'Sign in to submit parking.'), client: null, userId: null };
  }

  const client = createSupabaseAuthClient(accessToken);
  if (!client) {
    return { error: jsonError(503, 'supabase_not_configured', 'Supabase auth is not configured.'), client: null, userId: null };
  }

  const { data } = await client.auth.getUser();
  const userId = data.user?.id ?? null;
  if (!userId) {
    return { error: jsonError(401, 'auth_required', 'Sign in to submit parking.'), client: null, userId: null };
  }

  return { error: null, client, userId };
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;

  const { data, error } = await auth.client!
    .from('user_parking_spaces')
    .select('*')
    .eq('user_id', auth.userId!)
    .order('created_at', { ascending: false });

  if (error) {
    return jsonError(500, 'list_failed', error.message);
  }

  return NextResponse.json({ parking: (data || []) as UserParkingSpaceRecord[] });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;

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

  const coords =
    typeof validated.value.lat === 'number' && typeof validated.value.lng === 'number'
      ? { lat: validated.value.lat, lng: validated.value.lng }
      : await geocodeUserParkingAddress(validated.value.address);

  const payload = {
    user_id: auth.userId,
    name: validated.value.name,
    address: validated.value.address,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    google_place_id: validated.value.google_place_id ?? null,
    parking_type: validated.value.parking_type,
    price: 0,
    is_free: true,
    time_limit_minutes: validated.value.time_limit_minutes ?? null,
    overnight_allowed: validated.value.overnight_allowed ?? null,
    validation_required: validated.value.validation_required ?? false,
    business_name: validated.value.business_name ?? null,
    lot_rules: validated.value.lot_rules ?? null,
    notes: validated.value.notes ?? null,
    evidence_url: validated.value.evidence_url ?? null,
    source: 'user-submitted',
    status: 'pending',
  };

  const { data, error } = await auth.client!
    .from('user_parking_spaces')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    return jsonError(500, 'insert_failed', error.message);
  }

  return NextResponse.json({ parking: data as UserParkingSpaceRecord }, { status: 201 });
}
