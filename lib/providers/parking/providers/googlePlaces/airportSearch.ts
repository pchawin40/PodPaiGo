import type { ParkingOption } from '../../../../types';
import { DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES } from '../../../../access/parkAndRideAccess';
import { getGoogleMapsServerApiKey } from '../../../../env/googleMapsServerKey';
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

const UNRELATED_BUSINESS_PATTERNS = [
  'restaurant',
  'coffee',
  'cafe',
  'bar & grill',
  'bar and grill',
  'hotel front desk',
  'gas station',
  'fuel stop',
  'car wash',
  'auto repair',
  'grocery',
  'supermarket',
  'pharmacy',
  'bank',
  'atm',
  'church',
  'school',
  'daycare',
  'gym',
  'fitness center',
];

const PARKING_TRANSIT_NAME_PATTERNS = [
  'parking',
  'park and ride',
  'park & ride',
  'park-and-ride',
  'park n ride',
  'transit center',
  'transit centre',
  'link station',
  'light rail',
  'station parking',
  'northgate transit',
  'northgate station',
  'airport parking',
  'long term parking',
  'long-term parking',
  'shuttle parking',
  'hotel parking',
  'garage',
  ' parking lot',
  'parking garage',
  'airport shuttle',
  'airport garage',
  'terminal parking',
];

export function looksLikeParkingOrTransitName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  if (!normalized) return false;

  if (UNRELATED_BUSINESS_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return false;
  }

  if (PARKING_TRANSIT_NAME_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return true;
  }

  if (normalized.includes('northgate')) return true;

  if (/\b(shuttle|garage|lot)\b/.test(normalized)) return true;

  if (normalized.includes('airport')) return true;

  if (
    normalized.includes('park') &&
    (normalized.includes('park and') ||
      normalized.includes('park &') ||
      normalized.includes('park n') ||
      normalized.includes('park,') ||
      normalized.includes(' park ') ||
      normalized.endsWith(' park'))
  ) {
    return true;
  }

  if (/\bstation\b/.test(normalized) && !normalized.includes('gas station')) {
    return true;
  }

  return false;
}

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

function isParkAndRideName(name: string): boolean {
  const lower = name.toLowerCase();

  return (
    lower.includes('park & ride') ||
    lower.includes('park and ride') ||
    lower.includes('park-and-ride') ||
    lower.includes('park n ride') ||
    lower.includes('transit center') ||
    lower.includes('transit centre') ||
    lower.includes('link station') ||
    lower.includes('light rail') ||
    lower.includes('station parking') ||
    lower.includes('northgate')
  );
}

