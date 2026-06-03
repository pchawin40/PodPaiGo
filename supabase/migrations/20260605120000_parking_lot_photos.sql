-- First-party / partner / provider parking lot photos.
-- Google Places photo bytes and long-term Google media URLs must NOT be stored here.
-- Google photo resource names stay in place snapshots only for short-term live proxy retrieval.

create extension if not exists pgcrypto;

create table if not exists public.parking_lot_photos (
  id uuid primary key default gen_random_uuid(),
  parking_lot_id text,
  provider text,
  provider_lot_id text,
  google_place_id text,
  airport_code text,
  image_url text not null,
  storage_path text,
  source text not null,
  attribution text,
  attribution_url text,
  license_note text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parking_lot_photos_source_check
    check (source in ('first_party', 'partner', 'provider', 'google_live_placeholder'))
);

create index if not exists parking_lot_photos_airport_code_idx
  on public.parking_lot_photos (airport_code);

create index if not exists parking_lot_photos_google_place_id_idx
  on public.parking_lot_photos (google_place_id)
  where google_place_id is not null;

create index if not exists parking_lot_photos_provider_lot_idx
  on public.parking_lot_photos (provider, provider_lot_id)
  where provider is not null and provider_lot_id is not null;

create index if not exists parking_lot_photos_parking_lot_id_idx
  on public.parking_lot_photos (parking_lot_id)
  where parking_lot_id is not null;

create or replace function public.set_parking_lot_photos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists parking_lot_photos_set_updated_at on public.parking_lot_photos;
create trigger parking_lot_photos_set_updated_at
  before update on public.parking_lot_photos
  for each row
  execute function public.set_parking_lot_photos_updated_at();

alter table public.parking_lot_photos enable row level security;

drop policy if exists parking_lot_photos_read_public on public.parking_lot_photos;
create policy parking_lot_photos_read_public
  on public.parking_lot_photos
  for select
  to anon, authenticated
  using (true);

grant select on public.parking_lot_photos to anon, authenticated;

-- Inserts/updates are service-role / migration / dev seed only for now.
-- TODO: admin UI for curated lot photos.
