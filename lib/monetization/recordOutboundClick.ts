import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { OutboundClickInsert } from './validateOutboundClick';

export function createSupabaseAuthClient(accessToken?: string | null): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export async function insertOutboundClickEvent(
  client: SupabaseClient,
  payload: OutboundClickInsert,
  authenticatedUserId: string | null,
): Promise<void> {
  const userId = authenticatedUserId ?? null;

  if (payload.userId && payload.userId !== authenticatedUserId) {
    throw new Error('user_id mismatch');
  }

  const { error } = await client.from('outbound_click_events').insert({
    user_id: userId,
    event_type: payload.eventType,
    provider: payload.provider,
    airport_code: payload.airportCode,
    parking_lot_id: payload.parkingLotId,
    destination_url: payload.destinationUrl,
    trip_id: payload.tripId,
    metadata: payload.metadata ?? {},
  });

  if (error) {
    throw error;
  }
}
