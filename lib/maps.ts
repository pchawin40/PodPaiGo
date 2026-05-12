export type GoogleMapsDirectionsLinkOptions = {
  originPlaceId?: string;
  destinationPlaceId?: string;
};

export function googleMapsDirectionsLink(
  origin: string,
  destination: string,
  travelMode = 'driving',
  options: GoogleMapsDirectionsLinkOptions = {}
): string {
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: travelMode,
  });

  if (options.originPlaceId) {
    params.set('origin_place_id', options.originPlaceId);
  }

  if (options.destinationPlaceId) {
    params.set('destination_place_id', options.destinationPlaceId);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function googleMapsSearchLink(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
