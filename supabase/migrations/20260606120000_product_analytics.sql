-- Privacy-conscious product analytics events.
-- Inserts are performed by the Next.js server API; end users cannot read rows.

create extension if not exists pgcrypto;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text,
  session_id text,
  event_name text not null,
  event_properties jsonb not null default '{}'::jsonb,
  page_path text,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_name_created_at_idx
  on public.analytics_events (event_name, created_at desc);

create index if not exists analytics_events_user_id_created_at_idx
  on public.analytics_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists analytics_events_anonymous_id_created_at_idx
  on public.analytics_events (anonymous_id, created_at desc)
  where anonymous_id is not null;

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

alter table public.analytics_events enable row level security;

-- No SELECT/UPDATE/DELETE policies for anon or authenticated: users cannot read analytics.
-- Admin dashboards must query via service role on the server only.

drop policy if exists analytics_events_insert_anon on public.analytics_events;
create policy analytics_events_insert_anon
  on public.analytics_events
  for insert
  to anon
  with check (user_id is null);

drop policy if exists analytics_events_insert_authenticated on public.analytics_events;
create policy analytics_events_insert_authenticated
  on public.analytics_events
  for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());

grant insert on public.analytics_events to anon, authenticated;
revoke select, update, delete on public.analytics_events from anon, authenticated, public;

comment on table public.analytics_events is
  'Product analytics events. Readable only by admins via server-side service role; not exposed to clients.';
