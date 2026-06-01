export function getGoogleMapsServerApiKey(): string | undefined {
  const key =
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;

  const trimmed = key?.trim();
  return trimmed || undefined;
}
