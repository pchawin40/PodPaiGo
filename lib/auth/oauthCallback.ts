import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { sanitizeAuthRedirect } from './oauthSignIn';

export type OAuthCallbackErrorCode = 'oauth_failed' | 'missing_code' | 'not_configured';

export type OAuthCallbackResult =
  | { status: 'redirect'; path: string }
  | { status: 'error'; code: OAuthCallbackErrorCode };

export type OAuthCallbackInput = {
  code: string | null;
  oauthError: string | null;
  redirectParam: string | null;
  client: SupabaseClient | null;
  waitForSessionMs?: number;
  logDev?: (event: string, data?: Record<string, unknown>) => void;
};

export function logOAuthCallbackDev(event: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'production') return;
  console.info(`[oauth-callback] ${event}`, data ?? {});
}

export function normalizeRedirectParam(path: string | null | undefined): string {
  return sanitizeAuthRedirect(path);
}

async function readSession(client: SupabaseClient): Promise<Session | null> {
  const { data } = await client.auth.getSession();
  return data.session ?? null;
}

export async function waitForOAuthSession(
  client: SupabaseClient,
  waitForSessionMs = 1500,
): Promise<Session | null> {
  const immediateSession = await readSession(client);
  if (immediateSession) {
    return immediateSession;
  }

  return new Promise((resolve) => {
    let settled = false;
    let authSubscription: { unsubscribe: () => void } | null = null;

    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      authSubscription?.unsubscribe();
      resolve(session);
    };

    const timeoutId = setTimeout(async () => {
      finish(await readSession(client));
    }, waitForSessionMs);

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')
      ) {
        finish(session);
      }
    });
    authSubscription = data.subscription;
  });
}

export async function handleOAuthCallback(input: OAuthCallbackInput): Promise<OAuthCallbackResult> {
  const logDev = input.logDev ?? logOAuthCallbackDev;
  const redirect = normalizeRedirectParam(input.redirectParam);

  logDev('callback_redirect_target', { redirect });

  if (input.oauthError) {
    return { status: 'error', code: 'oauth_failed' };
  }

  if (!input.client) {
    return { status: 'error', code: 'not_configured' };
  }

  logDev('callback_has_code', { hasCode: Boolean(input.code) });

  if (input.code) {
    const { error } = await input.client.auth.exchangeCodeForSession(input.code);
    if (error) {
      return { status: 'error', code: 'oauth_failed' };
    }

    logDev('callback_has_session', { hasSession: true, source: 'code_exchange' });
    return { status: 'redirect', path: redirect };
  }

  const session = await waitForOAuthSession(input.client, input.waitForSessionMs ?? 1500);
  logDev('callback_has_session', { hasSession: Boolean(session), source: 'session_lookup' });

  if (session) {
    return { status: 'redirect', path: redirect };
  }

  return { status: 'error', code: 'missing_code' };
}

export function oauthCallbackErrorPath(code: OAuthCallbackErrorCode): string {
  return `/login?auth_error=${code}`;
}
