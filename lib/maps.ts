export function googleMapsDirectionsLink(
  origin: string,
  destination: string,
  travelMode = 'driving'
): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${encodeURIComponent(travelMode)}`;
}

export function googleMapsSearchLink(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}