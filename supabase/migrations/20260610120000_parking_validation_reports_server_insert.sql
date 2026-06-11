-- Parking validation reports are submitted through /api/parking/validation-report.
-- The API route validates/sanitizes safe columns and inserts with the server-side
-- Supabase service role. Do not expose direct public table writes.

drop policy if exists parking_validation_reports_insert_authenticated on public.parking_validation_reports;
drop policy if exists parking_validation_reports_insert_anonymous on public.parking_validation_reports;

revoke insert on public.parking_validation_reports from anon;
revoke insert on public.parking_validation_reports from authenticated;

comment on table public.parking_validation_reports is
  'Parking validation reports. Inserts are server-side only through the validated API route using service role; clients cannot write directly.';
