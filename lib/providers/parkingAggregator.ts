import { ParkingOption } from '../types';
import { getAirportById } from '../airports/catalog';
import { mockParkingOptions } from '../../data/mockData';

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
  {
    id: 'way',
    name: 'Way.com',
    trustStatus: 'estimated',
    sourceName: 'Way.com',
    url: 'https://www.way.com/parking',
  },
  {
    id: 'parkwhiz',
    name: 'ParkWhiz',
    trustStatus: 'estimated',
    sourceName: 'ParkWhiz',
    url: 'https://www.parkwhiz.com/airport-parking/',
  },
];

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

async function getGoogleParkingPlaces(airportCode: string): Promise<ParkingOption[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const airport = getAirportById(airportCode) || getAirportById('SEA')!;
  const airportSearchName = `${airport.label} ${airport.id} airport parking lots`;

  if (!key) return [];

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.googleMapsUri',
        'places.rating',
        'places.userRatingCount',
        'places.businessStatus',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery: airportSearchName,
      locationBias: {
        circle: {
          center: {
            latitude: airport.geoLocation.lat,
            longitude: airport.geoLocation.lng,
          },
          radius: 8000,
        },
      },
    }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const places = Array.isArray(data.places) ? data.places : [];

  return places
    .slice(0, 12)
    .map((place: any): ParkingOption => {
      const rating = typeof place.rating === 'number' ? place.rating : undefined;
      const reviewCount = typeof place.userRatingCount === 'number' ? place.userRatingCount : undefined;

      const name = place.displayName?.text || `${airport.id} Parking`;
      const lowerName = name.toLowerCase();

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

      return {
        id: `${airport.id.toLowerCase()}-google-${place.id}`,
        name,
        type: isOfficial ? 'official' : 'off-airport',
        price: 30,
        priceDisplay: 'check-live',
        priceUnit: 'per-day',
        priceNote: 'Google listing metadata only. Open listing to confirm current price, shuttle, coupons, and availability.',
        priceSource: 'google-places',
        priceConfidence: 'low',
        searchQuery: `${airport.label} ${airport.id} airport parking`,
        distance: 10,
        availability: 80,
        trustStatus: 'live',
        sourceName: 'Google Places',
        sourceLink: place.googleMapsUri || googleMapsSearchUrl(airportSearchName),
        mapLink: place.googleMapsUri || googleMapsSearchUrl(airportSearchName),
        routeDestination: place.formattedAddress || airport.routingAddress,
        lastUpdated: new Date().toISOString(),
        parkingBufferMinutes: 15,
        transferToTerminalMinutes: 12,
        transferType: 'shuttle',
        assumptions: [
          'Live parking listing from Google Places.',
          place.rating ? `Google rating: ${place.rating} (${place.userRatingCount || 0} reviews)` : 'No Google rating available.',
          'Live price/coupon not pulled yet.',
        ],
        walkingMinutes: isOfficial ? 5 : 2,
        shuttleMinutes: isOfficial ? 0 : 12,
        covered: isCovered,
        reviewScore: rating,
        reviewCount,
        availabilityScore: place.businessStatus === 'OPERATIONAL' ? 80 : 45,
        bookingProvider: 'Google Places',
        bestFor: [
          rating && rating >= 4.4 ? 'Best Reviews' : '',
          isCovered ? 'Best Weather' : '',
          isOfficial ? 'Closest Walk' : 'Compare Live Price',
        ].filter(Boolean),
      };
    })
    .sort((a: ParkingOption, b: ParkingOption) => scoreGoogleParkingOption(b) - scoreGoogleParkingOption(a))
    .slice(0, 6);
}

export async function getLiveParkingOptions(args: {
  airportCode: string;
  destination: string;
}): Promise<ParkingOption[]> {
  const airport = getAirportById(args.airportCode) || getAirportById('SEA')!;
  const airportSearchName = `${airport.label} (${airport.id}) parking`;

  const liveGoogleOptions = await getGoogleParkingPlaces(args.airportCode);

  const marketplaceOptions = PARKING_MARKETPLACES.map((provider): ParkingOption => {
    const isOfficial = provider.id === 'official';
    const isGoogleSearch = provider.id === 'google-parking-search';

    const sourceLink = isOfficial
      ? airport.officialParkingUrl || googleSearchUrl(`${airportSearchName} official parking`)
      : isGoogleSearch
        ? googleSearchUrl(`${airportSearchName} cheapest airport parking coupons`)
        : provider.url;

    return {
      id: `${airport.id.toLowerCase()}-${provider.id}`,
      name: isOfficial ? `Official ${airport.id} Parking` : `${provider.name} ${airport.id} Parking`,
      type: isOfficial ? 'official' : 'off-airport',
      price: isOfficial ? 40 : 30,
      priceDisplay: 'check-live',
      priceNote: isOfficial
        ? 'Open official airport site to check current rates and availability.'
        : 'Search query can be copied; open provider and paste if destination is not prefilled.',
      searchQuery: airportSearchName,
      distance: 10,
      availability: 80,
      trustStatus: provider.trustStatus,
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
    };
  });

  const shouldUseSeaCuratedLots = airport.id === 'SEA';

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

  void marketplaceOptions;

  return dedupeParkingOptions([
    ...curatedSeaLots,
    ...liveGoogleOptions,
  ]).sort((a, b) => {
    const rank = (p: any) => {
      if (p.type === 'official') return 1;
      if (p.name.toLowerCase().includes('wally')) return 2;
      if (p.name.toLowerCase().includes('master')) return 3;
      return 4;
    };

    return rank(a) - rank(b);
  });
}