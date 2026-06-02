import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
  __dirname,
  '../supabase/migrations/20260603120000_monetization_and_ai_usage.sql',
);

describe('monetization and ai usage migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  test('creates outbound_click_events and ai_usage_events tables', () => {
    expect(sql).toContain('create table if not exists public.outbound_click_events');
    expect(sql).toContain('create table if not exists public.ai_usage_events');
  });

  test('enables RLS and outbound insert policies', () => {
    expect(sql).toContain('alter table public.outbound_click_events enable row level security');
    expect(sql).toContain('outbound_click_insert_authenticated');
    expect(sql).toContain('outbound_click_insert_anonymous');
    expect(sql).toMatch(/outbound_click_insert_anonymous[\s\S]*with check \(user_id is null\)/);
  });
});
