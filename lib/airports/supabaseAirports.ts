import { AIRPORTS_CATALOG } from "./catalog";
import { getSupabaseClient } from "../supabase/client";

export type AirportListItem = {
  id: string;
  code: string;
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  status?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  sort_order?: number | null;
  official_airport_url?: string | null;
  official_parking_url?: string | null;
};

function fallbackAirports(): AirportListItem[] {
  return AIRPORTS_CATALOG.map((airport, index) => ({
    id: airport.id,
    code: airport.id,
    name: airport.label,
    status: index === 0 ? "primary draft airport" : "planned",
    description:
      index === 0
        ? "Current primary airport for the first public draft."
        : "Future airport support candidate.",
    is_active: true,
    sort_order: index + 1,
    official_airport_url: airport.officialAirportUrl,
    official_parking_url: airport.officialParkingUrl,
  }));
}

export async function getAirportsForDirectory(): Promise<AirportListItem[]> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return fallbackAirports();
  }

  const { data, error } = await supabase
    .from("airports")
    .select(
      "id, code, name, city, state, country, status, description, is_active, sort_order, official_airport_url, official_parking_url"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) {
    return fallbackAirports();
  }

  return data;
}