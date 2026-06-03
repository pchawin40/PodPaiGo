-- Parking validation/access user feedback foundation.
-- TODO: add admin moderation UI and publish workflow for approved reports.

create extension if not exists pgcrypto;

create table if not exists public.parking_validation_reports (
  id uuid primary key default gen_random_uuid(),
  parking_lot_id text,
  lot_name text,
  airport_code text,
  destination_text text,
  user_id uuid references auth.users(id) on delete set null,
  report_type text not null,
  validation_status text,
  access_type text,
  free_minutes integer,
  validation_business text,
  badge_required boolean,
  permit_required boolean,
  visitor_allowed boolean,
  notes text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parking_validation_reports_created_at_idx
  on public.parking_validation_reports (created_at desc);

create index if not exists parking_validation_reports_user_id_created_at_idx
  on public.parking_validation_reports (user_id, created_at desc)
  where user_id is not null;

create or replace function public.set_parking_validation_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists parking_validation_reports_set_updated_at on public.parking_validation_reports;
create trigger parking_validation_reports_set_updated_at
  before update on public.parking_validation_reports
  for each row
  execute function public.set_parking_validation_reports_updated_at();

alter table public.parking_validation_reports enable row level security;

drop policy if exists parking_validation_reports_insert_authenticated on public.parking_validation_reports;
create policy parking_validation_reports_insert_authenticated
  on public.parking_validation_reports
  for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists parking_validation_reports_insert_anonymous on public.parking_validation_reports;
create policy parking_validation_reports_insert_anonymous
  on public.parking_validation_reports
  for insert
  to anon
  with check (user_id is null);

drop policy if exists parking_validation_reports_select_own on public.parking_validation_reports;
create policy parking_validation_reports_select_own
  on public.parking_validation_reports
  for select
  to authenticated
  using (user_id = auth.uid());

grant insert on public.parking_validation_reports to anon, authenticated;
grant select on public.parking_validation_reports to authenticated;

-- TODO: admin/moderation role should select and update all reports once moderation UI exists.
