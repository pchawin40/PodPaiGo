-- Generic destination/local parking intelligence notes.
-- These notes are evidence for places, neighborhoods, cities, and venue types;
-- they are not hardcoded application rules.

create extension if not exists pgcrypto;

create table if not exists public.destination_parking_notes (
  id uuid primary key default gen_random_uuid(),
  scope text not null
    check (scope in ('place', 'neighborhood', 'city', 'venue_type')),
  place_id text,
  name_pattern text,
  city text,
  state text,
  lat double precision,
  lng double precision,
  radius_miles numeric,
  parking_kind text not null default 'unknown'
    check (parking_kind in (
      'customer',
      'onsite',
      'street',
      'garage',
      'event',
      'permit',
      'unknown'
    )),
  cost_expectation text not null default 'verify'
    check (cost_expectation in (
      'likely_free',
      'mixed',
      'likely_paid',
      'verify'
    )),
  confidence numeric not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  source_label text,
  source_url text,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists destination_parking_notes_scope_idx
  on public.destination_parking_notes (scope);

create index if not exists destination_parking_notes_place_id_idx
  on public.destination_parking_notes (place_id)
  where place_id is not null;

create index if not exists destination_parking_notes_city_state_idx
  on public.destination_parking_notes (city, state)
  where city is not null or state is not null;

create index if not exists destination_parking_notes_geo_idx
  on public.destination_parking_notes (lat, lng)
  where lat is not null and lng is not null;

create index if not exists destination_parking_notes_updated_at_idx
  on public.destination_parking_notes (updated_at desc);

create or replace function public.set_destination_parking_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists destination_parking_notes_set_updated_at on public.destination_parking_notes;
create trigger destination_parking_notes_set_updated_at
  before update on public.destination_parking_notes
  for each row
  execute function public.set_destination_parking_notes_updated_at();

alter table public.destination_parking_notes enable row level security;

drop policy if exists destination_parking_notes_read_public on public.destination_parking_notes;
create policy destination_parking_notes_read_public
  on public.destination_parking_notes
  for select
  to anon, authenticated
  using (true);

grant select on public.destination_parking_notes to anon, authenticated;

-- Inserts/updates/deletes should be performed by service-role admin tooling after moderation.
