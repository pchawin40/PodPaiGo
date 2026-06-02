import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
  __dirname,
  '../supabase/migrations/20260602120000_user_auth_foundation.sql',
);

describe('user auth foundation migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  test('creates user_profiles and saved_trips tables', () => {
    expect(sql).toContain('create table if not exists public.user_profiles');
    expect(sql).toContain('create table if not exists public.saved_trips');
    expect(sql).toContain('trip_payload jsonb not null default');
  });

  test('enables RLS on user-owned tables', () => {
    expect(sql).toContain('alter table public.user_profiles enable row level security');
    expect(sql).toContain('alter table public.saved_trips enable row level security');
  });

  test('defines user_profiles policies', () => {
    expect(sql).toContain('user_profiles_select_own');
    expect(sql).toContain('user_profiles_insert_own');
    expect(sql).toContain('user_profiles_update_own');
    expect(sql).toMatch(/user_profiles_select_own[\s\S]*using \(auth\.uid\(\) = id\)/);
  });

  test('defines saved_trips policies', () => {
    expect(sql).toContain('saved_trips_select_own');
    expect(sql).toContain('saved_trips_insert_own');
    expect(sql).toContain('saved_trips_update_own');
    expect(sql).toContain('saved_trips_delete_own');
    expect(sql).toMatch(/saved_trips_insert_own[\s\S]*with check \(auth\.uid\(\) = user_id\)/);
  });
});
