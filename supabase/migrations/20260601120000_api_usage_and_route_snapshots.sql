-- Route quote snapshots for cache-first Google Routes usage.

create table if not exists route_quote_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  origin_hash text not null,
  destination_hash text not null,
  airport_code text,
  lot_id text,
  departure_bucket timestamptz,
  travel_minutes integer not null,
  distance_miles numeric,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists route_quote_snapshots_lookup_idx
  on route_quote_snapshots (origin_hash, destination_hash, airport_code, lot_id, departure_bucket, expires_at desc);

create index if not exists route_quote_snapshots_expires_at_idx
  on route_quote_snapshots (expires_at desc);

-- Aggregated API usage counters for budget enforcement.

create table if not exists api_usage_counters (
  provider text not null,
  period_type text not null check (period_type in ('daily', 'monthly')),
  period_key text not null,
  request_count integer not null default 0,
  estimated_cost numeric(12, 6) not null default 0,
  last_request_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (provider, period_type, period_key)
);

create index if not exists api_usage_counters_provider_period_idx
  on api_usage_counters (provider, period_type, period_key);
