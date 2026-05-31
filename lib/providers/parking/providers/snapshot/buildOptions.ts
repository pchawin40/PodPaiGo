import type { ParkingOption } from '../../../../types';
import { getAirportById } from '../../../../airports/catalog';
import { getLatestParkingPriceSnapshots } from '../../../../db/parkingCache';
import { withAvailabilityScore } from '../../shared/availability';
import { googleMapsSearchUrl } from '../../shared/urls';

export function buildSnapshotParkingOptions(args: {
  airportCode: string;
  snapshots: Awaited<ReturnType<typeof getLatestParkingPriceSnapshots>>;
}): ParkingOption[] {
  const airportCode = args.airportCode.toUpperCase();
  const airport = getAirportById(airportCode);

  return args.snapshots
    .filter((s) => typeof s.priceDaily === 'number' && s.priceDaily > 0)
    .map((s) =>
      withAvailabilityScore({
        id: `${airportCode.toLowerCase()}-${s.source}-${s.lotName
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
        serviceAirportCode: airportCode,
        mapLink: googleMapsSearchUrl(`${s.lotName} ${airport?.label ?? airportCode}`),
        routeDestination: `${s.lotName}, ${airport?.label ?? airportCode}`,
        lastUpdated: s.fetchedAt,
        parkingBufferMinutes: 15,
        transferToTerminalMinutes: 12,
        transferType: 'shuttle',
        shuttleMinutes: 12,
        assumptions: [
          'Price loaded from cached selected-date parking price snapshot.',
        ],
        bestFor: ['Live Price', s.source || 'Provider'].filter(Boolean),
      }),
    );
}
