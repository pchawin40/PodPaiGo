import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
  __dirname,
  '../supabase/migrations/20260607140000_destination_parking_notes.sql',
);

describe('destination parking notes migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  test('creates generic destination_parking_notes table with requested fields', () => {
    expect(sql).toContain('create table if not exists public.destination_parking_notes');
    expect(sql).toContain("check (scope in ('place', 'neighborhood', 'city', 'venue_type'))");
    expect(sql).toContain('place_id text');
    expect(sql).toContain('name_pattern text');
    expect(sql).toContain('radius_miles numeric');
    expect(sql).toContain('parking_kind text not null');
    expect(sql).toContain('cost_expectation text not null');
    expect(sql).toContain('source_label text');
    expect(sql).toContain('source_url text');
    expect(sql).toContain('note text not null');
  });

  test('enables public read RLS without public writes', () => {
    expect(sql).toContain('alter table public.destination_parking_notes enable row level security');
    expect(sql).toContain('destination_parking_notes_read_public');
    expect(sql).toContain('grant select on public.destination_parking_notes to anon, authenticated');
    expect(sql).not.toContain('grant insert on public.destination_parking_notes');
  });
});
