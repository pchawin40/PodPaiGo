import type { ParkingOption } from '../../../../types';
import { getAirportById } from '../../../../airports/catalog';
import { resolveParkingPricing } from '../../../pricingResolver';
import { resolveDynamicParkingPrice } from '../../../dynamicParkingPricing';
import { withAvailabilityScore } from '../../shared/availability';
import { milesBetween } from '../../shared/geo';
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

function resolveLotKeyFromName(name: string): string | null {
  const lower = name.toLowerCase();

  if (lower.includes('wally')) return 'wallypark';
  if (lower.includes('masterpark') || lower.includes('master park') || lower.includes('master')) return 'masterpark';
  if (lower.includes('doug fox') || lower.includes('doug')) return 'doug fox';
  if (lower.includes('park n jet') || lower.includes('park and jet') || lower.includes('parknjet')) return 'park n jet';
  if (lower.includes('ajax')) return 'ajax';
  if (lower.includes('jiffy')) return 'jiffy';
  if (lower.includes('mvp')) return 'mvp';
  if (lower.includes('extra car')) return 'extra car';
  if (lower.includes('shuttlepark') || lower.includes('shuttle park')) return 'shuttlepark';
  if (lower.includes('seatacpark') || lower.includes('seatac park')) return 'seatacpark';

  return null;
}

