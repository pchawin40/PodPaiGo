import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
  __dirname,
  '../supabase/migrations/20260605120000_parking_lot_photos.sql',
);

describe('parking lot photos migration', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  test('creates parking_lot_photos with compliant source check', () => {
    expect(sql).toContain('create table if not exists public.parking_lot_photos');
    expect(sql).toContain("check (source in ('first_party', 'partner', 'provider', 'google_live_placeholder'))");
    expect(sql).toContain('Google Places photo bytes and long-term Google media URLs must NOT be stored here');
  });

  test('enables public read RLS and indexes lookup columns', () => {
    expect(sql).toContain('parking_lot_photos_read_public');
    expect(sql).toContain('parking_lot_photos_airport_code_idx');
    expect(sql).toContain('parking_lot_photos_google_place_id_idx');
    expect(sql).toContain('parking_lot_photos_provider_lot_idx');
  });
});
