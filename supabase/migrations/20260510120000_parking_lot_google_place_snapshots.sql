create table if not exists public.parking_lot_google_place_snapshots (
  cache_key text primary key,
  parking_lot_id bigint references public.parking_lots(id) on delete set null,
  airport_code text not null,
  lot_name text not null,
  normalized_lot_name text not null,
  lot_address text,
  google_place_id text,
  google_place_name text,
  google_formatted_address text,
  google_maps_uri text,
  rating numeric(3,2),
  review_count integer,
  reviews_json jsonb not null default '[]'::jsonb,
  match_confidence text,
  last_fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  constraint parking_lot_google_place_snapshots_reviews_json_is_array
    check (jsonb_typeof(reviews_json) = 'array')
);

create index if not exists parking_lot_google_place_snapshots_airport_code_idx
  on public.parking_lot_google_place_snapshots (airport_code);

create index if not exists parking_lot_google_place_snapshots_parking_lot_id_idx
  on public.parking_lot_google_place_snapshots (parking_lot_id);

create index if not exists parking_lot_google_place_snapshots_google_place_id_idx
  on public.parking_lot_google_place_snapshots (google_place_id);

alter table public.parking_lot_google_place_snapshots enable row level security;
