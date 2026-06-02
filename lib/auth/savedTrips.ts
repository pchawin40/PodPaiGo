import type { SupabaseClient } from '@supabase/supabase-js';
import type { TripData } from '../types';
import { buildSavedTripInsert } from './buildSavedTrip';
import type { SavedTripInsert, SavedTripRecord } from './types';

export async function insertSavedTrip(
  client: SupabaseClient,
  tripData: TripData,
  userId: string,
  options?: { intent?: string | null; tripName?: string },
): Promise<{ data: SavedTripRecord | null; error: Error | null }> {
  const payload: SavedTripInsert = buildSavedTripInsert(tripData, userId, options);

  const { data, error } = await client
    .from('saved_trips')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as SavedTripRecord, error: null };
}

export async function listSavedTrips(
  client: SupabaseClient,
  userId: string,
): Promise<{ data: SavedTripRecord[]; error: Error | null }> {
  const { data, error } = await client
    .from('saved_trips')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  return { data: (data || []) as SavedTripRecord[], error: null };
}

export async function deleteSavedTrip(
  client: SupabaseClient,
  userId: string,
  tripId: string,
): Promise<{ error: Error | null }> {
  const { error } = await client
    .from('saved_trips')
    .delete()
    .eq('id', tripId)
    .eq('user_id', userId);

  return { error: error ? new Error(error.message) : null };
}
