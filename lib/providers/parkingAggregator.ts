import { ParkingOption } from '../types';
import { getAirportById } from '../airports/catalog';
import { mockParkingOptions } from '../../data/mockData';
import { resolveParkingPricing } from './pricingResolver';
import { resolveDynamicParkingPrice } from './dynamicParkingPricing';
import { checkAprLotsAvailability } from './aprLotAvailability';
import { getCachedAprLotsForDateRange } from '../db/parkingCache';

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

function scoreAprParkingOption(p: ParkingOption): number {
  const price = p.price ?? 999;
  const shuttle = p.shuttleMinutes ?? p.transferToTerminalMinutes ?? 15;
  const coveredBonus = p.covered ? 2 : 0;

  return price + shuttle * 0.75 - coveredBonus;
}

function isAprOption(p: ParkingOption): boolean {
  return p.bookingProvider === 'AirportParkingReservations' || p.sourceName === 'AirportParkingReservations';
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

  return {
    id: `sea-apr-${lower.replace(/[^a-z0-9]+/g, '-')}`,
    name: lot.lotName,
    type: 'off-airport',
    price: lot.price ?? 30,
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
    availability: availabilityStatus === 'available' ? 85 : 35,
    trustStatus: 'estimated',
    sourceName: 'AirportParkingReservations',
    sourceLink: lot.bookingUrl,
    mapLink: googleMapsSearchUrl(`${lot.lotName} SeaTac`),
    lastUpdated: lot.lastChecked,
    parkingBufferMinutes: 15,
    transferToTerminalMinutes: 12,
    transferType: 'shuttle',
    walkingMinutes: 2,
    shuttleMinutes: 12,
    covered,
    availabilityScore: availabilityStatus === 'available' ? 85 : 35,
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

async function getGoogleParkingPlaces(airportCode: string): Promise<ParkingOption[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const airport = getAirportById(airportCode) || getAirportById('SEA')!;
  const airportSearchName =
    airport.id === 'SEA'
      ? 'airport parking near Seattle-Tacoma International Airport'
      : `airport parking near ${airport.label} ${airport.id}`;

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
          radius: 12000,
        },
      },
    }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const places = Array.isArray(data.places) ? data.places : [];

  const mapped = await Promise.all(
    places
      .filter((place: any) => {
        const name = String(place.displayName?.text || '').toLowerCase();
        return (
          name.includes('parking') ||
          name.includes('park') ||
          name.includes('garage') ||
          name.includes('wally') ||
          name.includes('master') ||
          name.includes('doug') ||
          name.includes('ajax') ||
          name.includes('jiffy') ||
          name.includes('mvp') ||
          name.includes('shuttle') ||
          name.includes('extra car') ||
          name.includes('seatacpark') ||
          name.includes('seatac park') ||
          name.includes('park n jet') ||
          name.includes('park and jet')
        );
      })
      .slice(0, 40)
      .map(async (place: any): Promise<ParkingOption> => {
        const rating = typeof place.rating === 'number' ? place.rating : undefined;
        const reviewCount = typeof place.userRatingCount === 'number' ? place.userRatingCount : undefined;

        const name = place.displayName?.text || `${airport.id} Parking`;
        const lowerName = name.toLowerCase();

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

        const price = dynamicPricing?.price ?? staticPricing.price;
        const priceDisplay = dynamicPricing?.priceDisplay ?? staticPricing.priceDisplay;
        const priceUnit = dynamicPricing?.priceUnit ?? staticPricing.priceUnit;
        const priceNote = dynamicPricing?.priceNote ?? staticPricing.priceNote;
        const priceConfidence = dynamicPricing?.priceConfidence ?? staticPricing.priceConfidence;

        return {
          id: `${airport.id.toLowerCase()}-google-${place.id}`,
          name,
          type: isOfficial ? 'official' : 'off-airport',
          price: price ?? 30,
          priceDisplay,
          priceUnit: priceUnit ?? undefined,
          priceNote,
          priceSource: dynamicPricing?.status === 'found' ? 'direct-lot-rate' : staticPricing.priceSource,
          priceConfidence,
          bookingProvider: dynamicPricing?.status === 'found' || dynamicPricing?.status === 'fallback'
            ? staticPricing.bookingProvider
            : staticPricing.bookingProvider,
          trustStatus: 'live',
          sourceName: 'Google Places',
          searchQuery: `${airport.label} ${airport.id} airport parking`,
          distance: 10,
          availability: 80,
          sourceLink: place.googleMapsUri || googleMapsSearchUrl(airportSearchName),
          mapLink: place.googleMapsUri || googleMapsSearchUrl(airportSearchName),
          routeDestination: place.formattedAddress || airport.routingAddress,
          lastUpdated: dynamicPricing?.lastChecked || new Date().toISOString(),
          parkingBufferMinutes: 15,
          transferToTerminalMinutes: 12,
          transferType: isOfficial ? 'walk' : 'shuttle',
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
          walkingMinutes: isOfficial ? 5 : 2,
          shuttleMinutes: isOfficial ? 0 : 12,
          covered: isCovered,
          reviewScore: rating,
          reviewCount,
          availabilityScore: place.businessStatus === 'OPERATIONAL' ? 80 : 45,
          bestFor: [
            rating && rating >= 4.4 ? 'Best Reviews' : '',
            isCovered ? 'Best Weather' : '',
            isOfficial ? 'Closest Walk' : 'Compare Listed Deal',
          ].filter(Boolean),
        };
      })
  );

  return mapped
    .sort((a, b) => scoreGoogleParkingOption(b) - scoreGoogleParkingOption(a))
    .slice(0, 12);
}

