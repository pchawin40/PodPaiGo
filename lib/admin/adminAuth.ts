/**
 * Admin access is determined by email allowlist (ADMIN_EMAILS).
 * Comma-separated, case-insensitive. Example: admin@example.com,ops@example.com
 */
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(
  email: string | null | undefined,
  allowlist: string[] = getAdminEmails(),
): boolean {
  if (!email?.trim()) return false;
  const normalized = email.trim().toLowerCase();
  return allowlist.includes(normalized);
}
