import { AIRPORT_ENRICHMENT, ENRICHED_AIRPORT_CODES } from './enrichment';
import { airportLookupService } from './lookupService';

export function buildSupabaseAirportSeedRows() {
  return Object.entries(AIRPORT_ENRICHMENT).map(([code, enrichment], index) => {
    const airport = airportLookupService.getAirportByCode(code);

    return {
      airport_code: code,
      iata: code,
      icao: airport?.icao ?? null,
      name: airport?.label ?? enrichment.destinationName ?? code,
      city: airport?.city ?? null,
      state: airport?.state ?? null,
      country: 'US',
      latitude: airport?.geoLocation.lat ?? 0,
      longitude: airport?.geoLocation.lng ?? 0,
      destination_name: enrichment.destinationName ?? null,
      routing_address: enrichment.routingAddress ?? null,
      parking_search_query: enrichment.parkingSearchQuery ?? null,
      rideshare_destination_name: enrichment.rideshareDestinationName ?? null,
      checkin_note: enrichment.checkinNote ?? null,
      generic_guidance: enrichment.genericGuidance ?? null,
      official_parking_url: enrichment.officialParkingUrl ?? null,
      official_airport_url: enrichment.officialAirportUrl ?? null,
      indoor_map: enrichment.indoorMap ?? null,
      sort_order: index + 1,
      is_active: true,
    };
  });
}

export type AirportDirectoryEntry = {
  id: string;
  code: string;
  name: string;
  city?: string | null;
  state?: string | null;
  description?: string;
};

export async function getAirportsForDirectory(): Promise<AirportDirectoryEntry[]> {
  const popular = await getAirportsFromRepository();

  const enriched: AirportDirectoryEntry[] = ENRICHED_AIRPORT_CODES.flatMap((code) => {
    const airport = airportLookupService.getAirportByCode(code);
    if (!airport) return [];

    return [{
      id: airport.id,
      code: airport.id,
      name: airport.label,
      city: airport.city ?? null,
      state: airport.state ?? null,
      description: airport.genericGuidance ?? airport.checkinNote,
    }];
  });

  const seen = new Set(enriched.map((entry) => entry.code));
  for (const airport of popular) {
    if (seen.has(airport.id)) continue;
    enriched.push({
      id: airport.id,
      code: airport.id,
      name: airport.label,
      city: airport.city ?? null,
      state: airport.state ?? null,
      description: airport.genericGuidance,
    });
    if (enriched.length >= 24) break;
  }

  return enriched;
}

async function getAirportsFromRepository() {
  const { getAirports } = await import('./repository');
  return getAirports();
}
