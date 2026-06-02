'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getOAuthProviderConfig, type SupportedOAuthProviderId } from '../../lib/auth/oauthProviders';
import { signInWithOAuthProvider } from '../../lib/auth/oauthSignIn';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase/client';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (
    providerId: SupportedOAuthProviderId,
    redirectPath: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    const client = getSupabaseClient();

    if (!client) {
      setLoading(false);
      return;
    }

    let active = true;

    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient();
    if (!client) {
      return { error: 'Supabase auth is not configured.' };
    }

    const { error } = await client.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const client = getSupabaseClient();
    if (!client) {
      return { error: 'Supabase auth is not configured.' };
    }

    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: displayName?.trim() ? { display_name: displayName.trim() } : undefined,
      },
    });

    return { error: error?.message ?? null };
  }, []);

  const signInWithOAuth = useCallback(
    async (providerId: SupportedOAuthProviderId, redirectPath: string) => {
      const provider = getOAuthProviderConfig(providerId);
      if (!provider?.enabled) {
        return { error: 'This sign-in provider is not available yet.' };
      }

      return signInWithOAuthProvider(provider.supabaseProvider, redirectPath);
    },
    [],
  );

  const signOut = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      configured,
      signIn,
      signUp,
      signInWithOAuth,
      signOut,
    }),
    [user, session, loading, configured, signIn, signUp, signInWithOAuth, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
