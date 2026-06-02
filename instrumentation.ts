export async function register() {
  const { logGooglePlacesConfig } = await import('./lib/parking/googlePlacesConfig');
  logGooglePlacesConfig('startup');
}
