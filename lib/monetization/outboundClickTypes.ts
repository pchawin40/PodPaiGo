export const AFFILIATE_DISCLOSURE =
  'Some links may become partner links. Prices and availability are controlled by the provider.';

export type OutboundClickPayload = {
  eventType: string;
  provider?: string | null;
  airportCode?: string | null;
  parkingLotId?: string | null;
  destinationUrl?: string | null;
  tripId?: string | null;
  metadata?: Record<string, unknown>;
};

export type ParkingMonetizationCtas = {
  reserveLabel: string;
  reserveUrl: string | null;
  reserveEnabled: boolean;
  viewProviderLabel: string;
  viewProviderUrl: string | null;
  viewProviderEnabled: boolean;
  directionsLabel: string;
  directionsUrl: string | null;
  directionsEnabled: boolean;
};

export function buildParkingMonetizationCtas(input: {
  bookingUrl: string | null;
  providerUrl?: string | null;
  directionsUrl?: string | null;
}): ParkingMonetizationCtas {
  const bookingUrl = input.bookingUrl?.trim() || null;
  const providerUrl = input.providerUrl?.trim() || bookingUrl;
  const directionsUrl = input.directionsUrl?.trim() || null;

  return {
    reserveLabel: bookingUrl ? 'Reserve parking' : 'Booking unavailable',
    reserveUrl: bookingUrl,
    reserveEnabled: Boolean(bookingUrl),
    viewProviderLabel: 'View provider',
    viewProviderUrl: providerUrl,
    viewProviderEnabled: Boolean(providerUrl),
    directionsLabel: 'Get directions',
    directionsUrl,
    directionsEnabled: Boolean(directionsUrl),
  };
}
