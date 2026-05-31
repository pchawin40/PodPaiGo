import type { ParkingOption } from '../../../../types';
import { getAirportById } from '../../../../airports/catalog';
import { cleanParkingProviderInventoryName } from '../../../../parking/googlePlaceMatchUtils';
import { getCachedAprLotsForDateRange } from '../../../../db/parkingCache';
import { withAvailabilityScore } from '../../shared/availability';
import { googleMapsSearchUrl } from '../../shared/urls';

function scoreAprParkingOption(p: ParkingOption): number {
  const price = p.price ?? 999;
  const shuttle = p.shuttleMinutes ?? p.transferToTerminalMinutes ?? 15;
  const coveredBonus = p.covered ? 2 : 0;

  return price + shuttle * 0.75 - coveredBonus;
}

export function isAprOption(p: ParkingOption): boolean {
  return p.bookingProvider === 'AirportParkingReservations' || p.sourceName === 'AirportParkingReservations';
}

function aprLotRouteDestination(lotName: string, airportLabel: string): string {
  const cleanedName = cleanParkingProviderInventoryName(lotName) || lotName;
  return `${cleanedName}, ${airportLabel}`;
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
  serviceAirportCode: string,
  airportLabel: string,
  availabilityStatus: 'available' | 'unavailable' | 'unknown' = 'unknown',
): ParkingOption {
  const lower = lot.lotName.toLowerCase();
  const covered = lower.includes('covered') || lot.rawSnippet?.toLowerCase().includes('covered') || false;

  const option: ParkingOption = {
    id: `${serviceAirportCode.toLowerCase()}-apr-${lower.replace(/[^a-z0-9]+/g, '-')}`,
    name: lot.lotName,
    serviceAirportCode: serviceAirportCode.toUpperCase(),
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
    routeDestination: aprLotRouteDestination(lot.lotName, airportLabel),
    mapLink: googleMapsSearchUrl(aprLotRouteDestination(lot.lotName, airportLabel)),
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

export async function buildAprParkingOptions(args: {
  airportCode: string;
  checkInDate?: string;
  checkOutDate?: string;
}): Promise<ParkingOption[]> {
  const airportCode = args.airportCode.toUpperCase();
  const airport = getAirportById(airportCode);

  const cachedAprLots =
    airportCode === 'SEA'
      ? await getCachedAprLotsForDateRange({
        airportCode,
        checkInDate: args.checkInDate,
        checkOutDate: args.checkOutDate,
      }).catch((error) => {
        console.warn('Cached APR lots unavailable; continuing without APR cache', error);
        return [];
      })
      : [];

  const aprSeedLots = cachedAprLots.map((lot) => ({
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

  const availabilityByUrl: Record<
    string,
    {
      available: boolean;
      status: 'available' | 'unavailable' | 'unknown';
      livePrice: number | null;
      lotId: number | null;
    }
  > = {};

  const aprLotsWithAvailability = aprSeedLots.map((lot) => ({
    lot,
    availability: availabilityByUrl[lot.bookingUrl] ?? {
      available: true,
      status: 'unknown' as const,
      livePrice: null,
      lotId: null,
    },
  }));

  return aprLotsWithAvailability
    .filter((x) => {
      const lotName = x.lot.lotName.toLowerCase();

      if (lotName.includes('doubletree')) {
        return x.availability.status === 'available';
      }

      return x.availability.status !== 'unavailable';
    })
    .map((x) => {
      const option = aprLotToParkingOption(
        x.lot,
        airportCode,
        airport?.label ?? `${airportCode} Airport`,
        x.availability.status,
      );

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
}
