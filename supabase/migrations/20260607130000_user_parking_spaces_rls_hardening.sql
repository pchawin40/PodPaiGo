-- Hardening follow-up for public.user_parking_spaces RLS.
--
-- The base migration (20260607120000_user_parking_spaces.sql) originally allowed
-- authenticated owners to insert/update their rows with only `user_id = auth.uid()`.
-- Because the Supabase anon key is public, a signed-in client could directly set
-- status = 'verified' (or otherwise tamper with moderation columns) and make a
-- submission public. The base migration has been tightened in place; this follow-up
-- re-applies the same tightened policies idempotently for any environment where the
-- original (weaker) version was already applied locally.
--
-- Admin verify/reject/needs_more_info remains server-side only via the Supabase
-- service role (ADMIN_EMAILS-gated API). No admin DB role/policy is introduced.

alter table public.user_parking_spaces enable row level security;

-- Select: public (anon + signed-in) may read only verified rows.
drop policy if exists user_parking_spaces_select_verified on public.user_parking_spaces;
create policy user_parking_spaces_select_verified
  on public.user_parking_spaces
  for select
  to anon, authenticated
  using (status = 'verified');

-- Select: owners may read all of their own rows (any status).
drop policy if exists user_parking_spaces_select_own on public.user_parking_spaces;
create policy user_parking_spaces_select_own
  on public.user_parking_spaces
  for select
  to authenticated
  using (user_id = auth.uid());

-- Insert: owner-only, and only as a safe unverified, free, user-submitted row.
drop policy if exists user_parking_spaces_insert_own on public.user_parking_spaces;
create policy user_parking_spaces_insert_own
  on public.user_parking_spaces
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and is_free = true
    and price = 0
    and source = 'user-submitted'
    and verified_by is null
    and verified_at is null
    and rejection_reason is null
  );

-- Update: owner may edit only still-editable rows, and the result must remain an
-- unverified, free, user-submitted submission (cannot self-verify).
drop policy if exists user_parking_spaces_update_own on public.user_parking_spaces;
create policy user_parking_spaces_update_own
  on public.user_parking_spaces
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and status in ('pending', 'needs_more_info')
  )
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and is_free = true
    and price = 0
    and source = 'user-submitted'
    and verified_by is null
    and verified_at is null
    and rejection_reason is null
  );

-- Delete: owner may delete only still-editable rows.
drop policy if exists user_parking_spaces_delete_own on public.user_parking_spaces;
create policy user_parking_spaces_delete_own
  on public.user_parking_spaces
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and status in ('pending', 'needs_more_info')
  );
