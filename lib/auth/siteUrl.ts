export function getPublicSiteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) return '';
  return value.replace(/\/$/, '');
}
