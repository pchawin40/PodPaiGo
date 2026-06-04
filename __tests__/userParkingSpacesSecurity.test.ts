import fs from 'fs';
import path from 'path';

const baseMigrationPath = path.join(
  __dirname,
  '../supabase/migrations/20260607120000_user_parking_spaces.sql',
);
const hardeningMigrationPath = path.join(
  __dirname,
  '../supabase/migrations/20260607130000_user_parking_spaces_rls_hardening.sql',
);
const submissionsRoutePath = path.join(
  __dirname,
  '../app/api/parking/submissions/route.ts',
);

/** Extract a single `create policy <name> ... ;` block so assertions stay scoped. */
function policyBlock(sql: string, policyName: string): string {
  const start = sql.indexOf(`create policy ${policyName}`);
  if (start === -1) return '';
  const end = sql.indexOf(';', start);
  return sql.slice(start, end === -1 ? undefined : end).toLowerCase();
}

const PINNED_SAFE_COLUMNS = [
  "status = 'pending'",
  'is_free = true',
  'price = 0',
  "source = 'user-submitted'",
  'verified_by is null',
  'verified_at is null',
  'rejection_reason is null',
];

describe.each([
  ['base migration', baseMigrationPath],
  ['hardening migration', hardeningMigrationPath],
])('user_parking_spaces RLS — %s', (_label, migrationPath) => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  test('public select is limited to verified rows', () => {
    const block = policyBlock(sql, 'user_parking_spaces_select_verified');
    expect(block).toContain("using (status = 'verified')");
  });

  test('owner can select all their own rows', () => {
    const block = policyBlock(sql, 'user_parking_spaces_select_own');
    expect(block).toContain('using (user_id = auth.uid())');
  });

  test('insert is owner-only and forced to a safe unverified submission', () => {
    const block = policyBlock(sql, 'user_parking_spaces_insert_own');
    expect(block).toContain('user_id = auth.uid()');
    for (const clause of PINNED_SAFE_COLUMNS) {
      expect(block).toContain(clause);
    }
  });

  test('owner cannot insert a verified row (no self-verify on insert)', () => {
    const block = policyBlock(sql, 'user_parking_spaces_insert_own');
    // The only allowed status in the insert check is 'pending'.
    expect(block).not.toContain("status = 'verified'");
    expect(block).toContain("status = 'pending'");
  });

  test('owner update is restricted to editable rows and cannot self-verify', () => {
    const block = policyBlock(sql, 'user_parking_spaces_update_own');
    // USING: only pending / needs_more_info rows are editable by the owner.
    expect(block).toMatch(/using \([\s\S]*user_id = auth\.uid\(\)/);
    expect(block).toMatch(/status in \('pending', 'needs_more_info'\)/);
    // WITH CHECK: result must stay an unverified, free, user-submitted submission.
    expect(block).toMatch(/with check \([\s\S]*status = 'pending'/);
    for (const clause of PINNED_SAFE_COLUMNS) {
      expect(block).toContain(clause);
    }
    // A client must never be able to flip an updated row to verified.
    expect(block).not.toContain("status = 'verified'");
  });

  test('owner delete is restricted to editable rows', () => {
    const block = policyBlock(sql, 'user_parking_spaces_delete_own');
    expect(block).toContain('user_id = auth.uid()');
    expect(block).toMatch(/status in \('pending', 'needs_more_info'\)/);
  });

  test('no admin/public DB role policy is introduced (admin stays server-side)', () => {
    // Admin moderation runs via the service role (bypasses RLS); there should be
    // no DB policy that grants verify/update rights to a role from the client.
    expect(sql).not.toMatch(/create policy[^;]*for update[\s\S]*using \(true\)/i);
    expect(sql).not.toMatch(/to\s+service_role/i);
  });
});

describe('submissions API stays consistent with hardened RLS', () => {
  const source = fs.readFileSync(submissionsRoutePath, 'utf8');

  test('POST inserts a pending, free, user-submitted row', () => {
    expect(source).toContain("status: 'pending'");
    expect(source).toContain("source: 'user-submitted'");
    expect(source).toContain('is_free: true');
    expect(source).toContain('price: 0');
  });

  test('PATCH resets edited rows to pending and clears moderation fields', () => {
    expect(source).toContain("status: 'pending'");
    expect(source).toContain('rejection_reason: null');
    expect(source).toContain('verified_at: null');
  });

  test('mutations require a signed-in user', () => {
    expect(source).toContain('sign_in_required');
  });
});

describe('admin verification path is service-role only', () => {
  const adminServer = fs.readFileSync(
    path.join(__dirname, '../lib/parking/userParkingSpacesServer.ts'),
    'utf8',
  );
  const adminRoute = fs.readFileSync(
    path.join(__dirname, '../app/api/admin/parking-submissions/route.ts'),
    'utf8',
  );

  test('admin status update is gated by ADMIN_EMAILS', () => {
    expect(adminRoute).toContain('isAdminEmail');
    expect(adminRoute).toContain('updateUserParkingSubmissionStatus');
  });

  test('admin verify sets verified status server-side', () => {
    expect(adminServer).toContain('updateUserParkingSubmissionStatus');
    expect(adminServer).toContain('user_parking_spaces');
  });
});
