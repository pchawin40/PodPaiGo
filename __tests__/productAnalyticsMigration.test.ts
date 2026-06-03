import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
  __dirname,
  '../supabase/migrations/20260606120000_product_analytics.sql',
);

describe('product analytics migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  test('creates analytics_events table with required columns', () => {
    expect(sql).toContain('create table if not exists public.analytics_events');
    expect(sql).toContain('anonymous_id text');
    expect(sql).toContain('session_id text');
    expect(sql).toContain('event_name text not null');
    expect(sql).toContain('event_properties jsonb');
  });

  test('creates indexes and RLS without user read policies', () => {
    expect(sql).toContain('analytics_events_event_name_created_at_idx');
    expect(sql).toContain('analytics_events_user_id_created_at_idx');
    expect(sql).toContain('analytics_events_anonymous_id_created_at_idx');
    expect(sql).toContain('analytics_events_created_at_idx');
    expect(sql).toContain('enable row level security');
    expect(sql).not.toMatch(/for select/i);
    expect(sql).toContain('analytics_events_insert_anon');
    expect(sql).toContain('revoke select, update, delete');
  });
});
