import { ParkingOption } from '../types';
import { getAirportById } from '../airports/catalog';
import { mockParkingOptions } from '../../data/mockData';
import { resolveParkingPricing } from './pricingResolver';
import { resolveDynamicParkingPrice } from './dynamicParkingPricing';
import { getParkWhizParkingOptions } from './parkWhiz';
import { debugLog } from '../utils/debug';
import { getParkingLotsByAirport } from '../parking/inventory';
import { inventoryLotToParkingOption } from '../parking/inventoryToParkingOption';
import { enrichInventoryOptionsWithPrices } from '../parking/priceMatcher';
import { calculateParkingAvailabilityScore } from '../parking/availabilityScore';
import { normalizeParkingPriceForTrip } from '../parking/parkingPriceNormalizer';
import { withStableParkingRouteStatus } from '../parking/routeStatus';
import { cleanParkingProviderInventoryName } from '../parking/googlePlaceMatchUtils';
import {
  getCachedAprLotsForDateRange,
  getLatestParkingPriceSnapshots,
  saveParkingPriceSnapshotsFromOptions,
} from '../db/parkingCache';


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

type ParkingMarketplace = {
  id: string;
  name: string;
  trustStatus: ParkingOption['trustStatus'];
  sourceName: string;
  url: string;
};

const PARKING_MARKETPLACES: ParkingMarketplace[] = [
  {
    id: 'spothero',
    name: 'SpotHero',
    trustStatus: 'estimated',
    sourceName: 'SpotHero',
    url: 'https://spothero.com/airport-parking/',
  },
];

function withAvailabilityScore(option: ParkingOption): ParkingOption {
  const availabilityScore = calculateParkingAvailabilityScore(option);

  return {
    ...withStableParkingRouteStatus(option),
    availabilityScore,
    availability: availabilityScore,
    isAvailable: option.availabilityStatus !== 'unavailable',
  };
}

