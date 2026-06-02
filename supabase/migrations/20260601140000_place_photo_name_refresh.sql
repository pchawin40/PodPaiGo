-- Store Google Places photo resource names (not PhotoMedia URLs) with yearly refresh metadata.

alter table public.parking_lot_google_place_snapshots
  add column if not exists photo_refreshed_at timestamptz,
  add column if not exists photo_source text default 'google_places';

create index if not exists parking_lot_google_place_snapshots_photo_refresh_idx
  on public.parking_lot_google_place_snapshots (photo_refreshed_at desc nulls first)
  where google_place_id is not null;
