import { AIRPORTS_FALLBACK_CATALOG } from './fallbackCatalog';
import { AirportInfo } from './types';

export async function getAirports(): Promise<AirportInfo[]> {
  try {
    // fetch from Supabase here
    // if successful, map snake_case DB rows to camelCase AirportInfo
  } catch {
    return AIRPORTS_FALLBACK_CATALOG;
  }

  return AIRPORTS_FALLBACK_CATALOG;
}

export async function getAirportByIdDynamic(id: string): Promise<AirportInfo | null> {
  const airports = await getAirports();
  return airports.find((a) => a.id.toUpperCase() === id.toUpperCase()) || null;
}