import { ParkingOption } from '../types';
import { getAirportById } from '../airports/catalog';
import {
    getCachedParkWhizQuotes,
    saveParkWhizQuotes,
} from '../db/parkingCache';
import { debugLog } from '../utils/debug';
import { withStableParkingRouteStatus } from '../parking/routeStatus';

type ParkWhizAmenity = {
    name?: string;
    key?: string;
    enabled?: boolean;
    visible?: boolean;
};

type ParkWhizPurchaseOption = {
    id?: string;
    name?: string;
    base_price?: { USD?: string };
    price?: { USD?: string };
    fees?: Array<{
        price?: { USD?: string };
        type?: string;
        label?: string;
    }>;
    space_availability?: {
        status?: string;
    };
    amenities?: ParkWhizAmenity[];
    disclaimers?: string[];
    pickup_instructions?: string;
    dropoff_instructions?: string;
    cancellable_status?: {
        cancellable_now?: boolean;
        message?: string;
    };
    _links?: {
        'site:purchase'?: {
            href?: string;
        };
    };
};

type ParkWhizQuote = {
    location_id?: string;
    type?: string;
    distance?: {
        straight_line?: {
            meters?: number;
            feet?: number;
        };
    };
    purchase_options?: ParkWhizPurchaseOption[];
    _embedded?: {
        'pw:location'?: {
            id?: string;
            name?: string;
            address1?: string;
            city?: string;
            state?: string;
            postal_code?: string;
            country?: string;
            currency?: string;
            entrances?: Array<{
                coordinates?: [number, number];
            }>;
        };
    };
};

