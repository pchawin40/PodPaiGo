import { airportLookupService } from './lookupService';
import { refreshFromDatabase } from './serverLookupService';
import type { AirportInfo } from './types';

export async function getAirports(): Promise<AirportInfo[]> {
  await refreshFromDatabase().catch(() => false);
  airportLookupService.ensureLoaded();
  return airportLookupService.getPopularAirports(50);
}

export async function getAirportByIdDynamic(id: string): Promise<AirportInfo | null> {
  await refreshFromDatabase().catch(() => false);
  return airportLookupService.getAirportByCode(id);
}

export async function searchAirports(query: string, limit = 10): Promise<AirportInfo[]> {
  await refreshFromDatabase().catch(() => false);
  return airportLookupService.searchAirports(query, limit);
}
