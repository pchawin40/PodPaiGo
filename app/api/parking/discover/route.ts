import { NextRequest, NextResponse } from 'next/server';
import { getAirportById } from '../../../../lib/airports/catalog';
import { saveParkingLots, ParkingLotInventoryInput } from '../../../../lib/parking/inventory';

export const runtime = 'nodejs';

type GooglePlace = {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    googleMapsUri?: string;
    location?: {
        latitude?: number;
        longitude?: number;
    };
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
};

function isParkingLike(place: GooglePlace): boolean {
    const name = place.displayName?.text?.toLowerCase() ?? '';

    return (
        name.includes('parking') ||
        name.includes('park') ||
        name.includes('garage') ||
        name.includes('valet') ||
        name.includes('shuttle')
    );
}

function confidenceForPlace(place: GooglePlace): number {
    let score = 0.5;

    if (place.businessStatus === 'OPERATIONAL') score += 0.2;
    if ((place.rating ?? 0) >= 4.2) score += 0.15;
    if ((place.userRatingCount ?? 0) >= 100) score += 0.15;

    return Math.min(score, 1);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const airportCode = String(body.airportCode ?? 'SEA').toUpperCase();
        const radiusMeters = Number(body.radiusMeters ?? 12000);

        const airport = getAirportById(airportCode);

        if (!airport?.geoLocation?.lat || !airport?.geoLocation?.lng) {
            return NextResponse.json(
                { error: `Unknown airport or missing coordinates: ${airportCode}` },
                { status: 400 },
            );
        }

        const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;

        if (!key) {
            return NextResponse.json(
                { error: 'Missing GOOGLE_MAPS_SERVER_API_KEY' },
                { status: 500 },
            );
        }

        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': key,
                'X-Goog-FieldMask': [
                    'places.id',
                    'places.displayName',
                    'places.formattedAddress',
                    'places.googleMapsUri',
                    'places.location',
                    'places.rating',
                    'places.userRatingCount',
                    'places.businessStatus',
                ].join(','),
            },
            body: JSON.stringify({
                textQuery: `airport parking near ${airport.label}`,
                locationBias: {
                    circle: {
                        center: {
                            latitude: airport.geoLocation.lat,
                            longitude: airport.geoLocation.lng,
                        },
                        radius: radiusMeters,
                    },
                },
            }),
            cache: 'no-store',
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Google Places failed: ${response.status}` },
                { status: 502 },
            );
        }

        const data = await response.json();
        const places: GooglePlace[] = Array.isArray(data.places) ? data.places : [];

        const lots: ParkingLotInventoryInput[] = places
            .filter(isParkingLike)
            .map((place) => {
                const name = place.displayName?.text ?? `${airportCode} Parking`;
                const lower = name.toLowerCase();

                return {
                    airportCode,
                    name,
                    address: place.formattedAddress ?? null,
                    latitude: place.location?.latitude ?? null,
                    longitude: place.location?.longitude ?? null,
                    source: 'google-places',
                    sourceId: place.id ?? null,
                    sourceUrl: place.googleMapsUri ?? null,
                    isOfficial:
                        lower.includes('official') ||
                        lower.includes('terminal') ||
                        lower.includes(`${airportCode.toLowerCase()} parking`),
                    confidence: confidenceForPlace(place),
                };
            });

        const saved = await saveParkingLots(lots);

        return NextResponse.json({
            ok: true,
            airportCode,
            radiusMeters,
            fetched: places.length,
            parkingLike: lots.length,
            saved,
            lots,
        });
    } catch (error) {
        console.error('[parking discover] failed', error);

        return NextResponse.json(
            { error: 'Parking discovery failed' },
            { status: 500 },
        );
    }
}