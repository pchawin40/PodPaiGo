import type { TripData } from '../types';

export type UserProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type SavedTripRecord = {
  id: string;
  user_id: string;
  trip_name: string | null;
  origin_text: string | null;
  destination_text: string | null;
  airport_code: string | null;
  departure_at: string | null;
  return_at: string | null;
  trip_type: string;
  trip_payload: TripData | Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SavedTripInsert = {
  user_id: string;
  trip_name: string;
  origin_text: string;
  destination_text: string;
  airport_code?: string | null;
  departure_at?: string | null;
  return_at?: string | null;
  trip_type: string;
  trip_payload: TripData;
};
