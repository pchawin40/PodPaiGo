import type { ParkingOption } from '../../../../types';
import { DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES } from '../../../../access/parkAndRideAccess';
import { looksLikeParkAndRideTransitName } from '../../../../parking/parkAndRideClassification';
import {
  mergeLiveCityParkWhizPricing,
  resolveCityParkingPricing,
} from '../../../../parking/cityParkingPricing';
import { findMatchingParkWhizOption } from '../../../../parking/parkWhizMatch';
import { canMakeLiveSearchTextCall, isGoogleParkingDiscoveryLiveBlocked } from '../../../../parking/googlePlacesGuard';
import { getGoogleMapsServerApiKey } from '../../../../env/googleMapsServerKey';
import { getParkWhizDestinationParkingOptions } from '../../../parkWhiz';
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
  destinationLat?: number;
  destinationLng?: number;
  checkInDate?: string;
  checkOutDate?: string;
  checkInAt?: string;
  checkOutAt?: string;
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
    if (isGoogleParkingDiscoveryLiveBlocked()) {
      return [];
    }

    if (
      !canMakeLiveSearchTextCall(
        {
          reason: 'destination_parking_discovery',
          route: 'getDestinationParkingOptions',
          airportCode: null,
          cacheKey: textQuery,
        },
        { discovery: true },
      )
    ) {
      return [];
    }

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

  const durationMinutes = Math.max(60, args.parkingDurationMinutes ?? 4 * 60);

  const liveParkWhizOptions =
    typeof args.destinationLat === 'number' &&
    typeof args.destinationLng === 'number' &&
    args.checkInDate &&
    args.checkOutDate
      ? await getParkWhizDestinationParkingOptions({
          destination: args.destination,
          coordinates: { lat: args.destinationLat, lng: args.destinationLng },
          checkInDate: args.checkInDate,
          checkOutDate: args.checkOutDate,
          checkInAt: args.checkInAt,
          checkOutAt: args.checkOutAt,
        }).catch(() => [])
      : [];

  const matchedLiveParkWhizIds = new Set<string>();

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

      const isParkAndRide = looksLikeParkAndRideTransitName(name);
      const walkToDestination = isParkAndRide ? 10 : 8;
      const pricing = resolveCityParkingPricing({
        name,
        address: place.formattedAddress,
        durationMinutes,
        covered: isGarage,
      });

      const imageUrl = googlePlacePhotoImageUrl(place.photos?.[0]?.name);
      const routeDestination = place.formattedAddress || name;

      const rating =
        typeof place.rating === 'number' ? place.rating : undefined;

      const reviewCount =
        typeof place.userRatingCount === 'number'
          ? place.userRatingCount
          : undefined;

      let option: ParkingOption = {
        id: `destination-google-${place.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        type: isParkAndRide ? 'park-and-ride' : isGarage ? 'official' : 'off-airport',
        price: pricing.price,
        priceMin: pricing.priceMin,
        priceMax: pricing.priceMax,
        priceDisplay: pricing.priceDisplay,
        priceUnit: pricing.priceUnit,
        pricingConfidence: pricing.pricingConfidence,
        priceNote: pricing.priceNote,
        priceSource: pricing.priceSource,
        priceConfidence: pricing.priceConfidence,
        availabilityStatus: 'unknown',
        isAvailable: true,
        availability: 50,
        availabilityScore: 50,
        trustStatus: pricing.trustStatus ?? 'estimated',
        sourceName: pricing.priceSource === 'official-rate' ? 'Official rate card' : 'Estimated city parking',
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
        transferToTerminalMinutes: isParkAndRide ? 25 : walkToDestination,
        transferType: isParkAndRide ? 'transit' : 'walk',
        walkingMinutes: undefined,
        shuttleMinutes: undefined,
        shuttleWaitMinutes: undefined,
        bufferRiskMinutes: undefined,
        covered: isGarage,
        reviewScore: rating,
        reviewCount,
        searchQuery: searchQueries.join(' | '),
        lastUpdated: new Date().toISOString(),
        assumptions: [
          'Discovered from Google Places near your destination.',
          ...(pricing.assumptions || []),
          isParkAndRide
            ? 'Park & Ride rules vary. Do not assume overnight parking unless verified.'
            : 'Walk time to your destination is estimated from the lot location.',
        ].filter(Boolean),
        bestFor: [
          rating && rating >= 4.4 ? 'Best Reviews' : '',
          isGarage ? 'Covered' : '',
          isParkAndRide ? 'Park & Ride' : 'City parking',
        ].filter(Boolean),
        providerSource: 'google',
        fetchedAt: new Date().toISOString(),
        priceFreshness: pricing.priceDisplay === 'live' ? 'live' : 'estimated',
        parkAndRideRules: isParkAndRide ? DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES : undefined,
      };

      const liveMatch = findMatchingParkWhizOption(option, liveParkWhizOptions);
      if (liveMatch) {
        matchedLiveParkWhizIds.add(liveMatch.id);
        option = mergeLiveCityParkWhizPricing(option, liveMatch);
      }

      return withAvailabilityScore(option);
    });

  const unmatchedLiveParkWhiz = liveParkWhizOptions
    .filter((live) => !matchedLiveParkWhizIds.has(live.id))
    .map((live) =>
      withAvailabilityScore({
        ...live,
        id: `destination-parkwhiz-${live.id}`,
        assumptions: [
          ...(live.assumptions || []),
          'Live ParkWhiz city quote discovered near your destination.',
        ],
      }),
    );

  return dedupeParkingOptions([...mapped, ...unmatchedLiveParkWhiz])
    .sort((a, b) => scoreGoogleParkingOption(b) - scoreGoogleParkingOption(a))
    .slice(0, maxResults);
}
