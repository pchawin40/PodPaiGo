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

export type AggregateAirportParkingArgs = {
  airportCode?: string;
  airportCoordinates?: { lat: number; lng: number };
  destination: string;
  checkInDate?: string;
  checkOutDate?: string;
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
    },
    {
      inventoryOptions: optionsForProvider(results, 'inventory'),
      parkWhizOptions: optionsForProvider(results, 'parkwhiz'),
      aprOptions: optionsForProvider(results, 'apr'),
      liveGoogleOptions: optionsForProvider(results, 'google'),
      snapshotOptions: optionsForProvider(results, 'snapshot'),
      marketplaceOptions: optionsForProvider(results, 'marketplace'),
      latestPriceSnapshots,
    },
  );

  const annotated = merged.map((option) =>
    annotateParkingForAirport(option, airportCode, airportCoordinates),
  );

  return filterParkingByAirport(annotated, airportCode, airportCoordinates);
}

export async function aggregateAirportParkingOptions(
  args: AggregateAirportParkingArgs,
): Promise<ParkingOption[]> {
  return withParkingSearchCache(args, () => aggregateAirportParkingOptionsUncached(args));
}
