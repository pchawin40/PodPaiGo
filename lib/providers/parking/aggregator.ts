import type { ParkingOption } from '../../types';
import { getAirportById } from '../../airports/catalog';
import {
  annotateParkingForAirport,
  filterParkingByAirport,
} from '../../parking/airportValidation';
import { parkingProviderRegistry } from './registry';
import { registerDefaultParkingProviders } from './registerDefaults';
import { mergeLiveParkingSourceResults } from './merge';
import { getParkingPriceSnapshotsCached } from './shared/snapshots';
import { withParkingSearchCache } from './searchCache';
import type { ParkingProviderSearchResult, ParkingSearchContext } from './types';
import { debugLog } from '../../utils/debug';

export type AggregateAirportParkingArgs = {
  airportCode?: string;
  airportCoordinates?: { lat: number; lng: number };
  destination: string;
  checkInDate?: string;
  checkOutDate?: string;
  checkInAt?: string;
  checkOutAt?: string;
};

function toSearchContext(args: AggregateAirportParkingArgs): ParkingSearchContext {
  const airportCode = (args.airportCode || 'SEA').toUpperCase();
  const airport = getAirportById(airportCode);

  return {
    airportCode,
    airportCoordinates: args.airportCoordinates ?? airport?.geoLocation,
    destination: args.destination,
    destinationKind: 'airport',
    checkInDate: args.checkInDate,
    checkOutDate: args.checkOutDate,
    checkInAt: args.checkInAt,
    checkOutAt: args.checkOutAt,
  };
}

function optionsForProvider(
  results: ParkingProviderSearchResult[],
  providerId: string,
): ParkingOption[] {
  return results.find((result) => result.providerId === providerId)?.options ?? [];
}

function readPositiveMs(name: string, fallback: number): number {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function getProviderPartialTimeoutMs(): number {
  const configured = Number(process.env.PARKING_PROVIDER_PARTIAL_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;

  const overall = readPositiveMs('PARKING_FETCH_TIMEOUT_MS', 15000);
  return Math.max(1000, overall - 1000);
}

function getSnapshotCriticalTimeoutMs(): number {
  return readPositiveMs('PARKING_CRITICAL_SNAPSHOT_TIMEOUT_MS', 350);
}

async function withFallbackTimeout<T>(
  label: string,
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      debugLog('parking_noncritical_timeout', { label, timeoutMs });
      resolve(fallback);
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        debugLog('parking_noncritical_failed', {
          label,
          message: error instanceof Error ? error.message : String(error),
        });
        resolve(fallback);
      },
    );
  });
}

async function aggregateAirportParkingOptionsUncached(
  args: AggregateAirportParkingArgs,
): Promise<ParkingOption[]> {
  registerDefaultParkingProviders();

  const airportCode = (args.airportCode || 'SEA').toUpperCase();
  const airport = getAirportById(airportCode);
  const airportCoordinates = args.airportCoordinates ?? airport?.geoLocation;
  const context = toSearchContext(args);
  debugLog('parking_fetch_start', {
    tripType: 'airport',
    destinationKind: 'airport',
    airportCode,
    destination: args.destination,
  });

  const snapshotPromise = getParkingPriceSnapshotsCached({
    airportCode,
    checkInDate: args.checkInDate,
    checkOutDate: args.checkOutDate,
  });

  const [providerSearch, latestPriceSnapshots] = await Promise.all([
    parkingProviderRegistry.executeSearchPartial(context, getProviderPartialTimeoutMs()),
    withFallbackTimeout(
      'latest_price_snapshots',
      snapshotPromise,
      getSnapshotCriticalTimeoutMs(),
      [],
    ),
  ]);
  const results = providerSearch.results;

  const merged = await mergeLiveParkingSourceResults(
    {
      airportCode,
      airportCoordinates,
      checkInDate: args.checkInDate,
      checkOutDate: args.checkOutDate,
      checkInAt: args.checkInAt,
      checkOutAt: args.checkOutAt,
    },
    {
      inventoryOptions: optionsForProvider(results, 'inventory'),
      parkWhizOptions: optionsForProvider(results, 'parkwhiz'),
      aprOptions: optionsForProvider(results, 'apr'),
      liveGoogleOptions: optionsForProvider(results, 'google'),
      snapshotOptions: optionsForProvider(results, 'snapshot'),
      marketplaceOptions: optionsForProvider(results, 'marketplace'),
      communityOptions: optionsForProvider(results, 'community-free'),
      latestPriceSnapshots,
    },
  );

  const annotated = merged.map((option) =>
    annotateParkingForAirport(option, airportCode, airportCoordinates),
  );

  const filtered = filterParkingByAirport(annotated, airportCode, airportCoordinates);
  debugLog('airport_parking_fetch_summary', {
    tripType: 'airport',
    destinationKind: 'airport',
    airportCode,
    providerCount: results.length,
    providerSearchTimedOut: providerSearch.timedOut,
    providerResults: results.map((result) => ({
      providerId: result.providerId,
      resultCount: result.options.length,
      healthStatus: result.health.status,
      error: result.error,
    })),
    mergedCount: merged.length,
    finalResultCount: filtered.length,
    fallbackUsed: latestPriceSnapshots.length > 0,
  });
  debugLog('parking_fetch_summary', {
    tripType: 'airport',
    destinationKind: 'airport',
    airportCode,
    resultCount: filtered.length,
  });

  return filtered;
}

export async function aggregateAirportParkingOptions(
  args: AggregateAirportParkingArgs,
): Promise<ParkingOption[]> {
  return withParkingSearchCache(args, () => aggregateAirportParkingOptionsUncached(args));
}
