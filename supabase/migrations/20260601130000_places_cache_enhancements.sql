-- Extend place snapshots with coordinates and photo metadata to avoid repeat GetPlace calls.

alter table public.parking_lot_google_place_snapshots
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists photo_name text,
  add column if not exists photo_names_json jsonb not null default '[]'::jsonb;

create index if not exists parking_lot_google_place_snapshots_place_id_fresh_idx
  on public.parking_lot_google_place_snapshots (google_place_id, expires_at desc);

-- Cached photo proxy URLs / names per place (used by google-place-match).

create table if not exists public.parking_place_photos (
  place_id text primary key,
  parking_name text,
  airport_code text,
  photos jsonb not null default '[]'::jsonb,
  attributions jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  updated_at timestamptz not null default now(),
  constraint parking_place_photos_photos_is_array check (jsonb_typeof(photos) = 'array'),
  constraint parking_place_photos_attributions_is_array check (jsonb_typeof(attributions) = 'array')
);

create index if not exists parking_place_photos_expires_at_idx
  on public.parking_place_photos (expires_at desc);

alter table public.parking_place_photos enable row level security;
