import type { ParkingOption } from '../../types';
import { getLatestParkingPriceSnapshots } from '../../db/parkingCache';
import { enrichInventoryOptionsWithPrices as enrichInventoryOptionsWithPricesImpl } from '../../parking/priceMatcher';
import { normalizeParkingPriceForTrip } from '../../parking/parkingPriceNormalizer';
import { withStableParkingRouteStatus } from '../../parking/routeStatus';
import { dedupeParkingOptions } from './shared/dedupe';
import { withAvailabilityScore } from './shared/availability';
import { getParkingPriceSnapshotsCached } from './shared/snapshots';
import { buildSnapshotParkingOptions } from './providers/snapshot/buildOptions';

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

export function applyPriceSnapshotsToOptions(
  options: ParkingOption[],
  snapshots: Awaited<ReturnType<typeof getLatestParkingPriceSnapshots>>,
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

export function enrichInventoryOptionsWithPrices(args: {
  inventoryOptions: ParkingOption[];
  pricedOptions: ParkingOption[];
}): ParkingOption[] {
  return enrichInventoryOptionsWithPricesImpl(args);
}

export type LiveParkingSourceParts = {
  inventoryOptions: ParkingOption[];
  parkWhizOptions: ParkingOption[];
  aprOptions: ParkingOption[];
  liveGoogleOptions: ParkingOption[];
  snapshotOptions: ParkingOption[];
  marketplaceOptions: ParkingOption[];
  latestPriceSnapshots: Awaited<ReturnType<typeof getLatestParkingPriceSnapshots>>;
};

export async function mergeLiveParkingSources(
  args: {
    airportCode: string;
    checkInDate?: string;
    checkOutDate?: string;
  },
  parts: LiveParkingSourceParts,
): Promise<ParkingOption[]> {
  const airportCode = args.airportCode.toUpperCase();

  const pricedProviderOptions = [
    ...parts.parkWhizOptions,
    ...parts.aprOptions,
  ];

  const pricedInventoryOptions = enrichInventoryOptionsWithPrices({
    inventoryOptions: parts.inventoryOptions,
    pricedOptions: pricedProviderOptions,
  });

  const latestPriceSnapshots = parts.latestPriceSnapshots.length > 0
    ? parts.latestPriceSnapshots
    : await getParkingPriceSnapshotsCached({
      airportCode,
      checkInDate: args.checkInDate,
      checkOutDate: args.checkOutDate,
    });

  const snapshotOptions = parts.snapshotOptions.length > 0
    ? parts.snapshotOptions
    : buildSnapshotParkingOptions({ airportCode, snapshots: latestPriceSnapshots });

  const discoveredLots = dedupeParkingOptions(parts.liveGoogleOptions);

  return dedupeParkingOptions([
    ...snapshotOptions,
    ...applyPriceSnapshotsToOptions(pricedInventoryOptions, latestPriceSnapshots),
    ...parts.parkWhizOptions,
    ...parts.aprOptions,
    ...discoveredLots,
    ...parts.marketplaceOptions.filter((option) => {
      const hasRealParkWhiz = parts.parkWhizOptions.some(
        (p) => p.sourceName === 'ParkWhiz' || p.bookingProvider === 'ParkWhiz',
      );

      if (
        hasRealParkWhiz &&
        (option.sourceName === 'ParkWhiz' || option.bookingProvider === 'ParkWhiz')
      ) {
        return false;
      }

      return true;
    }),
  ])
    .map((option) =>
      normalizeParkingPriceForTrip(option, args.checkInDate, args.checkOutDate),
    )
    .map(withStableParkingRouteStatus)
    .map(withAvailabilityScore);
}

export async function mergeLiveParkingSourceResults(
  args: {
    airportCode: string;
    airportCoordinates?: { lat: number; lng: number };
    checkInDate?: string;
    checkOutDate?: string;
  },
  parts: LiveParkingSourceParts,
): Promise<ParkingOption[]> {
  return mergeLiveParkingSources(
    {
      airportCode: args.airportCode,
      checkInDate: args.checkInDate,
      checkOutDate: args.checkOutDate,
    },
    parts,
  );
}
