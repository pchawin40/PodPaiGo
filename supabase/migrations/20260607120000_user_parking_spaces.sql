-- User-submitted free parking spaces with moderation workflow.
-- Signed-in users submit (status = 'pending'); only 'verified' rows are public.
-- Admin verification happens server-side via the service role (no admin DB role).

create extension if not exists pgcrypto;

create table if not exists public.user_parking_spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text not null,
  lat double precision,
  lng double precision,
  google_place_id text,
  parking_type text not null default 'free'
    check (parking_type in (
      'free',
      'customer_only',
      'time_limited_free',
      'street_free',
      'retail_free',
      'event_free',
      'unknown'
    )),
  price numeric not null default 0,
  is_free boolean not null default true,
  time_limit_minutes integer,
  overnight_allowed boolean,
  validation_required boolean not null default false,
  business_name text,
  lot_rules text,
  notes text,
  evidence_url text,
  source text not null default 'user-submitted',
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'needs_more_info')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_parking_spaces_user_id_created_at_idx
  on public.user_parking_spaces (user_id, created_at desc);

create index if not exists user_parking_spaces_status_idx
  on public.user_parking_spaces (status);

-- Proximity lookups for the community free-parking provider scan verified rows.
create index if not exists user_parking_spaces_verified_geo_idx
  on public.user_parking_spaces (status, lat, lng)
  where status = 'verified';

create or replace function public.set_user_parking_spaces_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_parking_spaces_set_updated_at on public.user_parking_spaces;
create trigger user_parking_spaces_set_updated_at
  before update on public.user_parking_spaces
  for each row
  execute function public.set_user_parking_spaces_updated_at();

alter table public.user_parking_spaces enable row level security;

-- Public (anon + signed-in) can read only verified rows.
drop policy if exists user_parking_spaces_select_verified on public.user_parking_spaces;
create policy user_parking_spaces_select_verified
  on public.user_parking_spaces
  for select
  to anon, authenticated
  using (status = 'verified');

-- Owners can read all of their own rows (including pending/rejected/needs_more_info).
drop policy if exists user_parking_spaces_select_own on public.user_parking_spaces;
create policy user_parking_spaces_select_own
  on public.user_parking_spaces
  for select
  to authenticated
  using (user_id = auth.uid());

-- Owners can insert rows for themselves only.
drop policy if exists user_parking_spaces_insert_own on public.user_parking_spaces;
create policy user_parking_spaces_insert_own
  on public.user_parking_spaces
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Owners can edit their own rows only.
drop policy if exists user_parking_spaces_update_own on public.user_parking_spaces;
create policy user_parking_spaces_update_own
  on public.user_parking_spaces
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Owners can delete their own rows only.
drop policy if exists user_parking_spaces_delete_own on public.user_parking_spaces;
create policy user_parking_spaces_delete_own
  on public.user_parking_spaces
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select on public.user_parking_spaces to anon, authenticated;
grant insert, update, delete on public.user_parking_spaces to authenticated;

-- NOTE: Admin verify/reject/needs_more_info is performed server-side with the
-- Supabase service role (SUPABASE_SERVICE_ROLE_KEY), which bypasses RLS. There is
-- intentionally no admin DB role here; admin access is gated by ADMIN_EMAILS in the API.
