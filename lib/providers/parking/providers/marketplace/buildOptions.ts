import type { ParkingOption } from '../../../../types';
import { getAirportById } from '../../../../airports/catalog';
import { withAvailabilityScore } from '../../shared/availability';
import { googleMapsSearchUrl, googleSearchUrl } from '../../shared/urls';

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

export function buildMarketplaceParkingOptions(args: {
  airportCode: string;
  destination: string;
  airportSearchName: string;
}): ParkingOption[] {
  const airportCode = args.airportCode.toUpperCase();
  const airport = getAirportById(airportCode);

  return PARKING_MARKETPLACES.map((provider): ParkingOption => {
    const isOfficial = provider.id === 'official';
    const isGoogleSearch = provider.id === 'google-parking-search';

    const sourceLink = isOfficial
      ? airport?.officialParkingUrl || googleSearchUrl(`${args.airportSearchName} official parking`)
      : isGoogleSearch
        ? googleSearchUrl(`${args.airportSearchName} cheapest airport parking coupons`)
        : provider.url;

    return withAvailabilityScore({
      id: `${airportCode.toLowerCase()}-${provider.id}`,
      name: isOfficial ? `Official ${airportCode} Parking` : `${provider.name} ${airportCode} Parking`,
      serviceAirportCode: airportCode,
      type: isOfficial ? 'official' : 'off-airport',
      price: 0,
      priceDisplay: 'check-live',
      priceUnit: undefined,
      availabilityStatus: 'unknown',
      priceConfidence: 'low',
      priceNote: isOfficial
        ? 'Open official airport site to check current rates and availability.'
        : 'Open provider to confirm current price and availability.',
      searchQuery: args.airportSearchName,
      distance: 10,
      availability: 50,
      trustStatus: provider.trustStatus,
      routeUnavailable: false,
      routeDestination: airport?.routingAddress ?? args.destination,
      sourceName: provider.sourceName,
      sourceLink,
      mapLink: googleMapsSearchUrl(args.airportSearchName),
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
}
