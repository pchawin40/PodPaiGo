import { airportLookupService } from './lookupService';
import { refreshFromDatabase } from './serverLookupService';
import type { AirportInfo } from './types';
import bundledAirports from '../../data/airports-us.generated.json';
import type { NationalAirportRecord } from './records';

const MIN_NATIONAL_AIRPORT_RECORDS = 500;

function ensureBundledNationalCatalog(): void {
  airportLookupService.ensureLoaded();
  if (airportLookupService.getAllRecords().length >= MIN_NATIONAL_AIRPORT_RECORDS) {
    return;
  }

  airportLookupService.loadRecords(bundledAirports as NationalAirportRecord[]);
}

export async function getAirports(): Promise<AirportInfo[]> {
  ensureBundledNationalCatalog();
  await refreshFromDatabase().catch(() => false);
  ensureBundledNationalCatalog();
  return airportLookupService.getPopularAirports(50);
}

export async function getAirportByIdDynamic(id: string): Promise<AirportInfo | null> {
  ensureBundledNationalCatalog();
  await refreshFromDatabase().catch(() => false);
  ensureBundledNationalCatalog();
  return airportLookupService.getAirportByCode(id);
}

export async function searchAirports(query: string, limit = 10): Promise<AirportInfo[]> {
  ensureBundledNationalCatalog();
  await refreshFromDatabase().catch(() => false);
  ensureBundledNationalCatalog();
  return airportLookupService.searchAirports(query, limit);
}
