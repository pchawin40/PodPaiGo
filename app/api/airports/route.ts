import { NextResponse } from 'next/server';
import { AIRPORTS_CATALOG } from '../../../lib/airports/catalog';

type SupabaseAirportRow = {
    id: string;
    label: string;
    destination_name?: string | null;
    routing_address?: string | null;
    parking_search_query?: string | null;
    rideshare_destination_name?: string | null;
    lat: number;
    lng: number;
    checkin_note?: string | null;
    generic_guidance?: string | null;
    official_parking_url?: string | null;
    official_airport_url?: string | null;
    indoor_map?: unknown;
    airport_map_url?: string | null;
    airport_map_label?: string | null;
};

export async function GET() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ airports: AIRPORTS_CATALOG, source: 'fallback' });
        }

        const res = await fetch(`${supabaseUrl}/rest/v1/airports?is_active=eq.true&order=sort_order.asc`, {
            headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
            },
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json({ airports: AIRPORTS_CATALOG, source: 'fallback' });
        }

        const rows = (await res.json()) as SupabaseAirportRow[];

        const airports = rows.map((row) => ({
            id: row.id,
            label: row.label,
            destinationName: row.destination_name,
            routingAddress: row.routing_address,
            parkingSearchQuery: row.parking_search_query,
            rideshareDestinationName: row.rideshare_destination_name,
            geoLocation: { lat: row.lat, lng: row.lng },
            checkinNote: row.checkin_note,
            genericGuidance: row.generic_guidance,
            officialParkingUrl: row.official_parking_url,
            officialAirportUrl: row.official_airport_url,
            indoorMap: row.indoor_map,
            airportMapUrl: row.airport_map_url,
            airportMapLabel: row.airport_map_label,
        }));

        return NextResponse.json({ airports, source: 'supabase' });
    } catch {
        return NextResponse.json({ airports: AIRPORTS_CATALOG, source: 'fallback' });
    }
}
