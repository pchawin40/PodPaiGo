const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'Google sign-in did not complete. Please try again or use email and password.',
  not_configured: 'Sign-in is temporarily unavailable. Please try again later.',
  missing_code: 'Sign-in did not complete. Please try again.',
};

export function getFriendlyOAuthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return OAUTH_ERROR_MESSAGES[code] ?? OAUTH_ERROR_MESSAGES.oauth_failed;
}
