'use client';

import { useState } from 'react';
import { ENABLED_OAUTH_PROVIDERS, type SupportedOAuthProviderId } from '../../lib/auth/oauthProviders';
import { useAuth } from './AuthProvider';

type OAuthProviderButtonsProps = {
  redirectTo: string;
};

export default function OAuthProviderButtons({ redirectTo }: OAuthProviderButtonsProps) {
  const { signInWithOAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<SupportedOAuthProviderId | null>(null);

  const handleOAuthSignIn = async (providerId: SupportedOAuthProviderId) => {
    setError(null);
    setLoadingProvider(providerId);

    const result = await signInWithOAuth(providerId, redirectTo);
    if (result.error) {
      setError(result.error);
      setLoadingProvider(null);
    }
  };

  if (ENABLED_OAUTH_PROVIDERS.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {ENABLED_OAUTH_PROVIDERS.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => void handleOAuthSignIn(provider.id)}
          disabled={loadingProvider !== null}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
        >
          {provider.id === 'google' ? (
            <span aria-hidden="true" className="text-base leading-none">
              G
            </span>
          ) : null}
          {loadingProvider === provider.id ? 'Redirecting…' : provider.label}
        </button>
      ))}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
    </div>
  );
}
