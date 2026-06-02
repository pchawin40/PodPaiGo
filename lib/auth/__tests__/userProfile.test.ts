import type { User } from '@supabase/supabase-js';
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../userProfile';

describe('userProfile helpers', () => {
  const googleUser = {
    email: 'traveler@example.com',
    user_metadata: {
      full_name: 'Alex Traveler',
      picture: 'https://example.com/avatar.jpg',
    },
  } as User;

  test('reads Google avatar from picture metadata', () => {
    expect(getUserAvatarUrl(googleUser)).toBe('https://example.com/avatar.jpg');
  });

  test('prefers avatar_url over picture when both exist', () => {
    const user = {
      email: 'traveler@example.com',
      user_metadata: {
        avatar_url: 'https://example.com/primary.jpg',
        picture: 'https://example.com/fallback.jpg',
      },
    } as User;

    expect(getUserAvatarUrl(user)).toBe('https://example.com/primary.jpg');
  });

  test('builds initials from display name', () => {
    expect(getUserInitials(googleUser)).toBe('AT');
  });

  test('falls back to email initials when no display name exists', () => {
    const user = {
      email: 'traveler@example.com',
      user_metadata: {},
    } as User;

    expect(getUserDisplayName(user)).toBeNull();
    expect(getUserInitials(user)).toBe('TR');
  });
});