function dedupeGooglePlaces(places: GooglePlace[]): GooglePlace[] {
  const seen = new Set<string>();
  const unique: GooglePlace[] = [];

  for (const place of places) {
    const key = (place.id || place.displayName?.text || place.formattedAddress || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(place);
  }

  return unique;
}

function logGoogleParkingDiagnostics(stats: {
  airportCode: string;
  fetched: number;
  droppedByName: number;
  droppedByGeo: number;
  afterDedupe: number;
  returned: number;
}): void {
  if (process.env.NODE_ENV !== 'development') return;

  console.log('[google-parking]', stats);
}

export async function getGoogleParkingPlaces(args: {
  airportCode?: string;
  airportCoordinates?: { lat: number; lng: number };
  destination: string;
}): Promise<ParkingOption[]> {
  const key = getGoogleMapsServerApiKey();
  const airportCode = (args.airportCode || 'SEA').toUpperCase();
  const airport = getAirportById(airportCode);
  const airportCoordinates = args.airportCoordinates ?? airport?.geoLocation;
  const airportLabel = airport?.label ?? airportCode;
  const searchQueries = [
    `airport parking near ${airportLabel}`,
    `long term parking near ${airportCode}`,
    `parking near ${airportLabel}`,
    `airport shuttle parking near ${airportCode}`,
    `hotel parking near ${airportCode}`,
    `park and ride to ${airportLabel}`,
    `park and ride to ${airportCode}`,
    `transit center to ${airportCode}`,
    `light rail parking to ${airportCode}`,
    `cheap airport parking near ${airportCode}`,
    `off airport parking near ${airportLabel}`,
    `airport parking reservations near ${airportLabel}`,
  ];

  const parkingSearchRadiusMeters = Number(
    process.env.PARKING_SEARCH_RADIUS_METERS || 50000,
  );

  const maxParkingDistanceMiles = Number(
    process.env.PARKING_MAX_DISTANCE_MILES || 25,
  );

  const maxReturnedOptions = Number(
    process.env.GOOGLE_PARKING_MAX_RESULTS || 50,
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

  const fetchedPlaces = placesByQuery.flat();
  const dedupedPlaces = dedupeGooglePlaces(fetchedPlaces);

  let droppedByName = 0;
  let droppedByGeo = 0;

  const filteredPlaces = dedupedPlaces.filter((place: GooglePlace) => {
    const name = String(place.displayName?.text || '');

    if (!looksLikeParkingOrTransitName(name)) {
      droppedByName += 1;
      return false;
    }

    const lat = place.location?.latitude;
    const lng = place.location?.longitude;

    if (typeof lat === 'number' && typeof lng === 'number') {
      const milesFromAirport = milesBetween(
        { lat: airportCoordinates.lat, lng: airportCoordinates.lng },
        { lat, lng },
      );

      if (milesFromAirport > maxParkingDistanceMiles) {
        droppedByGeo += 1;
        return false;
      }
    }

    return true;
  });

  const mapped = await Promise.all(
    filteredPlaces.map(async (place: GooglePlace): Promise<ParkingOption> => {
        const rating = typeof place.rating === 'number' ? place.rating : undefined;
        const reviewCount = typeof place.userRatingCount === 'number' ? place.userRatingCount : undefined;

        const name = place.displayName?.text || `${airportCode} Parking`;
        const lowerName = name.toLowerCase();
        const isParkAndRide = isParkAndRideName(name);
        const imageUrl = googlePlacePhotoImageUrl(place.photos?.[0]?.name);

        const lotKey = resolveLotKeyFromName(name);

        const isOfficial =
          lowerName.includes(`${airportCode.toLowerCase()} parking garage`) ||
          lowerName.includes('terminal parking') ||
          lowerName.includes('official') ||
          lowerName.includes('airport garage');

        const staticPricing = resolveParkingPricing({
          airportCode,
          lotName: name,
          lotKind: isOfficial ? 'official' : isParkAndRide ? 'park-and-ride' : 'off-airport',
        });

        const dynamicPricing = lotKey
          ? await resolveDynamicParkingPrice(lotKey)
          : null;

        const isCovered =
          lowerName.includes('garage') ||
          lowerName.includes('covered') ||
          lowerName.includes('wally') ||
          lowerName.includes('masterpark');

        const hasDynamicPrice =
          typeof dynamicPricing?.price === 'number' && dynamicPricing.price > 0;
        const price = hasDynamicPrice ? dynamicPricing.price! : staticPricing.price;
        const priceMin = hasDynamicPrice ? undefined : staticPricing.priceMin;
        const priceMax = hasDynamicPrice ? undefined : staticPricing.priceMax;
        const priceDisplay = hasDynamicPrice ? dynamicPricing.priceDisplay : staticPricing.priceDisplay;
        const priceUnit = hasDynamicPrice ? dynamicPricing.priceUnit : staticPricing.priceUnit;
        const priceNote = hasDynamicPrice ? dynamicPricing.priceNote : staticPricing.priceNote;
        const priceConfidence = hasDynamicPrice ? dynamicPricing.priceConfidence : staticPricing.priceConfidence;

        const option: ParkingOption = {
          id: `${airportCode.toLowerCase()}-google-${place.id}`,
          name,
          serviceAirportCode: airportCode,
          type: isOfficial ? 'official' : isParkAndRide ? 'park-and-ride' : 'off-airport',
          price: price ?? staticPricing.price ?? 20,
          priceMin,
          priceMax,
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
                : 'Estimated nearby parking rate; confirm on provider.',
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
          parkAndRideRules: isParkAndRide ? DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES : undefined,
        };

        return withAvailabilityScore(option);
      }),
  );

  const returned = mapped
    .sort((a, b) => scoreGoogleParkingOption(b) - scoreGoogleParkingOption(a))
    .slice(0, maxReturnedOptions);

  logGoogleParkingDiagnostics({
    airportCode,
    fetched: fetchedPlaces.length,
    droppedByName,
    droppedByGeo,
    afterDedupe: dedupedPlaces.length,
    returned: returned.length,
  });

  return returned;
}
