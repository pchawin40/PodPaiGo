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
  reserveLabel?: string;
  viewProviderLabel?: string;
  /** Info-only official links open Port pages but should not say "Reserve parking". */
  infoOnlyBooking?: boolean;
}): ParkingMonetizationCtas {
  const bookingUrl = input.bookingUrl?.trim() || null;
  const providerUrl = input.providerUrl?.trim() || bookingUrl;
  const directionsUrl = input.directionsUrl?.trim() || null;
  const reserveLabel =
    input.reserveLabel ||
    (bookingUrl ? 'Reserve parking' : 'Booking unavailable');
  const viewProviderLabel =
    input.viewProviderLabel ||
    (input.infoOnlyBooking ? 'Check official parking' : 'View provider');

  return {
    reserveLabel,
    reserveUrl: bookingUrl,
    reserveEnabled: Boolean(bookingUrl),
    viewProviderLabel,
    viewProviderUrl: providerUrl,
    viewProviderEnabled: Boolean(providerUrl && !bookingUrl),
    directionsLabel: 'Route to parking',
    directionsUrl,
    directionsEnabled: Boolean(directionsUrl),
  };
}
