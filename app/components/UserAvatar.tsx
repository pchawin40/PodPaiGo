import type { User } from '@supabase/supabase-js';
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../../lib/auth/userProfile';

type UserAvatarProps = {
  user: User;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-lg',
};

export default function UserAvatar({ user, size = 'sm', className = '' }: UserAvatarProps) {
  const avatarUrl = getUserAvatarUrl(user);
  const initials = getUserInitials(user);
  const displayName = getUserDisplayName(user) ?? user.email ?? 'Account';

  return avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt={displayName}
      referrerPolicy="no-referrer"
      className={`rounded-full object-cover ring-2 ring-white ${sizeClasses[size]} ${className}`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-full bg-blue-600 font-semibold text-white ring-2 ring-white ${sizeClasses[size]} ${className}`}
    >
      {initials}
    </span>
  );
}
