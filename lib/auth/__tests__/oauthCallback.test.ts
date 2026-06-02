import type { SupabaseClient } from '@supabase/supabase-js';
import {
  handleOAuthCallback,
  normalizeRedirectParam,
  oauthCallbackErrorPath,
  waitForOAuthSession,
} from '../oauthCallback';

function createMockClient(options: {
  exchangeError?: Error | null;
  initialSession?: { user: { id: string } } | null;
  delayedSession?: { user: { id: string } } | null;
  getSessionCalls?: Array<{ user: { id: string } } | null>;
}): SupabaseClient {
  let sessionIndex = 0;
  const getSessionQueue = options.getSessionCalls ?? [options.initialSession ?? null];

  const exchangeCodeForSession = jest.fn(async () => ({
    error: options.exchangeError ?? null,
  }));

  const getSession = jest.fn(async () => {
    const queued = getSessionQueue[sessionIndex];
    sessionIndex += 1;
    if (queued !== undefined) {
      return { data: { session: queued } };
    }
    return { data: { session: options.delayedSession ?? null } };
  });

  const onAuthStateChange = jest.fn((callback: (event: string, session: unknown) => void) => {
    if (options.delayedSession) {
      queueMicrotask(() => callback('SIGNED_IN', options.delayedSession));
    }

    return {
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    };
  });

  return {
    auth: {
      exchangeCodeForSession,
      getSession,
      onAuthStateChange,
    },
  } as unknown as SupabaseClient;
}

describe('handleOAuthCallback', () => {
  test('callback with code exchanges session and redirects to /account', async () => {
    const client = createMockClient({});

    const result = await handleOAuthCallback({
      code: 'oauth-code-123',
      oauthError: null,
      redirectParam: '/account',
      client,
      waitForSessionMs: 0,
      logDev: jest.fn(),
    });

    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith('oauth-code-123');
    expect(result).toEqual({ status: 'redirect', path: '/account' });
  });

  test('callback without code but existing session redirects to /account', async () => {
    const client = createMockClient({
      initialSession: { user: { id: 'user-1' } },
    });

    const result = await handleOAuthCallback({
      code: null,
      oauthError: null,
      redirectParam: '/account',
      client,
      waitForSessionMs: 0,
      logDev: jest.fn(),
    });

    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'redirect', path: '/account' });
  });

  test('callback without code and no session returns missing_code', async () => {
    const client = createMockClient({
      getSessionCalls: [null, null],
    });

    const result = await handleOAuthCallback({
      code: null,
      oauthError: null,
      redirectParam: '/account',
      client,
      waitForSessionMs: 0,
      logDev: jest.fn(),
    });

    expect(result).toEqual({ status: 'error', code: 'missing_code' });
    expect(oauthCallbackErrorPath('missing_code')).toBe('/login?auth_error=missing_code');
  });

  test('redirect param preserves /account and decodes once-encoded values', () => {
    expect(normalizeRedirectParam('/account')).toBe('/account');
    expect(normalizeRedirectParam('%2Faccount')).toBe('/account');
  });

  test('waitForOAuthSession resolves after auth state change when hash session arrives late', async () => {
    const client = createMockClient({
      initialSession: null,
      delayedSession: { user: { id: 'user-2' } },
    });

    const session = await waitForOAuthSession(client, 0);

    expect(session).toEqual({ user: { id: 'user-2' } });
  });
});
