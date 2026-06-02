'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  handleOAuthCallback,
  logOAuthCallbackDev,
  oauthCallbackErrorPath,
} from '../../../lib/auth/oauthCallback';
import { getSupabaseClient } from '../../../lib/supabase/client';

export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Completing sign-in…');

  useEffect(() => {
    let active = true;

    async function completeOAuthSignIn() {
      const client = getSupabaseClient();
      const result = await handleOAuthCallback({
        code: searchParams.get('code'),
        oauthError:
          searchParams.get('error') ||
          searchParams.get('error_description') ||
          searchParams.get('error_code'),
        redirectParam: searchParams.get('redirect'),
        client,
        logDev: logOAuthCallbackDev,
      });

      if (!active) return;

      if (result.status === 'redirect') {
        router.replace(result.path);
        router.refresh();
        return;
      }

      router.replace(oauthCallbackErrorPath(result.code));
    }

    void completeOAuthSignIn().catch(() => {
      if (!active) return;
      setMessage('Sign-in failed. Redirecting…');
      router.replace(oauthCallbackErrorPath('oauth_failed'));
    });

    return () => {
      active = false;
    };
  }, [router, searchParams]);

  return (
    <main className="airport-page-bg flex min-h-screen items-center justify-center px-4">
      <div className="rounded-3xl border border-sky-100 bg-white px-6 py-8 text-center shadow-[0_18px_60px_rgba(14,116,144,0.12)]">
        <p className="text-sm font-medium text-slate-700">{message}</p>
      </div>
    </main>
  );
}
