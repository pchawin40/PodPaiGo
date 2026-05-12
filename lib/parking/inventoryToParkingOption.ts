import { ParkingOption } from '../types';
import { ParkingLotInventoryRow } from './inventory';
import { getAirportById } from '../airports/catalog';
import { cleanParkingProviderInventoryName } from './googlePlaceMatchUtils';

function googleMapsDirectionsUrl(origin: string, destination: string): string {
    return `https://www.google.com/maps/dir/${encodeURIComponent(origin)}/${encodeURIComponent(destination)}`;
}

function inferCovered(name: string): boolean {
    const lower = name.toLowerCase();
    return lower.includes('garage') || lower.includes('covered');
}

function inferOfficial(name: string): boolean {
    const lower = name.toLowerCase();

    return (
        lower.includes('official') ||
        lower.includes('terminal') ||
        lower.includes('airport garage') ||
        lower.includes('parking garage') && lower.includes('international airport') ||
        lower.includes('main garage') ||
        lower.includes('central parking')
    );
}

function estimateTransferMinutes(name: string, distanceMiles?: number): number {
    const lower = name.toLowerCase();

    if (inferOfficial(name)) return 5;
    if (lower.includes('shuttle')) return 12;
    if ((distanceMiles ?? 99) <= 0.8) return 8;
    if ((distanceMiles ?? 99) <= 1.5) return 12;
    return 15;
}

export function inventoryLotToParkingOption(args: {
    lot: ParkingLotInventoryRow;
    origin: string;
}): ParkingOption {
    const { lot, origin } = args;
    const cleanedName = cleanParkingProviderInventoryName(lot.name) || lot.name;

    const destination =
        lot.address ||
        `${cleanedName}, ${lot.airportCode} Airport`;

    const official = lot.isOfficial || inferOfficial(lot.name);
    const covered = inferCovered(lot.name);

    const transferToTerminalMinutes = estimateTransferMinutes(
        lot.name,
        lot.distanceMiles,
    );

    const airport = getAirportById(lot.airportCode);

    return {
        id: `inventory-${lot.id}`,
        name: lot.name,
        type: official ? 'official' : 'off-airport',

        price: 0,
        priceDisplay: 'check-live',
        priceUnit: undefined,
        priceNote: official
            ? 'Open the official airport parking site to confirm current selected-date price.'
            : 'Pricing not available — check provider for latest rate.',

        priceSource: 'marketplace-link',
        priceConfidence: 'low',
        bookingProvider: lot.source,

        distance: 0,
        availability: Math.round((lot.confidence ?? 0.5) * 100),
        trustStatus: 'estimated',
        routeUnavailable: false,

        sourceName: lot.source,
    sourceLink: official
            ? airport?.officialParkingUrl ?? lot.sourceUrl ?? undefined
            : lot.sourceUrl ?? undefined,
        mapLink: googleMapsDirectionsUrl(origin, destination),

        routeOrigin: origin,
        routeDestination: destination,
        address: lot.address ?? destination,
        normalizedAddress: lot.address ?? destination,
        lat: typeof lot.latitude === 'number' ? lot.latitude : undefined,
        lng: typeof lot.longitude === 'number' ? lot.longitude : undefined,
        lastUpdated: lot.updatedAt,

        parkingBufferMinutes: official ? 8 : 15,
        transferToTerminalMinutes,
        transferType: official ? 'walk' : 'shuttle',

        walkingMinutes: official ? 5 : 2,
        shuttleMinutes: official ? undefined : transferToTerminalMinutes,
        covered,

        reviewScore: undefined,
        reviewCount: undefined,
        availabilityScore: Math.round((lot.confidence ?? 0.5) * 100),

        assumptions: [
            'Discovered from airport-radius parking inventory.',
            lot.distanceMiles != null
                ? `Located about ${lot.distanceMiles.toFixed(1)} miles from airport.`
                : 'Distance unavailable.',
            'Pricing is not connected yet for this lot.',
        ],

        bestFor: [
            official ? 'Official airport parking' : '',
            covered ? 'Covered' : '',
            lot.distanceMiles != null && lot.distanceMiles <= 1 ? 'Close to airport' : '',
        ].filter(Boolean),
    };
}