export async function getLiveParkingOptions(args: {
  airportCode: string;
  destination: string;
  checkInDate?: string;
  checkOutDate?: string;
}): Promise<ParkingOption[]> {
  const airport = getAirportById(args.airportCode) || getAirportById('SEA')!;
  const airportSearchName = `${airport.label} (${airport.id}) parking`;

  // Keep recommendations fast. Google Places + APR crawling should run in background jobs,
  // not on every /api/recommendations request.
  const liveGoogleOptions: ParkingOption[] = [];

  const cachedAprLots =
    airport.id === 'SEA' && args.checkInDate && args.checkOutDate
      ? await getCachedAprLotsForDateRange({
        airportCode: airport.id,
        checkInDate: args.checkInDate,
        checkOutDate: args.checkOutDate,
      })
      : [];

  const aprLotsRaw = cachedAprLots.map((lot) => ({
    lotName: lot.lotName,
    bookingUrl: lot.bookingUrl,
    price: lot.livePrice ?? null,
    priceUnit: 'per-day' as const,
    rawSnippet: 'Loaded from cached APR database snapshot.',
    lastChecked: lot.fetchedAt,
    source: 'airportparkingreservations' as const,
  }));

  console.log('[parkingAggregator aprLotsRaw]', aprLotsRaw.map((lot) => ({
    name: lot.lotName,
    price: lot.price,
    rawSnippet: lot.rawSnippet,
  })));

  const aprLotsToCheck = aprLotsRaw.slice(0, 0);
  const aprLotsUnchecked = aprLotsRaw;

  const availabilityByUrl = await checkAprLotsAvailability({
    lots: aprLotsToCheck.map((lot) => ({
      lotName: lot.lotName,
      bookingUrl: lot.bookingUrl,
    })),
  });

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

      return {
        ...option,
        price: x.availability.livePrice ?? option.price,
        priceUnit: 'per-day' as const,
        priceDisplay: 'from-per-day' as const,
        priceNote: x.availability.livePrice
          ? 'Selected-date APR price found. Verify final checkout price before booking.'
          : option.priceNote,
        priceConfidence: x.availability.livePrice ? 'medium' : option.priceConfidence,
        bestFor: [
          x.availability.livePrice ? 'Selected-date price' : 'Starting Rate',
          option.price && option.price < 20 ? 'Great Deal' : '',
          option.covered ? 'Covered' : '',
        ].filter(Boolean),
      };
    })
    .sort((a, b) => scoreAprParkingOption(a) - scoreAprParkingOption(b))
    .slice(0, 8);

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
    ...aprOptions,
    ...discoveredLots,
    ...fallbackLots.filter((p) => p.type !== 'official'),
  ]).sort((a, b) => {
    const rank = (p: ParkingOption) => {
      const name = p.name.toLowerCase();

      if (p.type === 'official') return 0;
      if (isAprOption(p)) return 1;
      if (name.includes('wally')) return 2;
      if (name.includes('master')) return 3;
      return 4;
    };

    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;

    return (a.price ?? 999) - (b.price ?? 999);
  });
}