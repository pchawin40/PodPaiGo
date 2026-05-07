import { NextResponse } from 'next/server';
import { AIRPORTS_CATALOG } from '../../../lib/airports/catalog';

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

        const rows = await res.json();

        const airports = rows.map((row: any) => ({
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