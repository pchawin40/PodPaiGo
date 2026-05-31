/**
 * Canonical national airport record (database + bundled import shape).
 */
export type NationalAirportRecord = {
  airportCode: string;
  iata: string | null;
  icao: string | null;
  name: string;
  city: string | null;
  state: string | null;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
  airportType?: string | null;
  keywords?: string | null;
  isActive?: boolean;
};

export type AirportSearchResult = NationalAirportRecord & {
  score?: number;
};
