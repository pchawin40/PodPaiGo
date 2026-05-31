export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function googleMapsDirectionsUrl(origin: string, destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
}

export function googlePlacePhotoImageUrl(photoName?: string | null): string | undefined {
  const name = photoName?.trim();
  if (!name) return undefined;

  return `/api/google-place-photo?name=${encodeURIComponent(name)}&maxWidthPx=900`;
}
