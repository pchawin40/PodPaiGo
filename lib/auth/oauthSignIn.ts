import type { Provider } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase/client';
import { getPublicSiteUrl } from './siteUrl';

export function sanitizeAuthRedirect(path: string | null | undefined): string {
  if (!path) return '/account';

  let candidate = path.trim();

  if (!candidate.startsWith('/') && candidate.includes('%')) {
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded.startsWith('/') && !decoded.startsWith('//')) {
        candidate = decoded;
      }
    } catch {
      // Keep candidate; fall through to safe default below if needed.
    }
  }

  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    return candidate;
  }

  return '/account';
}

export function buildOAuthCallbackUrl(postAuthRedirect: string): string {
  const safeRedirect = sanitizeAuthRedirect(postAuthRedirect);
  const siteUrl = getPublicSiteUrl();

  if (!siteUrl) {
    throw new Error('NEXT_PUBLIC_SITE_URL is required for OAuth sign-in.');
  }

  const encodedRedirect = encodeURIComponent(safeRedirect);
  return `${siteUrl}/auth/callback?redirect=${encodedRedirect}`;
}

export async function signInWithOAuthProvider(
  provider: Provider,
  postAuthRedirect: string,
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) {
    return { error: 'Supabase auth is not configured.' };
  }

  let redirectTo: string;
  try {
    redirectTo = buildOAuthCallbackUrl(postAuthRedirect);
  } catch {
    return { error: 'Site URL is not configured for OAuth sign-in.' };
  }

  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
    },
  });

  return { error: error?.message ?? null };
}