export async function getGoogleParkingPlaces(args: {
  airportCode?: string;
  airportCoordinates?: { lat: number; lng: number };
  destination: string;
}): Promise<ParkingOption[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const airportCode = (args.airportCode || 'SEA').toUpperCase();
  const airport = getAirportById(airportCode);
  const airportCoordinates = args.airportCoordinates ?? airport?.geoLocation;
  const searchQueries = [
    `airport parking near ${airport?.label ?? airportCode}`,
    `cheap airport parking near ${airportCode}`,
    `off airport parking near ${airport?.label ?? airportCode}`,
    `airport parking reservations near ${airport?.label ?? airportCode}`,
    `park and ride to ${airport?.label ?? airportCode}`,
    `park and ride to ${airportCode}`,
  ];

  const parkingSearchRadiusMeters = Number(
    process.env.PARKING_SEARCH_RADIUS_METERS || 50000,
  );

  const maxParkingDistanceMiles = Number(
    process.env.PARKING_MAX_DISTANCE_MILES || 25,
  );

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
              latitude: airportCoordinates?.lat ?? 0,
              longitude: airportCoordinates?.lng ?? 0,
            },
            radius: parkingSearchRadiusMeters,
          },
        },
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data.places) ? data.places : [];
  }

  if (!key || !airportCoordinates) return [];

  const placesByQuery = await Promise.all(
    searchQueries.map((query) => fetchPlacesForQuery(query)),
  );

  const places = placesByQuery.flat();

  const mapped = await Promise.all(
    places
      .filter((place: GooglePlace) => {
        const name = String(place.displayName?.text || '').toLowerCase();

        const looksLikeParking =
          name.includes('parking') ||
          name.includes('park') ||
          name.includes('garage') ||
          name.includes('shuttle') ||
          name.includes('airport');

        if (!looksLikeParking) return false;

        const lat = place.location?.latitude;
        const lng = place.location?.longitude;

        if (typeof lat === 'number' && typeof lng === 'number') {
          const milesFromAirport = milesBetween(
            { lat: airportCoordinates.lat, lng: airportCoordinates.lng },
            { lat, lng },
          );

          if (milesFromAirport > maxParkingDistanceMiles) {
            return false;
          }
        }

        return true;
      })
      .slice(0, 40)
      .map(async (place: GooglePlace): Promise<ParkingOption> => {
        const rating = typeof place.rating === 'number' ? place.rating : undefined;
        const reviewCount = typeof place.userRatingCount === 'number' ? place.userRatingCount : undefined;

        const name = place.displayName?.text || `${airportCode} Parking`;
        const lowerName = name.toLowerCase();
        const isParkAndRide =
          lowerName.includes('park & ride') ||
          lowerName.includes('park and ride') ||
          lowerName.includes('station parking') ||
          lowerName.includes('northgate');
        const imageUrl = googlePlacePhotoImageUrl(place.photos?.[0]?.name);

        const lotKey = resolveLotKeyFromName(name);

        const staticPricing = resolveParkingPricing({
          airportCode,
          lotName: name,
        });

        const dynamicPricing = lotKey
          ? await resolveDynamicParkingPrice(lotKey)
          : null;

        const isOfficial =
          lowerName.includes(`${airportCode.toLowerCase()} parking garage`) ||
          lowerName.includes('terminal parking') ||
          lowerName.includes('official') ||
          lowerName.includes('airport garage');

        const isCovered =
          lowerName.includes('garage') ||
          lowerName.includes('covered') ||
          lowerName.includes('wally') ||
          lowerName.includes('masterpark');

        const hasDynamicPrice =
          typeof dynamicPricing?.price === 'number' && dynamicPricing.price > 0;
        const price = hasDynamicPrice ? dynamicPricing.price! : staticPricing.price;
        const priceDisplay = hasDynamicPrice ? dynamicPricing.priceDisplay : staticPricing.priceDisplay;
        const priceUnit = hasDynamicPrice ? dynamicPricing.priceUnit : staticPricing.priceUnit;
        const priceNote = hasDynamicPrice ? dynamicPricing.priceNote : staticPricing.priceNote;
        const priceConfidence = hasDynamicPrice ? dynamicPricing.priceConfidence : staticPricing.priceConfidence;

        const option: ParkingOption = {
          id: `${airportCode.toLowerCase()}-google-${place.id}`,
          name,
          serviceAirportCode: airportCode,
          type: isOfficial ? 'official' : 'off-airport',
          price: price ?? 30,
          priceDisplay,
          priceUnit: priceUnit ?? undefined,
          priceNote,
          availabilityStatus: 'unknown',
          isAvailable: place.businessStatus !== 'CLOSED_PERMANENTLY',
          priceSource: dynamicPricing?.status === 'found' && hasDynamicPrice ? 'direct-lot-rate' : staticPricing.priceSource,
          priceConfidence,
          bookingProvider: staticPricing.bookingProvider,
          trustStatus: dynamicPricing?.status === 'found' ? 'verified-source' : 'estimated',
          sourceName: 'Google Places',
          searchQuery: searchQueries.join(' | '),
          distance: 10,
          availability: 50,
          routeUnavailable: false,
          sourceLink: place.googleMapsUri || googleMapsSearchUrl(name),
          mapLink: place.googleMapsUri || googleMapsSearchUrl(place.formattedAddress || name),
          googlePlaceId: place.id,
          googleMapsUri: place.googleMapsUri,
          address: place.formattedAddress,
          imageUrl,
          images: imageUrl ? [imageUrl] : undefined,
          lat: place.location?.latitude,
          lng: place.location?.longitude,
          normalizedAddress: place.formattedAddress,
          routeDestination: place.formattedAddress || name,
          lastUpdated: dynamicPricing?.lastChecked || new Date().toISOString(),
          parkingBufferMinutes: 15,
          transferToTerminalMinutes: isParkAndRide ? 45 : isOfficial ? 5 : 12,
          transferType: isParkAndRide ? 'transit' : isOfficial ? 'walk' : 'shuttle',
          assumptions: [
            'Live parking listing from Google Places.',
            place.rating
              ? `Google rating: ${place.rating} (${place.userRatingCount || 0} reviews)`
              : 'No Google rating available.',
            dynamicPricing?.status === 'found'
              ? 'Dynamic price found from configured source.'
              : dynamicPricing?.status === 'fallback'
                ? 'Using known baseline price because live crawler did not find a current price.'
                : 'Open provider to confirm live price/coupon.',
          ],
          walkingMinutes: isParkAndRide ? 8 : isOfficial ? 5 : 2,
          shuttleMinutes: isParkAndRide || isOfficial ? undefined : 12,
          covered: isCovered,
          reviewScore: rating,
          reviewCount,
          availabilityScore: 50,
          bestFor: [
            rating && rating >= 4.4 ? 'Best Reviews' : '',
            isCovered ? 'Best Weather' : '',
            isOfficial ? 'Closest Walk' : 'Compare Listed Deal',
            isParkAndRide ? 'Park & Ride' : '',
          ].filter(Boolean),
        };

        return withAvailabilityScore(option);
      }),
  );

  return mapped
    .sort((a, b) => scoreGoogleParkingOption(b) - scoreGoogleParkingOption(a))
    .slice(0, 30);
}
