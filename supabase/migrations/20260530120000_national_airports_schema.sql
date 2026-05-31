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
