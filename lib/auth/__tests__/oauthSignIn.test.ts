import { buildOAuthCallbackUrl, sanitizeAuthRedirect, signInWithOAuthProvider } from '../oauthSignIn';

const signInWithOAuth = jest.fn();

jest.mock('../../supabase/client', () => ({
  getSupabaseClient: jest.fn(() => ({
    auth: {
      signInWithOAuth,
    },
  })),
}));

describe('oauthSignIn helpers', () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    signInWithOAuth.mockReset();
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  test('sanitizeAuthRedirect keeps safe in-app paths only', () => {
    expect(sanitizeAuthRedirect('/account')).toBe('/account');
    expect(sanitizeAuthRedirect('/results?airport=SEA')).toBe('/results?airport=SEA');
    expect(sanitizeAuthRedirect('https://evil.example/phish')).toBe('/account');
    expect(sanitizeAuthRedirect('//evil.example/phish')).toBe('/account');
    expect(sanitizeAuthRedirect(null)).toBe('/account');
    expect(sanitizeAuthRedirect('%2Faccount')).toBe('/account');
  });

  test('buildOAuthCallbackUrl includes auth callback route and redirect param', () => {
    expect(buildOAuthCallbackUrl('/account')).toBe(
      'http://localhost:3000/auth/callback?redirect=%2Faccount',
    );
  });

  test('signInWithOAuthProvider calls Supabase with google provider and callback redirect', async () => {
    signInWithOAuth.mockResolvedValue({ error: null });

    const result = await signInWithOAuthProvider('google', '/account');

    expect(result.error).toBeNull();
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/auth/callback?redirect=%2Faccount',
      },
    });
  });

  test('signInWithOAuthProvider returns friendly error when site URL is missing', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = '';

    const result = await signInWithOAuthProvider('google', '/account');

    expect(result.error).toBe('Site URL is not configured for OAuth sign-in.');
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });
});
