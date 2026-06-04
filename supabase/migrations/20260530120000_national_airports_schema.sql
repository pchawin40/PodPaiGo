-- National US airport reference data (OurAirports / FAA-derived import).
-- Public read-only reference table; no PII.

create table if not exists public.airports (
  airport_code text primary key,
  iata text,
  icao text,
  name text not null,
  city text,
  state text,
  country text not null default 'US',
  latitude double precision not null,
  longitude double precision not null,
  timezone text,
  airport_type text,
  keywords text,
  is_active boolean not null default true,
  sort_order integer not null default 1000,
  -- Legacy PodPaiGo enrichment columns (optional overrides)
  destination_name text,
  routing_address text,
  parking_search_query text,
  rideshare_destination_name text,
  checkin_note text,
  generic_guidance text,
  official_parking_url text,
  official_airport_url text,
  indoor_map jsonb,
  airport_map_url text,
  airport_map_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibility with an older public.airports table.
-- `create table if not exists` above is a no-op when the table already exists, so
-- ensure every column this migration relies on exists before creating indexes.
-- No NOT NULL constraints here: existing rows may not satisfy them.
alter table public.airports add column if not exists airport_code text;
alter table public.airports add column if not exists iata text;
alter table public.airports add column if not exists icao text;
alter table public.airports add column if not exists name text;
alter table public.airports add column if not exists city text;
alter table public.airports add column if not exists state text;
alter table public.airports add column if not exists country text default 'US';
alter table public.airports add column if not exists latitude double precision;
alter table public.airports add column if not exists longitude double precision;
alter table public.airports add column if not exists timezone text;
alter table public.airports add column if not exists airport_type text;
alter table public.airports add column if not exists keywords text;
alter table public.airports add column if not exists is_active boolean default true;
alter table public.airports add column if not exists sort_order integer default 1000;
alter table public.airports add column if not exists destination_name text;
alter table public.airports add column if not exists routing_address text;
alter table public.airports add column if not exists parking_search_query text;
alter table public.airports add column if not exists rideshare_destination_name text;
alter table public.airports add column if not exists checkin_note text;
alter table public.airports add column if not exists generic_guidance text;
alter table public.airports add column if not exists official_parking_url text;
alter table public.airports add column if not exists official_airport_url text;
alter table public.airports add column if not exists indoor_map jsonb;
alter table public.airports add column if not exists airport_map_url text;
alter table public.airports add column if not exists airport_map_label text;
alter table public.airports add column if not exists created_at timestamptz default now();
alter table public.airports add column if not exists updated_at timestamptz default now();

-- Safe backfills from legacy columns (only run when the legacy column exists).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'airports' and column_name = 'id'
  ) then
    execute 'update public.airports set airport_code = id::text where airport_code is null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'airports' and column_name = 'lat'
  ) then
    execute 'update public.airports set latitude = lat where latitude is null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'airports' and column_name = 'lng'
  ) then
    execute 'update public.airports set longitude = lng where longitude is null';
  end if;
end $$;

create index if not exists airports_iata_idx on public.airports (iata) where iata is not null;
create index if not exists airports_icao_idx on public.airports (icao) where icao is not null;
create index if not exists airports_state_idx on public.airports (state) where state is not null;
create index if not exists airports_city_idx on public.airports (lower(city)) where city is not null;
create index if not exists airports_name_lower_idx on public.airports (lower(name));
create index if not exists airports_active_country_idx on public.airports (country, is_active);

-- Backward compatibility: legacy `id` column used by older API mappers.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'airports' and column_name = 'id'
  ) then
    alter table public.airports add column id text generated always as (airport_code) stored;
  end if;
end $$;

comment on table public.airports is 'National airport reference data imported from OurAirports; enriched rows may include PodPaiGo metadata.';
