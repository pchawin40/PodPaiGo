-- Core parking provider tables referenced by inventory, snapshots, and ParkWhiz cache.
-- Idempotent: upgrades legacy parking_lots schema and ensures snapshot constraints exist.

do $$
declare
  has_airport_code boolean;
  lot_count bigint;
begin
  if to_regclass('public.parking_lots') is not null then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'parking_lots'
        and column_name = 'airport_code'
    ) into has_airport_code;

    if not has_airport_code then
      execute 'select count(*)::bigint from public.parking_lots' into lot_count;

      if lot_count = 0 then
        execute 'drop table public.parking_lots cascade';
      else
        raise exception 'parking_lots has legacy schema with % rows; migrate manually before applying provider tables', lot_count;
      end if;
    end if;
  end if;
end
$$;

create table if not exists public.parking_lots (
  id bigserial primary key,
  airport_code text not null,
  name text not null,
  normalized_name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  source text not null,
  source_id text not null,
  source_url text,
  is_official boolean not null default false,
  confidence numeric(4, 3) not null default 0.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parking_lots_airport_source_source_id_key
    unique (airport_code, source, source_id)
);

alter table public.parking_lots add column if not exists airport_code text;
alter table public.parking_lots add column if not exists normalized_name text;
alter table public.parking_lots add column if not exists latitude double precision;
alter table public.parking_lots add column if not exists longitude double precision;
alter table public.parking_lots add column if not exists source text;
alter table public.parking_lots add column if not exists source_id text;
alter table public.parking_lots add column if not exists source_url text;
alter table public.parking_lots add column if not exists is_official boolean not null default false;
alter table public.parking_lots add column if not exists confidence numeric(4, 3) not null default 0.5;
alter table public.parking_lots add column if not exists created_at timestamptz not null default now();
alter table public.parking_lots add column if not exists updated_at timestamptz not null default now();

create index if not exists parking_lots_airport_code_idx
  on public.parking_lots (airport_code);

create table if not exists public.parking_price_snapshots (
  id bigserial primary key,
  lot_id text,
  lot_name text not null,
  airport_code text not null,
  check_in_date date not null,
  check_out_date date not null,
  price_total numeric(10, 2),
  price_daily numeric(10, 2),
  currency text not null default 'USD',
  availability_status text,
  booking_url text,
  source text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.parking_price_snapshots add column if not exists lot_id text;
alter table public.parking_price_snapshots add column if not exists lot_name text;
alter table public.parking_price_snapshots add column if not exists airport_code text;
alter table public.parking_price_snapshots add column if not exists check_in_date date;
alter table public.parking_price_snapshots add column if not exists check_out_date date;
alter table public.parking_price_snapshots add column if not exists price_total numeric(10, 2);
alter table public.parking_price_snapshots add column if not exists price_daily numeric(10, 2);
alter table public.parking_price_snapshots add column if not exists currency text not null default 'USD';
alter table public.parking_price_snapshots add column if not exists availability_status text;
alter table public.parking_price_snapshots add column if not exists booking_url text;
alter table public.parking_price_snapshots add column if not exists source text;
alter table public.parking_price_snapshots add column if not exists fetched_at timestamptz not null default now();
alter table public.parking_price_snapshots add column if not exists expires_at timestamptz;

alter table public.parking_price_snapshots
  alter column fetched_at type timestamptz
  using fetched_at::timestamptz;

alter table public.parking_price_snapshots
  alter column expires_at type timestamptz
  using expires_at::timestamptz;

-- alter table public.parking_price_snapshots
--   alter column id type bigint
--   using id::bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.parking_price_snapshots'::regclass
      and conname = 'parking_price_snapshots_airport_booking_dates_key'
  ) then
    delete from public.parking_price_snapshots p
    using public.parking_price_snapshots p2
    where p.id < p2.id
      and p.airport_code is not distinct from p2.airport_code
      and p.booking_url is not distinct from p2.booking_url
      and p.check_in_date is not distinct from p2.check_in_date
      and p.check_out_date is not distinct from p2.check_out_date;

    alter table public.parking_price_snapshots
      add constraint parking_price_snapshots_airport_booking_dates_key
      unique (airport_code, booking_url, check_in_date, check_out_date);
  end if;
exception
  when others then
    raise notice 'Could not add parking_price_snapshots unique constraint: %', sqlerrm;
end
$$;

create index if not exists parking_price_snapshots_airport_dates_idx
  on public.parking_price_snapshots (airport_code, check_in_date, check_out_date);

create index if not exists parking_price_snapshots_expires_at_idx
  on public.parking_price_snapshots (expires_at);

create table if not exists public.parkwhiz_quote_snapshots (
  cache_key text primary key,
  airport_code text not null,
  check_in_at timestamptz not null,
  check_out_at timestamptz not null,
  distance_miles numeric(6, 2) not null default 5,
  options_json jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists parkwhiz_quote_snapshots_airport_idx
  on public.parkwhiz_quote_snapshots (airport_code);

create index if not exists parkwhiz_quote_snapshots_expires_at_idx
  on public.parkwhiz_quote_snapshots (expires_at);
