'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getFriendlyOAuthErrorMessage } from '../../lib/auth/oauthErrors';
import { useAuth } from './AuthProvider';
import OAuthProviderButtons from './OAuthProviderButtons';

type AuthMode = 'sign-in' | 'sign-up';

export default function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, signIn, signUp } = useAuth();

  const redirectTo = useMemo(() => {
    const redirect = searchParams.get('redirect');
    return redirect && redirect.startsWith('/') ? redirect : '/account';
  }, [searchParams]);

  const initialMode = useMemo<AuthMode>(() => {
    const requested = searchParams.get('mode');
    return requested === 'register' || requested === 'sign-up' ? 'sign-up' : 'sign-in';
  }, [searchParams]);

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const authError = searchParams.get('auth_error');
    const friendlyError = getFriendlyOAuthErrorMessage(authError);
    if (friendlyError) {
      setError(friendlyError);
    }
  }, [searchParams]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    try {
      if (mode === 'sign-in') {
        const result = await signIn(email.trim(), password);
        if (result.error) {
          setError(result.error);
          return;
        }

        router.push(redirectTo);
        router.refresh();
        return;
      }

      const result = await signUp(email.trim(), password, displayName);
      if (result.error) {
        setError(result.error);
        return;
      }

      setMessage('Account created. Check your email if confirmation is required, then sign in.');
      setMode('sign-in');
    } finally {
      setSubmitting(false);
    }
  };

  if (!configured) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        Supabase auth is not configured. Add{' '}
        <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
        <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and{' '}
        <code className="rounded bg-white px-1">NEXT_PUBLIC_SITE_URL</code> to your env.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-sky-100 bg-white p-6 shadow-[0_18px_60px_rgba(14,116,144,0.12)]">
      <div className="mb-6 flex gap-2 rounded-full border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setMode('sign-in')}
          className={
            'flex-1 rounded-full px-4 py-2 text-sm font-semibold ' +
            (mode === 'sign-in' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600')
          }
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode('sign-up')}
          className={
            'flex-1 rounded-full px-4 py-2 text-sm font-semibold ' +
            (mode === 'sign-up' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600')
          }
        >
          Sign up
        </button>
      </div>

      <OAuthProviderButtons redirectTo={redirectTo} />

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          or use email
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'sign-up' ? (
          <label className="block text-sm font-medium text-slate-700">
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-950"
              placeholder="Optional"
              autoComplete="name"
            />
          </label>
        ) : null}

        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-950"
            autoComplete="email"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-950"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/" className="font-medium text-blue-600 hover:text-blue-700">
          Back to home
        </Link>
      </p>
    </div>
  );
}