function moneyToNumber(value?: string): number | null {
    if (!value) return null;

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function hasAmenity(option: ParkWhizPurchaseOption, key: string): boolean {
    return Boolean(option.amenities?.some((amenity) => amenity.key === key && amenity.enabled));
}

function getAmenity(option: ParkWhizPurchaseOption, key: string): ParkWhizAmenity | undefined {
    return option.amenities?.find((amenity) => amenity.key === key);
}

function buildParkWhizUrl(path?: string): string | undefined {
    if (!path) return undefined;
    if (path.startsWith('http')) return path;

    return `https://www.parkwhiz.com${path}`;
}

function googleMapsSearchUrl(query: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function extractMinutes(text: string | undefined): number | null {
    if (!text) return null;

    const lower = text.toLowerCase();

    const rangeMatch = lower.match(/(\d+)\s*[–-]\s*(\d+)\s*min/);
    if (rangeMatch) {
        const low = Number(rangeMatch[1]);
        const high = Number(rangeMatch[2]);
        if (Number.isFinite(low) && Number.isFinite(high)) {
            return Math.ceil((low + high) / 2);
        }
    }

    const singleMatch = lower.match(/(\d+)\s*min/);
    if (singleMatch) {
        const minutes = Number(singleMatch[1]);
        if (Number.isFinite(minutes)) return minutes;
    }

    return null;
}

function getShuttleNote(option: ParkWhizPurchaseOption): string | undefined {
    return option.disclaimers?.find((text) => text.toLowerCase().includes('shuttle'));
}

function normalizeAvailability(status?: string): ParkingOption['availabilityStatus'] {
    if (status === 'available') return 'available';
    if (status === 'unavailable') return 'unavailable';

    return 'unknown';
}

function estimateAvailabilityScore(status: ParkingOption['availabilityStatus']): number {
    if (status === 'available') return 90;
    if (status === 'unavailable') return 0;

    return 50;
}

function normalizeParkWhizQuoteToParkingOptions(args: {
    quote: ParkWhizQuote;
    airportCode: string;
}): ParkingOption[] {
    const { quote, airportCode } = args;
    const location = quote._embedded?.['pw:location'];
    const locationName = location?.name ?? 'ParkWhiz Airport Parking';
    const address = [
        location?.address1,
        location?.city,
        location?.state,
        location?.postal_code,
    ]
        .filter(Boolean)
        .join(', ');

    const mapQuery = address || `${locationName} ${airportCode}`;
    const distanceFeet = quote.distance?.straight_line?.feet;
    const distanceMiles =
        typeof distanceFeet === 'number' ? Number((distanceFeet / 5280).toFixed(1)) : null;

    return (quote.purchase_options ?? []).map((option) => {
        const totalPrice = moneyToNumber(option.price?.USD);
        const basePrice = moneyToNumber(option.base_price?.USD);
        const availabilityStatus = normalizeAvailability(option.space_availability?.status);
        const shuttleNote = getShuttleNote(option);
        const pickupText = option.pickup_instructions;
        const dropoffText = option.dropoff_instructions;

        const shuttleMinutes =
            extractMinutes(shuttleNote) ??
            extractMinutes(pickupText) ??
            extractMinutes(dropoffText) ??
            12;

        const walkingMinutes =
            extractMinutes(
                [shuttleNote, pickupText, dropoffText]
                    .filter(Boolean)
                    .find((text) => text?.toLowerCase().includes('walk'))
            ) ?? 5;

        const hasShuttle =
            Boolean(shuttleNote) ||
            Boolean(pickupText?.toLowerCase().includes('shuttle')) ||
            Boolean(dropoffText?.toLowerCase().includes('shuttle'));

        const bookingUrl = buildParkWhizUrl(option._links?.['site:purchase']?.href);
        const covered = hasAmenity(option, 'indoor');
        const evCharging = hasAmenity(option, 'vehicle_charging');
        const accessible = hasAmenity(option, 'handicap');
        const attended = hasAmenity(option, 'attended');
        const security = hasAmenity(option, 'security');

        const transferToTerminalMinutes = hasShuttle ? shuttleMinutes : walkingMinutes;

        return {
            id: `parkwhiz-${quote.location_id}-${option.id}`,
            name: `${locationName}${option.name ? ` - ${option.name}` : ''}`,
            serviceAirportCode: airportCode.toUpperCase(),
            distanceToAirport: distanceMiles ?? undefined,
            type: 'off-airport',
            price: totalPrice ?? basePrice ?? 999,
            priceDisplay: totalPrice ? 'live' : 'check-live',
            priceUnit: 'total',
            priceNote: totalPrice
                ? 'Live ParkWhiz total for the selected parking dates. Daily display is calculated by the app.'
                : 'Open ParkWhiz to confirm selected-date price.',
            priceSource: 'marketplace-link',
            priceConfidence: totalPrice ? 'high' : 'low',

            distance: transferToTerminalMinutes,
            availability: estimateAvailabilityScore(availabilityStatus),
            trustStatus: totalPrice ? 'live' : 'estimated',
            routeUnavailable: false,
            sourceName: 'ParkWhiz',
            sourceLink: bookingUrl,
            mapLink: googleMapsSearchUrl(mapQuery),
            address: address || undefined,
            normalizedAddress: address || undefined,
            routeDestination: address || undefined,
            lastUpdated: new Date().toISOString(),

            parkingBufferMinutes: 15,
            transferToTerminalMinutes,
            transferType: hasShuttle ? 'shuttle' : 'walk',
            walkingMinutes,
            shuttleMinutes: hasShuttle ? shuttleMinutes : undefined,

            covered,
            bookingProvider: 'ParkWhiz',
            availabilityStatus,
            isAvailable: availabilityStatus !== 'unavailable',
            availabilityScore: estimateAvailabilityScore(availabilityStatus),

            assumptions: [
                'Live bookable off-airport parking quote from ParkWhiz.',
                address ? `Lot address: ${address}` : 'Lot address unavailable from provider.',
                distanceMiles !== null
                    ? `Straight-line distance from airport coordinates: about ${distanceMiles} miles.`
                    : 'Distance unavailable from provider.',
                shuttleNote || 'Open ParkWhiz to verify shuttle details and final booking terms.',
                option.cancellable_status?.message || 'Cancellation policy unavailable from provider.',
            ].filter(Boolean),

            bestFor: [
                totalPrice && totalPrice < 130 ? 'Cheapest live quote' : '',
                covered ? 'Covered' : '',
                evCharging ? 'EV Charging' : '',
                accessible ? 'Accessible' : '',
                attended ? 'Attended' : '',
                security ? 'Security' : '',
                hasShuttle ? 'Shuttle' : 'Walkable',
                getAmenity(option, 'indoor')?.visible && !covered ? 'Uncovered' : '',
            ].filter(Boolean),
        };
    });
}

function toParkWhizDateTime(value: string, fallbackTime: string): string {
    // Already has a time, like 2026-06-15T12:00
    if (value.includes('T')) {
        return value.slice(0, 16);
    }

    // Date-only from your trip flow, like 2026-05-04
    return `${value}T${fallbackTime}`;
}

export async function getParkWhizParkingOptions(args: {
    airportCode: string;
    airportCoordinates?: { lat: number; lng: number };
    checkInDate?: string;
    checkOutDate?: string;
}): Promise<ParkingOption[]> {
    const airportCode = args.airportCode.toUpperCase();
    const airport = getAirportById(airportCode);
    const geoLocation = args.airportCoordinates ?? airport?.geoLocation;

    if (!geoLocation?.lat || !geoLocation?.lng) return [];
    if (!args.checkInDate || !args.checkOutDate) return [];

    const startTime = toParkWhizDateTime(args.checkInDate, '12:00');
    const endTime = toParkWhizDateTime(args.checkOutDate, '12:00');
    const distanceMiles = 5;

    const cached = await getCachedParkWhizQuotes({
        airportCode,
        checkInAt: startTime,
        checkOutAt: endTime,
        distanceMiles,
    }).catch((error) => {
        console.warn('ParkWhiz cache read failed', error);
        return null;
    });

    if (cached?.options?.length) {
        return cached.options.map((option) => withStableParkingRouteStatus({
            ...option,
            serviceAirportCode: option.serviceAirportCode?.toUpperCase() ?? airportCode,
            priceUnit:
                option.sourceName === 'ParkWhiz' || option.bookingProvider === 'ParkWhiz'
                    ? 'total'
                    : option.priceUnit,
            priceNote:
                option.sourceName === 'ParkWhiz' || option.bookingProvider === 'ParkWhiz'
                    ? option.priceNote || 'Live ParkWhiz total for the selected parking dates. Daily display is calculated by the app.'
                    : option.priceNote,
        }));
    }

    const url = new URL('https://api.parkwhiz.com/v4/quotes/');
    url.searchParams.set(
        'q',
        `coordinates:${geoLocation.lat},${geoLocation.lng} distance:${distanceMiles}`
    );
    url.searchParams.set('start_time', startTime);
    url.searchParams.set('end_time', endTime);
    url.searchParams.set('returns', 'offstreet_bookable');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
        // console.log('[ParkWhiz] fetching', url.toString());

        const response = await fetch(url.toString(), {
            headers: {
                Accept: 'application/json',
            },
            cache: 'no-store',
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`ParkWhiz failed with HTTP ${response.status}`);
        }

        const json = (await response.json()) as unknown;

        if (!Array.isArray(json)) return [];

        const options = json.flatMap((quote) =>
            normalizeParkWhizQuoteToParkingOptions({
                quote: quote as ParkWhizQuote,
                airportCode,
            })
        );

        void saveParkWhizQuotes({
            airportCode,
            checkInAt: startTime,
            checkOutAt: endTime,
            distanceMiles,
            options,
            ttlHours: 24,
        }).catch((error) => {
            console.warn('ParkWhiz cache save failed', error);
        });

        // console.log('[ParkWhiz] fetched and cached', {
        //     airportCode: airport.id,
        //     startTime,
        //     endTime,
        //     count: options.length,
        // });

        return options;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('ParkWhiz request timed out');
            return [];
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
