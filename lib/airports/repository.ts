import { airportLookupService } from './lookupService';
import type { AirportInfo } from './types';

export async function getAirports(): Promise<AirportInfo[]> {
  await airportLookupService.refreshFromDatabase().catch(() => false);
  airportLookupService.ensureLoaded();
  return airportLookupService.getPopularAirports(50);
}

export async function getAirportByIdDynamic(id: string): Promise<AirportInfo | null> {
  await airportLookupService.refreshFromDatabase().catch(() => false);
  return airportLookupService.getAirportByCode(id);
}

export async function searchAirports(query: string, limit = 10): Promise<AirportInfo[]> {
  await airportLookupService.refreshFromDatabase().catch(() => false);
  return airportLookupService.searchAirports(query, limit);
}