// Normalize lot names by lowercasing and removing non-alphanumeric characters to help deduplication
function normalizeLotName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Dedupe parking options based on normalized lot names to avoid showing multiple similar options from different sources
function dedupeParkingOptions(options: ParkingOption[]): ParkingOption[] {
  const seen = new Set<string>();

  return options.filter((option) => {
    const key = normalizeLotName(option.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function googleMapsDirectionsUrl(origin: string, destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
}

function googlePlacePhotoImageUrl(photoName?: string | null): string | undefined {
  const name = photoName?.trim();
  if (!name) return undefined;

  return `/api/google-place-photo?name=${encodeURIComponent(name)}&maxWidthPx=900`;
}

function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const radiusMiles = 3958.8;
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * radiusMiles * Math.asin(Math.sqrt(h));
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

function scoreAprParkingOption(p: ParkingOption): number {
  const price = p.price ?? 999;
  const shuttle = p.shuttleMinutes ?? p.transferToTerminalMinutes ?? 15;
  const coveredBonus = p.covered ? 2 : 0;

  return price + shuttle * 0.75 - coveredBonus;
}

function isAprOption(p: ParkingOption): boolean {
  return p.bookingProvider === 'AirportParkingReservations' || p.sourceName === 'AirportParkingReservations';
}

function aprLotRouteDestination(lotName: string): string {
  const cleanedName = cleanParkingProviderInventoryName(lotName) || lotName;
  return `${cleanedName}, SeaTac, WA`;
}

function aprLotToParkingOption(
  lot: {
    lotName: string;
    bookingUrl: string;
    price: number | null;
    priceUnit: 'per-day' | null;
    rawSnippet?: string;
    lastChecked: string;
  },
  availabilityStatus: 'available' | 'unavailable' | 'unknown' = 'unknown'
): ParkingOption {
  const lower = lot.lotName.toLowerCase();
  const covered = lower.includes('covered') || lot.rawSnippet?.toLowerCase().includes('covered') || false;

  const option: ParkingOption = {
    id: `sea-apr-${lower.replace(/[^a-z0-9]+/g, '-')}`,
    name: lot.lotName,
    type: 'off-airport',
    price: lot.price ?? 0,
    priceDisplay:
      availabilityStatus === 'unavailable'
        ? 'unavailable'
        : lot.price
          ? 'from-per-day'
          : 'check-live',
    priceNote:
      availabilityStatus === 'available'
        ? 'APR listed starting rate. Availability check passed, but final selected-date price may differ at checkout.'
        : lot.price
          ? 'APR listed starting rate. Selected-date price and availability may differ; confirm on AirportParkingReservations.'
          : 'Open AirportParkingReservations to confirm selected-date price and availability.',
    availabilityStatus,
    isAvailable: availabilityStatus !== 'unavailable',
    priceUnit: lot.priceUnit ?? undefined,
    priceSource: 'marketplace-link',
    priceConfidence: availabilityStatus === 'available' ? 'medium' : 'low',
    bookingProvider: 'AirportParkingReservations',
    distance: 12,
    availability: 50,
    trustStatus: 'estimated',
    routeUnavailable: false,
    sourceName: 'AirportParkingReservations',
    sourceLink: lot.bookingUrl,
    routeDestination: aprLotRouteDestination(lot.lotName),
    mapLink: googleMapsSearchUrl(aprLotRouteDestination(lot.lotName)),
    lastUpdated: lot.lastChecked,
    parkingBufferMinutes: 15,
    transferToTerminalMinutes: 12,
    transferType: 'shuttle',
    walkingMinutes: 2,
    shuttleMinutes: 12,
    covered,
    availabilityScore: 50,
    assumptions: [
      'Parsed from AirportParkingReservations SEA airport parking page.',
      lot.rawSnippet || 'Rate and lot metadata should be verified before booking.',
      availabilityStatus === 'available'
        ? 'APR availability check passed for selected dates.'
        : 'APR availability could not be confirmed automatically; open APR to verify.',
    ],
    bestFor: [
      availabilityStatus === 'available' ? 'APR availability check passed' : 'Starting Rate',
      lot.price && lot.price < 20 ? 'Great Deal' : '',
      lot.price && lot.price < 18 ? 'Cheapest' : '',
      covered ? 'Covered' : '',
    ].filter(Boolean),
  };

  return withAvailabilityScore(option);
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

async function getGoogleParkingPlaces(args: {
  airportCode?: string;
  destination: string;
}): Promise<ParkingOption[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const airport = getAirportById(args.airportCode || '') || getAirportById('SEA')!;
  const searchQueries = [
    `airport parking near ${airport.label}`,
    `cheap airport parking near ${airport.id}`,
    `off airport parking near ${airport.label}`,
    `airport parking reservations near ${airport.label}`,
    `park and ride to ${airport.label}`,
    `park and ride to ${airport.id}`,
  ];

  const parkingSearchRadiusMeters = Number(
    process.env.PARKING_SEARCH_RADIUS_METERS || 50000
  );

  const maxParkingDistanceMiles = Number(
    process.env.PARKING_MAX_DISTANCE_MILES || 25
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
              latitude: airport.geoLocation.lat,
              longitude: airport.geoLocation.lng,
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

  if (!key) return [];

  const placesByQuery = await Promise.all(
    searchQueries.map((query) => fetchPlacesForQuery(query))
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

        // Hard guard: do not allow SEA lots to leak into BLI/PAE/etc.
        // Google locationBias is not strict, so we enforce distance ourselves.
        if (typeof lat === 'number' && typeof lng === 'number') {
          const milesFromAirport = milesBetween(
            { lat: airport.geoLocation.lat, lng: airport.geoLocation.lng },
            { lat, lng }
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

        const name = place.displayName?.text || `${airport.id} Parking`;
        const lowerName = name.toLowerCase();
        const isParkAndRide =
          lowerName.includes('park & ride') ||
          lowerName.includes('park and ride') ||
          lowerName.includes('station parking') ||
          lowerName.includes('northgate');
        const imageUrl = googlePlacePhotoImageUrl(place.photos?.[0]?.name);

        const lotKey = resolveLotKeyFromName(name);

        const staticPricing = resolveParkingPricing({
          airportCode: airport.id,
          lotName: name,
        });

        const dynamicPricing = lotKey
          ? await resolveDynamicParkingPrice(lotKey)
          : null;

        const isOfficial =
          lowerName.includes(`${airport.id.toLowerCase()} parking garage`) ||
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
          id: `${airport.id.toLowerCase()}-google-${place.id}`,
          name,
          type: isOfficial ? 'official' : 'off-airport',
          price: price ?? 30,
          priceDisplay,
          priceUnit: priceUnit ?? undefined,
          priceNote,
          availabilityStatus: 'unknown',
          isAvailable: place.businessStatus !== 'CLOSED_PERMANENTLY',
          priceSource: dynamicPricing?.status === 'found' && hasDynamicPrice ? 'direct-lot-rate' : staticPricing.priceSource,
          priceConfidence,
          bookingProvider: dynamicPricing?.status === 'found' || dynamicPricing?.status === 'fallback'
            ? staticPricing.bookingProvider
            : staticPricing.bookingProvider,
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
      })
  );


  return mapped
    .sort((a, b) => scoreGoogleParkingOption(b) - scoreGoogleParkingOption(a))
    .slice(0, 30);
}



function normalizeSnapshotName(name: string): string {
  return name
    .toLowerCase()
    .replace(/self covered/g, '')
    .replace(/self uncovered/g, '')
    .replace(/lot/g, '')
    .replace(/airport/g, '')
    .replace(/parking/g, '')
    .replace(/sea/g, '')
    .replace(/seatac/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyPriceSnapshotsToOptions(
  options: ParkingOption[],
  snapshots: Awaited<ReturnType<typeof getLatestParkingPriceSnapshots>>
): ParkingOption[] {
  if (snapshots.length === 0) return options;

  return options.map((option) => {
    const optionKey = normalizeSnapshotName(option.name);

    const match = snapshots.find((snapshot) => {
      const snapshotKey = normalizeSnapshotName(snapshot.lotName);
      return (
        optionKey === snapshotKey ||
        optionKey.includes(snapshotKey) ||
        snapshotKey.includes(optionKey)
      );
    });

    if (!match || typeof match.priceDaily !== 'number') return option;

    return {
      ...option,
      price: match.priceDaily,
      priceUnit: 'per-day',
      priceDisplay: 'from-per-day',
      priceNote:
        match.priceTotal && match.priceTotal !== match.priceDaily
          ? `${match.source || 'Provider'} selected-date price. Total: $${match.priceTotal.toFixed(2)}. Confirm final checkout price before booking.`
          : `${match.source || 'Provider'} selected-date daily price. Confirm final checkout price before booking.`,
      priceSource: 'marketplace-link',
      priceConfidence: 'medium',
      trustStatus: 'live',
      availabilityStatus:
        match.availabilityStatus === 'unavailable'
          ? 'unavailable'
          : 'available',
      sourceName: match.source || option.sourceName,
      sourceLink: match.bookingUrl || option.sourceLink,
      lastUpdated: match.fetchedAt || option.lastUpdated,
      bestFor: [
        ...(option.bestFor || []),
        'Live Price',
        match.source === 'parkwhiz' ? 'ParkWhiz' : '',
      ].filter(Boolean),
    };
  });
}

export async function getDestinationParkingOptions(args: {
  origin: string;
  destination: string;
  dateTime: string;
  parkingDurationMinutes?: number;
}): Promise<ParkingOption[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;

  if (!key) return [];

  const searchRadiusMeters = Number(
    process.env.DESTINATION_PARKING_SEARCH_RADIUS_METERS || 2500
  );

  const maxResults = Number(
    process.env.DESTINATION_PARKING_MAX_RESULTS || 20
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
              // Temporary WA/Seattle bias. Later we will replace this with destination lat/lng.
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
    searchQueries.map((query) => fetchPlacesForQuery(query))
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
      };

      return withAvailabilityScore(option);
    });

  return dedupeParkingOptions(mapped)
    .sort((a, b) => scoreGoogleParkingOption(b) - scoreGoogleParkingOption(a))
    .slice(0, maxResults);
}

export async function getLiveParkingOptions(args: {
  airportCode?: string;
  destination: string;
  checkInDate?: string;
  checkOutDate?: string;
}): Promise<ParkingOption[]> {
  const airportCode = args.airportCode || 'SEA';
  const airport = getAirportById(airportCode) || getAirportById('SEA')!;
  const airportSearchName = `${airport.label} (${airport.id}) parking`;

  const inventoryLots = await getParkingLotsByAirport(airport.id, 25).catch((error) => {
    console.warn('Parking inventory read failed', error);
    return [];
  });

  const inventoryOptions = inventoryLots.map((lot) =>
    inventoryLotToParkingOption({
      lot,
      origin: airport.routingAddress,
    }),
  );

  const parkWhizOptions =
    process.env.PARKING_DISCOVERY_PROVIDER === 'parkwhiz' ||
      process.env.PARKING_DISCOVERY_PROVIDER === 'all'
      ? await getParkWhizParkingOptions({
        airportCode: airport.id,
        checkInDate: args.checkInDate,
        checkOutDate: args.checkOutDate,
      }).catch((error) => {
        console.warn('ParkWhiz parking fetch failed', error);
        return [];
      })
      : [];

  if (
    parkWhizOptions.length > 0 &&
    args.checkInDate &&
    args.checkOutDate
  ) {
    void saveParkingPriceSnapshotsFromOptions({
      airportCode: airport.id,
      checkInDate: args.checkInDate,
      checkOutDate: args.checkOutDate,
      source: 'parkwhiz',
      options: parkWhizOptions,
      ttlHours: 2,
    }).catch((error) => {
      console.warn('Failed to save ParkWhiz price snapshots', error);
    });
  }

  // Keep recommendations fast. Google Places + APR crawling should run in background jobs,
  // not on every /api/recommendations request.
  const liveGoogleOptions =
    process.env.PARKING_DISCOVERY_PROVIDER === 'google' ||
      process.env.PARKING_DISCOVERY_PROVIDER === 'all'
      ? await getGoogleParkingPlaces({
        airportCode: airport.id,
        destination: args.destination,
      }).catch((error) => {
        console.warn('Google parking places unavailable; continuing without Google discovery', error);
        return [];
      })
      : [];

  const cachedAprLots =
    airport.id === 'SEA'
      ? await getCachedAprLotsForDateRange({
        airportCode: airport.id,
        checkInDate: args.checkInDate,
        checkOutDate: args.checkOutDate,
      }).catch((error) => {
        console.warn('Cached APR lots unavailable; continuing without APR cache', error);
        return [];
      })
      : [];

  const aprLotsRaw = cachedAprLots.map((lot) => ({
    lotName: lot.lotName,
    bookingUrl: lot.bookingUrl,
    price: lot.livePrice ?? null,
    priceUnit: 'per-day' as const,
    rawSnippet: args.checkInDate && args.checkOutDate
      ? 'Latest cached APR baseline rate. Verify selected-date checkout price before booking.'
      : 'Latest cached APR baseline rate.',
    lastChecked: lot.fetchedAt,
    source: 'airportparkingreservations' as const,
  }));

  // debugLog('[parkingAggregator aprLotsRaw]', aprLotsRaw.map((lot) => ({
  //   name: lot.lotName,
  //   price: lot.price,
  //   rawSnippet: lot.rawSnippet,
  // })));

  const aprSeedLots = aprLotsRaw;

  // Keep /api/recommendations fast.
  // Live APR checks happen separately in /api/apr-availability after the page loads.
  const aprLotsToCheck: typeof aprSeedLots = [];
  const aprLotsUnchecked = aprSeedLots;

  const availabilityByUrl: Record<
    string,
    {
      available: boolean;
      status: 'available' | 'unavailable' | 'unknown';
      livePrice: number | null;
      lotId: number | null;
    }
  > = {};

  const aprLotsWithAvailability = [
    ...aprLotsToCheck.map((lot) => ({
      lot,
      availability:
        availabilityByUrl[lot.bookingUrl] ?? {
          available: true,
          status: 'unknown' as const,
          livePrice: null,
          lotId: null,
        },
    })),
    ...aprLotsUnchecked.map((lot) => ({
      lot,
      availability: {
        available: true,
        status: 'unknown' as const,
        livePrice: null,
        lotId: null,
      },
    })),
  ];

  const aprOptions = aprLotsWithAvailability
    .filter((x) => {
      const lotName = x.lot.lotName.toLowerCase();

      // Hide lots we can explicitly check unless they are confirmed available.
      const requiresConfirmedAvailability =
        lotName.includes('doubletree');

      if (requiresConfirmedAvailability) {
        return x.availability.status === 'available';
      }

      // Keep other APR lots unless confirmed unavailable.
      return x.availability.status !== 'unavailable';
    })
    .map((x) => {
      const option = aprLotToParkingOption(x.lot, x.availability.status);

      return withAvailabilityScore({
        ...option,
        price: x.availability.livePrice ?? option.price,
        priceUnit: 'per-day' as const,
        priceDisplay: x.availability.status === 'unavailable' ? 'unavailable' : 'from-per-day',
        availabilityStatus: x.availability.status,
        priceNote: x.availability.livePrice
          ? 'APR price found for selected dates. Verify final checkout price before booking.'
          : 'Latest cached APR baseline rate. Verify selected-date checkout price before booking.',
        priceConfidence: x.availability.livePrice ? 'medium' : option.priceConfidence,
        bestFor: [
          x.availability.livePrice ? 'Selected-date price' : 'Starting Rate',
          option.price && option.price < 20 ? 'Great Deal' : '',
          option.covered ? 'Covered' : '',
        ].filter(Boolean),
      });
    })
    .sort((a, b) => scoreAprParkingOption(a) - scoreAprParkingOption(b))
    .slice(0, 8);

  const pricedProviderOptions = [
    ...parkWhizOptions,
    ...aprOptions,
  ];

  const pricedInventoryOptions = enrichInventoryOptionsWithPrices({
    inventoryOptions,
    pricedOptions: pricedProviderOptions,
  });

  const latestPriceSnapshots = await getLatestParkingPriceSnapshots({
    airportCode: airport.id,
    checkInDate: args.checkInDate,
    checkOutDate: args.checkOutDate,
  }).catch((error) => {
    console.warn('Latest parking price snapshots unavailable; continuing without snapshots', error);
    return [];
  });

  const snapshotOptions: ParkingOption[] = latestPriceSnapshots
    .filter((s) => typeof s.priceDaily === 'number' && s.priceDaily > 0)
    .map((s) =>
      withAvailabilityScore({
        id: `${airport.id.toLowerCase()}-${s.source}-${s.lotName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')}`,
        name: s.lotName,
        type: 'off-airport',
        price: s.priceDaily!,
        priceUnit: 'per-day',
        priceDisplay: 'from-per-day',
        priceNote: s.priceTotal
          ? `${s.source} selected-date price. Total: $${s.priceTotal.toFixed(2)}. Confirm final checkout price.`
          : `${s.source} selected-date price. Confirm final checkout price.`,
        availabilityStatus:
          s.availabilityStatus === 'unavailable' ? 'unavailable' : 'available',
        isAvailable: s.availabilityStatus !== 'unavailable',
        priceSource: 'marketplace-link',
        priceConfidence: 'medium',
        bookingProvider: s.source || undefined,
        distance: 10,
        availability: 70,
        trustStatus: 'live',
        routeUnavailable: false,
        sourceName: s.source || 'Parking price snapshot',
        sourceLink: s.bookingUrl || undefined,
        mapLink: googleMapsSearchUrl(`${s.lotName} ${airport.label}`),
        routeDestination: `${s.lotName}, ${airport.label}`,
        lastUpdated: s.fetchedAt,
        parkingBufferMinutes: 15,
        transferToTerminalMinutes: 12,
        transferType: 'shuttle',
        shuttleMinutes: 12,
        assumptions: [
          'Price loaded from cached selected-date parking price snapshot.',
        ],
        bestFor: ['Live Price', s.source || 'Provider'].filter(Boolean),
      })
    );

  const marketplaceOptions = PARKING_MARKETPLACES.map((provider): ParkingOption => {
    const isOfficial = provider.id === 'official';
    const isGoogleSearch = provider.id === 'google-parking-search';

    const sourceLink = isOfficial
      ? airport.officialParkingUrl || googleSearchUrl(`${airportSearchName} official parking`)
      : isGoogleSearch
        ? googleSearchUrl(`${airportSearchName} cheapest airport parking coupons`)
        : provider.url;

    return withAvailabilityScore({
      id: `${airport.id.toLowerCase()}-${provider.id}`,
      name: isOfficial ? `Official ${airport.id} Parking` : `${provider.name} ${airport.id} Parking`,
      type: isOfficial ? 'official' : 'off-airport',
      price: 0,
      priceDisplay: 'check-live',
      priceUnit: undefined,
      availabilityStatus: 'unknown',
      priceConfidence: 'low',
      priceNote: isOfficial
        ? 'Open official airport site to check current rates and availability.'
        : 'Open provider to confirm current price and availability.',
      searchQuery: airportSearchName,
      distance: 10,
      availability: 50,
      trustStatus: provider.trustStatus,
      routeUnavailable: false,
      routeDestination: airport.routingAddress,
      sourceName: provider.sourceName,
      sourceLink,
      mapLink: googleMapsSearchUrl(airportSearchName),
      lastUpdated: new Date().toISOString(),
      parkingBufferMinutes: isOfficial ? 10 : 15,
      transferToTerminalMinutes: isOfficial ? 5 : 12,
      transferType: isOfficial ? 'walk' : 'shuttle',
      assumptions: [
        'Provider link opens current parking marketplace or official source.',
        'Use copied search text if provider does not prefill destination.',
        'Estimated option used for ranking until direct pricing integration is available.',
      ],
    });
  });

  const shouldUseSeaCuratedLots = false;

  const curatedSeaLots: ParkingOption[] = shouldUseSeaCuratedLots
    ? mockParkingOptions.map((p): ParkingOption => ({
      ...p,
      trustStatus: p.trustStatus === 'verified-source' ? 'verified-source' : 'estimated',
      assumptions: [
        ...p.assumptions,
        'Curated SEA parking lot used as a reliable MVP fallback.',
      ],
    }))
    : [];

  const discoveredLots = dedupeParkingOptions(liveGoogleOptions);

  const fallbackLots = curatedSeaLots.filter((curated) => {
    const curatedName = curated.name.toLowerCase();
    return !discoveredLots.some((live) => {
      const liveName = live.name.toLowerCase();
      return (
        liveName.includes('wally') && curatedName.includes('wally') ||
        liveName.includes('master') && curatedName.includes('master') ||
        liveName.includes('general') && curatedName.includes('general') ||
        liveName.includes('reserved') && curatedName.includes('reserved')
      );
    });
  });

  return dedupeParkingOptions([
    ...fallbackLots.filter((p) => p.type === 'official'),
    ...snapshotOptions,
    ...applyPriceSnapshotsToOptions(pricedInventoryOptions, latestPriceSnapshots),
    ...parkWhizOptions,
    ...aprOptions,
    ...discoveredLots,
    ...marketplaceOptions.filter((option) => {
      const hasRealParkWhiz = parkWhizOptions.some(
        (p) => p.sourceName === 'ParkWhiz' || p.bookingProvider === 'ParkWhiz'
      );

      if (
        hasRealParkWhiz &&
        (option.sourceName === 'ParkWhiz' || option.bookingProvider === 'ParkWhiz')
      ) {
        return false;
      }

      return true;
    }),
    ...fallbackLots.filter((p) => p.type !== 'official'),
  ])
    .map((option) =>
      normalizeParkingPriceForTrip(option, args.checkInDate, args.checkOutDate)
    )
    .map(withStableParkingRouteStatus)
    .map(withAvailabilityScore)
    .sort((a, b) => {
      const rank = (p: ParkingOption) => {
        const name = p.name.toLowerCase();

        if (p.type === 'official') return 0;
        if (p.sourceName === 'Google Places' || p.sourceName === 'Parking inventory') return 1;
        if (p.bookingProvider === 'ParkWhiz' || p.sourceName === 'ParkWhiz') return 2;
        if (isAprOption(p)) return 3;
        if (name.includes('wally')) return 4;
        if (name.includes('master')) return 5;
        return 6;
      };

      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;

      return (a.price ?? 999) - (b.price ?? 999);
    });
}
