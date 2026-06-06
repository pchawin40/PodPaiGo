import type { ParkingOption } from '../../types';
import { getLatestParkingPriceSnapshots } from '../../db/parkingCache';
import { enrichInventoryOptionsWithPrices as enrichInventoryOptionsWithPricesImpl } from '../../parking/priceMatcher';
import { normalizeParkingPriceForTrip } from '../../parking/parkingPriceNormalizer';
import { withStableParkingRouteStatus } from '../../parking/routeStatus';
import { isLiveParkWhizOption } from '../../parking/parkWhizMatch';
import { dedupeParkingOptions } from './shared/dedupe';
import { withAvailabilityScore } from './shared/availability';
import { getParkingPriceSnapshotsCached } from './shared/snapshots';
import { buildSnapshotParkingOptions } from './providers/snapshot/buildOptions';
import { inferPriceFreshness } from './types';
import { isLiveGoogleParkingDiscoveryEnabled } from '../../parking/parkingDiscoveryMode';
import { SHOWING_CACHED_PROVIDER_DATA_MESSAGE } from '../../parking/googlePlacesSafeMode';
import { validateParkingInventoryOption } from '../../parking/inventoryValidation';
import { buildSeaOfficialParkingOptions } from '../../parking/seaOfficialParking';
import { debugLog } from '../../utils/debug';

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

function applySafeModeProviderLabels(options: ParkingOption[]): ParkingOption[] {
  if (isLiveGoogleParkingDiscoveryEnabled()) return options;

  return options.map((option) => ({
    ...option,
    priceFreshness: option.priceFreshness ?? inferPriceFreshness(option),
    assumptions: [
      ...(option.assumptions || []),
      SHOWING_CACHED_PROVIDER_DATA_MESSAGE,
    ],
  }));
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
    if (isLiveParkWhizOption(option)) return option;

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
  communityOptions: ParkingOption[];
  latestPriceSnapshots: Awaited<ReturnType<typeof getLatestParkingPriceSnapshots>>;
};

export async function mergeLiveParkingSources(
  args: {
    airportCode: string;
    checkInDate?: string;
    checkOutDate?: string;
    checkInAt?: string;
    checkOutAt?: string;
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
  const officialAirportOptions = buildSeaOfficialParkingOptions({
    airportCode,
    checkInAt: args.checkInAt,
    checkOutAt: args.checkOutAt,
  });

  const merged = dedupeParkingOptions([
    ...officialAirportOptions,
    ...parts.parkWhizOptions,
    ...parts.aprOptions,
    ...snapshotOptions,
    ...applyPriceSnapshotsToOptions(pricedInventoryOptions, latestPriceSnapshots),
    ...parts.communityOptions,
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

  const validated = merged.filter((option) => {
    const result = validateParkingInventoryOption(option);
    if (!result.valid) {
      debugLog('parking_inventory_filtered', {
        reason: result.reason,
        airportCode,
        name: option.name,
        sourceName: option.sourceName,
        bookingProvider: option.bookingProvider,
        sourceLink: option.sourceLink,
      });
      return false;
    }
    return true;
  });

  return applySafeModeProviderLabels(validated);
}

export async function mergeLiveParkingSourceResults(
  args: {
    airportCode: string;
    airportCoordinates?: { lat: number; lng: number };
    checkInDate?: string;
    checkOutDate?: string;
    checkInAt?: string;
    checkOutAt?: string;
  },
  parts: LiveParkingSourceParts,
): Promise<ParkingOption[]> {
  return mergeLiveParkingSources(
    {
      airportCode: args.airportCode,
      checkInDate: args.checkInDate,
      checkOutDate: args.checkOutDate,
      checkInAt: args.checkInAt,
      checkOutAt: args.checkOutAt,
    },
    parts,
  );
}
