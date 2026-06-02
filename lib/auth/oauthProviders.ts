import type { Provider } from '@supabase/supabase-js';

export type SupportedOAuthProviderId = 'google';

export type OAuthProviderConfig = {
  id: SupportedOAuthProviderId;
  label: string;
  supabaseProvider: Provider;
  enabled: boolean;
};

export const OAUTH_PROVIDERS: OAuthProviderConfig[] = [
  {
    id: 'google',
    label: 'Continue with Google',
    supabaseProvider: 'google',
    enabled: true,
  },
  // Future providers: set enabled: true when Supabase provider is configured.
  // {
  //   id: 'apple',
  //   label: 'Continue with Apple',
  //   supabaseProvider: 'apple',
  //   enabled: false,
  // },
  // {
  //   id: 'azure',
  //   label: 'Continue with Microsoft',
  //   supabaseProvider: 'azure',
  //   enabled: false,
  // },
];

export const ENABLED_OAUTH_PROVIDERS = OAUTH_PROVIDERS.filter((provider) => provider.enabled);

export function getOAuthProviderConfig(
  providerId: SupportedOAuthProviderId,
): OAuthProviderConfig | undefined {
  return OAUTH_PROVIDERS.find((provider) => provider.id === providerId);
}
