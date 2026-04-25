import { ParkingOption } from '../types';
import { getAirportById } from '../airports/catalog';

type ParkingMarketplace = {
  id: string;
  name: string;
  trustStatus: ParkingOption['trustStatus'];
  sourceName: string;
  url: string;
};

const PARKING_MARKETPLACES: ParkingMarketplace[] = [
  {
    id: 'official',
    name: 'Official Airport Parking',
    trustStatus: 'verified-source',
    sourceName: 'Airport official site',
    url: '',
  },
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
  {
    id: 'airportparkingreservations',
    name: 'AirportParkingReservations',
    trustStatus: 'estimated',
    sourceName: 'AirportParkingReservations',
    url: 'https://www.airportparkingreservations.com/',
  },
  {
    id: 'cheapairportparking',
    name: 'Cheap Airport Parking',
    trustStatus: 'estimated',
    sourceName: 'Cheap Airport Parking',
    url: 'https://www.cheapairportparking.org/',
  },
  {
    id: 'google-parking-search',
    name: 'Google Parking Search',
    trustStatus: 'fallback',
    sourceName: 'Google Maps/Search',
    url: '',
  },
];

function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

async function getGoogleParkingPlaces(airportCode: string): Promise<ParkingOption[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const airport = getAirportById(airportCode) || getAirportById('SEA')!;
  const airportSearchName = `${airport.label} (${airport.id}) parking`;

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

  return places.slice(0, 8).map((place: any): ParkingOption => ({
    id: `${airport.id.toLowerCase()}-google-${place.id}`,
    name: place.displayName?.text || `${airport.id} Parking`,
    type: 'off-airport',
    price: 30,
    priceDisplay: 'check-live',
    priceNote: 'Live Google listing. Open listing to confirm current price, shuttle, coupons, and availability.',
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
  }));
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

  return [...liveGoogleOptions, ...marketplaceOptions];
}