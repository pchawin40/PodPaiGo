import type { User } from '@supabase/supabase-js';

function readMetadataString(user: User, key: string): string | null {
  const value = user.user_metadata?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function getUserAvatarUrl(user: User): string | null {
  return readMetadataString(user, 'avatar_url') ?? readMetadataString(user, 'picture');
}

export function getUserDisplayName(user: User): string | null {
  return (
    readMetadataString(user, 'display_name') ??
    readMetadataString(user, 'full_name') ??
    readMetadataString(user, 'name')
  );
}

export function getUserInitials(user: User): string {
  const displayName = getUserDisplayName(user);
  if (displayName) {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }

  const email = user.email?.trim();
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }

  return '?';
}
