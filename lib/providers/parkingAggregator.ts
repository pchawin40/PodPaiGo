import { ParkingOption } from '../types';
import { getAirportById } from '../airports/catalog';

type ParkingMarketplace = {
  id: string;
  name: string;
  trustStatus: ParkingOption['trustStatus'];
  sourceName: string;
  buildUrl: (airportSearchName: string) => string;
};

const PARKING_MARKETPLACES: ParkingMarketplace[] = [
  {
    id: 'official',
    name: 'Official Airport Parking',
    trustStatus: 'verified-source',
    sourceName: 'Airport official site',
    buildUrl: () => '',
  },
  {
    id: 'spothero',
    name: 'SpotHero',
    trustStatus: 'estimated',
    sourceName: 'SpotHero',
    buildUrl: (q) => `https://spothero.com/search?search=${encodeURIComponent(q)}`,
  },
  {
    id: 'way',
    name: 'Way.com',
    trustStatus: 'estimated',
    sourceName: 'Way.com',
    buildUrl: (q) => `https://www.way.com/parking/search?query=${encodeURIComponent(q)}`,
  },
  {
    id: 'parkwhiz',
    name: 'ParkWhiz',
    trustStatus: 'estimated',
    sourceName: 'ParkWhiz',
    buildUrl: (q) => `https://www.parkwhiz.com/search/?destination=${encodeURIComponent(q)}`,
  },
  {
    id: 'airportparkingreservations',
    name: 'AirportParkingReservations',
    trustStatus: 'estimated',
    sourceName: 'AirportParkingReservations',
    buildUrl: (q) => `https://www.airportparkingreservations.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'cheapairportparking',
    name: 'Cheap Airport Parking',
    trustStatus: 'estimated',
    sourceName: 'Cheap Airport Parking',
    buildUrl: (q) => `https://www.cheapairportparking.org/search?search=${encodeURIComponent(q)}`,
  },
  {
    id: 'google-parking-search',
    name: 'Google Parking Search',
    trustStatus: 'fallback',
    sourceName: 'Google Maps/Search',
    buildUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(`${q} cheapest airport parking`)}`,
  },
];

export function getLiveParkingOptions(args: {
  airportCode: string;
  destination: string;
}): ParkingOption[] {
  const airport = getAirportById(args.airportCode) || getAirportById('SEA')!;
  const airportSearchName = `${airport.label} (${airport.id}) parking`;

  return PARKING_MARKETPLACES.map((provider): ParkingOption => {
    const isOfficial = provider.id === 'official';

    return {
      id: `${airport.id.toLowerCase()}-${provider.id}`,
      name: isOfficial ? `Official ${airport.id} Parking` : `${provider.name} ${airport.id} Parking`,
      type: isOfficial ? 'official' : 'off-airport',
      price: isOfficial ? 40 : 30,
      priceDisplay: 'check-live',
      priceNote: isOfficial
        ? 'Open official airport site to check current rates and availability'
        : 'Open provider to check current rates, coupons, and availability',
      distance: 10,
      availability: 80,
      trustStatus: provider.trustStatus,
      routeDestination: airport.routingAddress,
      sourceName: provider.sourceName,
      sourceLink: isOfficial
        ? airport.officialParkingUrl || provider.buildUrl(airportSearchName)
        : provider.buildUrl(airportSearchName),
      mapLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(airportSearchName)}`,
      lastUpdated: new Date().toISOString(),
      parkingBufferMinutes: isOfficial ? 10 : 15,
      transferToTerminalMinutes: isOfficial ? 5 : 12,
      transferType: isOfficial ? 'walk' : 'shuttle',
      assumptions: [
        'Live price not pulled yet; provider link opens current rates.',
        'Estimated option used for ranking until direct pricing integration is available.',
      ],
    };
  });
}