import type { ParkingOption } from '../../../../types';
import { getGoogleMapsServerApiKey } from '../../../../env/googleMapsServerKey';
import { dedupeParkingOptions } from '../../shared/dedupe';
import { withAvailabilityScore } from '../../shared/availability';
import { googleMapsSearchUrl, googlePlacePhotoImageUrl } from '../../shared/urls';

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  googleMapsUri?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  photos?: Array<{
    name?: string;
    widthPx?: number;
    heightPx?: number;
  }>;
};

function scoreGoogleParkingOption(p: ParkingOption): number {
  const reviewScore = p.reviewScore ?? 0;
  const reviewCount = p.reviewCount ?? 0;
  const transferMinutes = p.shuttleMinutes ?? p.walkingMinutes ?? p.transferToTerminalMinutes ?? 15;
  const estimatedPrice = p.price ?? 40;
  const availabilityScore = p.availabilityScore ?? p.availability ?? 50;

  return (
    reviewScore * 20 +
    Math.min(reviewCount / 100, 30) +
    availabilityScore * 0.15 -
    transferMinutes -
    estimatedPrice * 0.25
  );
}

export async function getDestinationParkingOptions(args: {
  origin: string;
  destination: string;
  dateTime: string;
  parkingDurationMinutes?: number;
}): Promise<ParkingOption[]> {
  const key = getGoogleMapsServerApiKey();

  if (!key) return [];

  const searchRadiusMeters = Number(
    process.env.DESTINATION_PARKING_SEARCH_RADIUS_METERS || 2500,
  );

  const maxResults = Number(
    process.env.DESTINATION_PARKING_MAX_RESULTS || 20,
  );

  const searchQueries = [
    `parking near ${args.destination}`,
    `parking garage near ${args.destination}`,
    `public parking near ${args.destination}`,
  ];

  async function fetchPlacesForQuery(textQuery: string): Promise<GooglePlace[]> {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key!,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.googleMapsUri',
          'places.rating',
          'places.userRatingCount',
          'places.businessStatus',
          'places.location',
          'places.photos',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery,
        locationBias: {
          circle: {
            center: {
              latitude: 47.6062,
              longitude: -122.3321,
            },
            radius: searchRadiusMeters,
          },
        },
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data.places) ? data.places : [];
  }

  const placesByQuery = await Promise.all(
    searchQueries.map((query) => fetchPlacesForQuery(query)),
  );

  const places = placesByQuery.flat();

  const mapped = places
    .filter((place: GooglePlace) => {
      const name = String(place.displayName?.text || '').toLowerCase();
      const address = String(place.formattedAddress || '').toLowerCase();

      const looksLikeParking =
        name.includes('parking') ||
        name.includes('garage') ||
        name.includes('lot') ||
        address.includes('parking');

      if (!looksLikeParking) return false;
      if (place.businessStatus === 'CLOSED_PERMANENTLY') return false;

      return true;
    })
    .slice(0, maxResults)
    .map((place: GooglePlace): ParkingOption => {
      const name = place.displayName?.text || 'Parking near destination';
      const lowerName = name.toLowerCase();

      const isGarage =
        lowerName.includes('garage') ||
        lowerName.includes('covered');

      const isParkAndRide =
        lowerName.includes('park & ride') ||
        lowerName.includes('park and ride') ||
        lowerName.includes('station parking');

      const imageUrl = googlePlacePhotoImageUrl(place.photos?.[0]?.name);
      const routeDestination = place.formattedAddress || name;

      const rating =
        typeof place.rating === 'number' ? place.rating : undefined;

      const reviewCount =
        typeof place.userRatingCount === 'number'
          ? place.userRatingCount
          : undefined;

      const option: ParkingOption = {
        id: `destination-google-${place.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        type: isParkAndRide ? 'park-and-ride' : 'off-airport',
        price: isGarage ? 4 : 3,
        priceDisplay: 'estimated',
        priceUnit: 'per-hour',
        priceNote:
          'Estimated hourly parking. Open Google Maps or provider page to confirm live rate, hours, and availability.',
        priceSource: 'estimated',
        priceConfidence: 'low',
        availabilityStatus: 'unknown',
        isAvailable: true,
        availability: 50,
        availabilityScore: 50,
        trustStatus: 'estimated',
        sourceName: 'Google Places',
        sourceLink: place.googleMapsUri || googleMapsSearchUrl(routeDestination),
        mapLink: googleMapsSearchUrl(routeDestination),
        googlePlaceId: place.id,
        googleMapsUri: place.googleMapsUri,
        address: place.formattedAddress,
        normalizedAddress: place.formattedAddress,
        imageUrl,
        images: imageUrl ? [imageUrl] : undefined,
        lat: place.location?.latitude,
        lng: place.location?.longitude,
        routeDestination,
        routeUnavailable: false,
        distance: 10,
        parkingBufferMinutes: 8,
        transferToTerminalMinutes: isParkAndRide ? 25 : 8,
        transferType: isParkAndRide ? 'transit' : 'walk',
        walkingMinutes: isParkAndRide ? 10 : 8,
        shuttleMinutes: undefined,
        covered: isGarage,
        reviewScore: rating,
        reviewCount,
        searchQuery: searchQueries.join(' | '),
        lastUpdated: new Date().toISOString(),
        assumptions: [
          'Discovered from Google Places near the destination.',
          'Hourly price is estimated because live destination parking pricing is not connected yet.',
          'Open Google Maps/provider page to confirm live rate, garage hours, entrance, and availability.',
          isParkAndRide
            ? 'Park & Ride rules vary. Do not assume overnight parking unless verified.'
            : 'Walking time to final destination is estimated.',
        ].filter(Boolean),
        bestFor: [
          rating && rating >= 4.4 ? 'Best Reviews' : '',
          isGarage ? 'Covered' : '',
          isParkAndRide ? 'Park & Ride' : 'Destination Parking',
        ].filter(Boolean),
        providerSource: 'google',
        fetchedAt: new Date().toISOString(),
        priceFreshness: 'estimated',
      };

      return withAvailabilityScore(option);
    });

  return dedupeParkingOptions(mapped)
    .sort((a, b) => scoreGoogleParkingOption(b) - scoreGoogleParkingOption(a))
    .slice(0, maxResults);
}
