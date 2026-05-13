-- Phase 1 rollout RLS hardening.
-- These tables should contain only public airport, parking lot, and cache/reference data.
-- Do not store trip origins, home addresses, emails, phone numbers, saved trips, or
-- notification preferences in these public-readable tables.

do $$
begin
  if to_regclass('public.airports') is not null then
    alter table public.airports enable row level security;

    grant select on public.airports to anon, authenticated;
    revoke insert, update, delete on public.airports from anon, authenticated;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'airports'
        and policyname = 'phase1_airports_read_active'
    ) then
      create policy phase1_airports_read_active
        on public.airports
        for select
        to anon, authenticated
        using (is_active is true);
    end if;
  end if;

  if to_regclass('public.parking_lots') is not null then
    alter table public.parking_lots enable row level security;

    grant select on public.parking_lots to anon, authenticated;
    revoke insert, update, delete on public.parking_lots from anon, authenticated;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'parking_lots'
        and policyname = 'phase1_parking_lots_read_public'
    ) then
      create policy phase1_parking_lots_read_public
        on public.parking_lots
        for select
        to anon, authenticated
        using (true);
    end if;
  end if;

  if to_regclass('public.parking_price_snapshots') is not null then
    alter table public.parking_price_snapshots enable row level security;

    grant select on public.parking_price_snapshots to anon, authenticated;
    revoke insert, update, delete on public.parking_price_snapshots from anon, authenticated;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'parking_price_snapshots'
        and policyname = 'phase1_parking_price_snapshots_read_public'
    ) then
      create policy phase1_parking_price_snapshots_read_public
        on public.parking_price_snapshots
        for select
        to anon, authenticated
        using (true);
    end if;
  end if;

  if to_regclass('public.parking_lot_google_place_snapshots') is not null then
    alter table public.parking_lot_google_place_snapshots enable row level security;

    grant select on public.parking_lot_google_place_snapshots to anon, authenticated;
    revoke insert, update, delete on public.parking_lot_google_place_snapshots from anon, authenticated;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'parking_lot_google_place_snapshots'
        and policyname = 'phase1_parking_google_place_snapshots_read_public'
    ) then
      create policy phase1_parking_google_place_snapshots_read_public
        on public.parking_lot_google_place_snapshots
        for select
        to anon, authenticated
        using (true);
    end if;
  end if;
end $$;
