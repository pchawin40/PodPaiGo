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
import type { ParkingSearchContext } from './types';
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
    checkInDate: args.checkInDate,
    checkOutDate: args.checkOutDate,
    checkInAt: args.checkInAt,
    checkOutAt: args.checkOutAt,
  };
}

function optionsForProvider(
  results: Awaited<ReturnType<typeof parkingProviderRegistry.executeSearch>>,
  providerId: string,
): ParkingOption[] {
  return results.find((result) => result.providerId === providerId)?.options ?? [];
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

  const [results, latestPriceSnapshots] = await Promise.all([
    parkingProviderRegistry.executeSearch(context),
    getParkingPriceSnapshotsCached({
      airportCode,
      checkInDate: args.checkInDate,
      checkOutDate: args.checkOutDate,
    }),
  ]);

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
