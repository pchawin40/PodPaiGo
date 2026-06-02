-- Monetization outbound click tracking + AI usage logging.

create extension if not exists pgcrypto;

create table if not exists public.outbound_click_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  provider text,
  airport_code text,
  parking_lot_id text,
  destination_url text,
  trip_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists outbound_click_events_created_at_idx
  on public.outbound_click_events (created_at desc);

create index if not exists outbound_click_events_user_id_created_at_idx
  on public.outbound_click_events (user_id, created_at desc)
  where user_id is not null;

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  provider text not null,
  model text,
  input_chars integer,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_cost numeric,
  success boolean not null default true,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_created_at_idx
  on public.ai_usage_events (created_at desc);

create index if not exists ai_usage_events_user_day_idx
  on public.ai_usage_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists ai_usage_events_session_day_idx
  on public.ai_usage_events (session_id, created_at desc)
  where session_id is not null;

alter table public.outbound_click_events enable row level security;
alter table public.ai_usage_events enable row level security;

drop policy if exists outbound_click_insert_authenticated on public.outbound_click_events;
create policy outbound_click_insert_authenticated
  on public.outbound_click_events
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists outbound_click_insert_anonymous on public.outbound_click_events;
create policy outbound_click_insert_anonymous
  on public.outbound_click_events
  for insert
  to anon
  with check (user_id is null);

grant insert on public.outbound_click_events to anon, authenticated;

revoke all on public.ai_usage_events from anon, authenticated;
revoke all on public.ai_usage_events from public;
