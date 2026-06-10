import { ParkingOption } from '../types';
import { getAirportById } from '../airports/catalog';
import {
    getCachedParkWhizQuotes,
    saveParkWhizQuotes,
} from '../db/parkingCache';
import { debugLog } from '../utils/debug';
import { withStableParkingRouteStatus } from '../parking/routeStatus';
import { haversineMiles } from '../parking/routeMinutes';
import {
    cacheGeocode,
    dedupeGeocodeRequest,
    getCachedGeocode,
} from '../apiUsage/geocodeCache';
import { canMakeLiveApiCall, recordApiUsage } from '../apiUsage/guard';
import { isProviderKillSwitchEnabled } from '../apiUsage/config';
import { getGoogleMapsServerApiKey } from '../env/googleMapsServerKey';

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
        'pw:location'?: ParkWhizLocation;
    };
};

type ParkWhizPhotoSize = {
    URL?: string;
    width?: number;
    height?: number;
};

type ParkWhizLocationPhoto = {
    position?: number;
    alt?: string;
    sizes?: Record<string, ParkWhizPhotoSize | undefined>;
};

type ParkWhizLocation = {
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
    photos?: ParkWhizLocationPhoto[];
};

type LatLng = { lat: number; lng: number };
type CityLotDistanceDecision = 'within_preferred' | 'backup' | 'excluded';

const WALK_SPEED_MPH = 3;

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

export function parkWhizLocationIdFromProviderLotId(value?: string | null): string | null {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) return trimmed;

    const match = trimmed.match(/^parkwhiz-(\d+)(?:-|$)/i);
    return match?.[1] || null;
}

export function parkWhizPhotoUrlFromLocation(
    location?: Pick<ParkWhizLocation, 'photos'> | null,
): string | null {
    const photos = [...(location?.photos || [])].sort(
        (a, b) => (a.position ?? 999) - (b.position ?? 999),
    );

    for (const photo of photos) {
        const sizes = photo.sizes || {};
        const url =
            sizes.gallery?.URL ||
            sizes.original?.URL ||
            sizes.venue_gallery?.URL ||
            sizes.hub_frontpage?.URL ||
            sizes.res_ticket?.URL ||
            sizes.search_thumb?.URL;

        if (url?.trim() && /^https:\/\//i.test(url)) {
            return url.trim();
        }
    }

    return null;
}

function googleMapsSearchUrl(query: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function walkMinutesForDistanceMiles(distanceMiles: number): number {
    if (!Number.isFinite(distanceMiles) || distanceMiles <= 0) return 2;
    return Math.max(2, Math.round((distanceMiles / WALK_SPEED_MPH) * 60));
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

function extractLocationCoordinates(location?: {
    entrances?: Array<{ coordinates?: [number, number] }>;
}): Partial<LatLng> {
    const coords = location?.entrances?.[0]?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
        return {};
    }

    const [first, second] = coords;
    if (typeof first !== 'number' || typeof second !== 'number') {
        return {};
    }

    // ParkWhiz returns GeoJSON order: [longitude, latitude]
    if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
        return { lat: first, lng: second };
    }

    return { lat: second, lng: first };
}

function buildParkWhizLocationAddress(location?: ParkWhizLocation): string {
    return [
        location?.address1,
        location?.city,
        location?.state,
        location?.postal_code,
    ]
        .filter(Boolean)
        .join(', ');
}

function quoteStraightLineDistanceMiles(quote: ParkWhizQuote): number | null {
    const meters = quote.distance?.straight_line?.meters;
    if (typeof meters === 'number' && Number.isFinite(meters)) {
        return meters / 1609.344;
    }

    const feet = quote.distance?.straight_line?.feet;
    if (typeof feet === 'number' && Number.isFinite(feet)) {
        return feet / 5280;
    }

    return null;
}

function preferredCityLotRadiusMiles(isEventVenue: boolean): number {
    return isEventVenue ? 1.0 : 0.75;
}

function maxCityLotRadiusMiles(isEventVenue: boolean): number {
    return isEventVenue ? 2.0 : 1.5;
}

function classifyCityLotDistance(
    distanceMiles: number | null,
    isEventVenue: boolean,
): CityLotDistanceDecision {
    if (distanceMiles == null) return 'within_preferred';
    if (distanceMiles <= preferredCityLotRadiusMiles(isEventVenue)) return 'within_preferred';
    if (distanceMiles <= maxCityLotRadiusMiles(isEventVenue)) return 'backup';
    return 'excluded';
}

function parkWhizCityLotGeocodeLimit(): number {
    const configured = Number(process.env.PARKWHIZ_CITY_LOT_GEOCODE_LIMIT);
    return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : 3;
}

async function geocodeParkWhizCityLotAddress(address: string): Promise<LatLng | null> {
    const cached = getCachedGeocode(address);
    if (cached) return cached;

    if (isProviderKillSwitchEnabled('geocoding')) return null;

    const apiKey = getGoogleMapsServerApiKey();
    if (!apiKey) return null;

    const budget = await canMakeLiveApiCall('geocoding');
    if (!budget.allowed) {
        debugLog('parkwhiz_city_lot_geocode_blocked', {
            address,
            blocked_by_budget: budget.reason !== 'kill_switch',
            reason: budget.reason,
        });
        return null;
    }

    return dedupeGeocodeRequest(address, async () => {
        try {
            await recordApiUsage('geocoding');
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
                address,
            )}&key=${apiKey}`;
            const response = await fetch(url);
            const data = (await response.json()) as {
                status?: string;
                results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
            };
            const loc = data.status === 'OK' ? data.results?.[0]?.geometry?.location : null;
            if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number') {
                const coords = { lat: loc.lat, lng: loc.lng };
                cacheGeocode(address, coords);
                return coords;
            }
        } catch {
            return null;
        }

        return null;
    });
}

function formatLiveParkWhizTotal(totalPrice: number): string {
    const rounded = Number.isInteger(totalPrice) ? String(Math.round(totalPrice)) : totalPrice.toFixed(2);
    return `Live $${rounded} total`;
}

function isParkWhizOption(option: ParkingOption): boolean {
    return option.sourceName === 'ParkWhiz' || option.bookingProvider === 'ParkWhiz';
}

function hasLiveParkWhizPrice(option: ParkingOption): boolean {
    return (
        isParkWhizOption(option) &&
        (option.priceDisplay === 'live' ||
            option.pricingConfidence === 'live' ||
            option.priceFreshness === 'live')
    );
}

function isParkWhizNoPriceSentinel(option: ParkingOption): boolean {
    return (
        isParkWhizOption(option) &&
        option.price === 999 &&
        option.priceDisplay === 'check-live' &&
        option.pricingConfidence === 'final_on_provider' &&
        option.priceConfidence === 'low'
    );
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

export function normalizeParkWhizQuoteToParkingOptions(args: {
    quote: ParkWhizQuote;
    airportCode?: string;
    mode?: 'airport' | 'city';
    destinationCoordinates?: LatLng;
    geocodedLotCoordinates?: LatLng | null;
    isEventVenue?: boolean;
}): ParkingOption[] {
    const {
        quote,
        airportCode,
        mode = 'airport',
        destinationCoordinates,
        geocodedLotCoordinates,
        isEventVenue = false,
    } = args;
    const isCity = mode === 'city';
    const location = quote._embedded?.['pw:location'];
    const locationName = location?.name ?? (mode === 'city' ? 'City Parking' : 'ParkWhiz Airport Parking');
    const address = buildParkWhizLocationAddress(location);

    const mapQuery = address || locationName;
    const quoteDistanceMiles = quoteStraightLineDistanceMiles(quote);
    const providerLotCoordinates = extractLocationCoordinates(location);
    const lotCoordinates = {
        lat: providerLotCoordinates.lat ?? geocodedLotCoordinates?.lat,
        lng: providerLotCoordinates.lng ?? geocodedLotCoordinates?.lng,
    };
    const coordinateDistanceMiles =
        isCity &&
        destinationCoordinates &&
        typeof lotCoordinates.lat === 'number' &&
        typeof lotCoordinates.lng === 'number'
            ? haversineMiles(
                  destinationCoordinates.lat,
                  destinationCoordinates.lng,
                  lotCoordinates.lat,
                  lotCoordinates.lng,
              )
            : null;
    const cityDistanceMiles = isCity ? coordinateDistanceMiles ?? quoteDistanceMiles : null;
    const distanceDecision = isCity
        ? classifyCityLotDistance(cityDistanceMiles, isEventVenue)
        : 'within_preferred';
    const airportDistanceMiles =
        !isCity && quoteDistanceMiles != null ? Number(quoteDistanceMiles.toFixed(1)) : null;
    const cityDistanceRounded =
        isCity && cityDistanceMiles != null ? Number(cityDistanceMiles.toFixed(2)) : undefined;
    const cityWalkMinutes =
        isCity && cityDistanceMiles != null ? walkMinutesForDistanceMiles(cityDistanceMiles) : undefined;
    const providerPhotoUrl = parkWhizPhotoUrlFromLocation(location);

    return (quote.purchase_options ?? []).flatMap((option) => {
        const totalPrice = moneyToNumber(option.price?.USD);
        const basePrice = moneyToNumber(option.base_price?.USD);
        const liveTotal = totalPrice ?? null;
        const displayPrice = liveTotal ?? basePrice;
        const hasLiveTotal = liveTotal != null;

        if (displayPrice == null) {
            debugLog('parkwhiz_quote_without_price_dropped', {
                locationId: quote.location_id ?? null,
                optionId: option.id ?? null,
                locationName,
                mode,
            });
            return [];
        }

        const availabilityStatus = normalizeAvailability(option.space_availability?.status);
        const shuttleNote = getShuttleNote(option);
        const pickupText = option.pickup_instructions;
        const dropoffText = option.dropoff_instructions;

        const shuttleMinutes =
            extractMinutes(shuttleNote) ??
            extractMinutes(pickupText) ??
            extractMinutes(dropoffText) ??
            12;

        const providerWalkingMinutes =
            extractMinutes(
                [shuttleNote, pickupText, dropoffText]
                    .filter(Boolean)
                    .find((text) => text?.toLowerCase().includes('walk'))
            );
        const walkingMinutes = isCity
            ? cityWalkMinutes ?? providerWalkingMinutes ?? undefined
            : providerWalkingMinutes ?? 5;

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

        return [{
            id: `parkwhiz-${quote.location_id}-${option.id}`,
            name: `${locationName}${option.name ? ` - ${option.name}` : ''}`,
            serviceAirportCode: airportCode?.toUpperCase(),
            distanceToAirport: airportDistanceMiles ?? undefined,
            type: isCity ? 'off-airport' : 'off-airport',
            price: displayPrice,
            priceDisplay: hasLiveTotal ? 'live' : 'check-live',
            priceUnit: 'total',
            pricingConfidence: hasLiveTotal ? 'live' : 'final_on_provider',
            priceNote: hasLiveTotal
                ? isCity
                    ? `${formatLiveParkWhizTotal(liveTotal ?? displayPrice)} from ParkWhiz for your selected duration.`
                    : `${formatLiveParkWhizTotal(liveTotal ?? displayPrice)} from ParkWhiz for the selected parking dates. Daily display is calculated by the app.`
                : 'Open ParkWhiz to confirm selected-date price.',
            priceSource: hasLiveTotal ? 'parkwhiz-live' : 'marketplace-link',
            priceConfidence: hasLiveTotal ? 'high' : 'low',

            distance: isCity ? cityDistanceRounded : 0,
            availability: estimateAvailabilityScore(availabilityStatus),
            trustStatus: hasLiveTotal ? 'live' : 'estimated',
            routeUnavailable: false,
            sourceName: 'ParkWhiz',
            sourceLink: bookingUrl,
            mapLink: googleMapsSearchUrl(mapQuery),
            imageUrl: providerPhotoUrl || undefined,
            images: providerPhotoUrl ? [providerPhotoUrl] : undefined,
            photoSource: providerPhotoUrl ? 'provider' : undefined,
            photoAttribution: providerPhotoUrl ? 'ParkWhiz' : undefined,
            photoAttributionUrl: providerPhotoUrl ? bookingUrl || 'https://www.parkwhiz.com' : undefined,
            photoAttributions: providerPhotoUrl ? ['ParkWhiz'] : undefined,
            address: address || undefined,
            normalizedAddress: address || undefined,
            routeDestination: address || locationName,
            lat: lotCoordinates.lat,
            lng: lotCoordinates.lng,
            lastUpdated: new Date().toISOString(),

            parkingBufferMinutes: isCity ? 8 : 15,
            transferToTerminalMinutes:
                isCity && !hasShuttle ? walkingMinutes : transferToTerminalMinutes,
            transferType: isCity ? (hasShuttle ? 'shuttle' : 'walk') : hasShuttle ? 'shuttle' : 'walk',
            walkingMinutes: isCity && hasShuttle ? undefined : walkingMinutes,
            shuttleMinutes: hasShuttle ? shuttleMinutes : undefined,
            shuttleWaitMinutes: isCity ? undefined : undefined,
            bufferRiskMinutes: isCity ? undefined : undefined,

            covered,
            bookingProvider: 'ParkWhiz',
            availabilityStatus,
            isAvailable: availabilityStatus !== 'unavailable',
            availabilityScore: estimateAvailabilityScore(availabilityStatus),
            priceFreshness: hasLiveTotal ? 'live' : 'estimated',
            providerSource: 'parkwhiz',

            assumptions: [
                isCity
                    ? 'Live bookable city parking quote from ParkWhiz.'
                    : 'Live bookable off-airport parking quote from ParkWhiz.',
                address ? `Lot address: ${address}` : 'Lot address unavailable from provider.',
                airportDistanceMiles !== null && !isCity
                    ? `Straight-line distance from airport coordinates: about ${airportDistanceMiles} miles.`
                    : null,
                isCity && cityDistanceRounded != null
                    ? `Walk distance estimated from the ParkWhiz lot location: about ${cityDistanceRounded} miles.`
                    : null,
                isCity && cityDistanceRounded == null
                    ? 'ParkWhiz did not provide enough lot location data to estimate walk distance; verify walking distance before booking.'
                    : null,
                isCity && distanceDecision === 'backup'
                    ? 'Farther from your destination — shown as a backup, not a primary option.'
                    : null,
                shuttleNote || 'Open ParkWhiz to verify access details and final booking terms.',
                option.cancellable_status?.message || 'Cancellation policy unavailable from provider.',
            ].filter(Boolean) as string[],

            bestFor: [
                hasLiveTotal && displayPrice < 130 ? 'Cheapest live quote' : '',
                hasLiveTotal ? 'Live provider price' : '',
                covered ? 'Covered' : '',
                evCharging ? 'EV Charging' : '',
                accessible ? 'Accessible' : '',
                attended ? 'Attended' : '',
                security ? 'Security' : '',
                hasShuttle ? 'Shuttle' : 'Walkable',
                isCity && distanceDecision === 'backup' ? 'Farther backup' : '',
                getAmenity(option, 'indoor')?.visible && !covered ? 'Uncovered' : '',
            ].filter(Boolean),
        }];
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
        return cached.options
            .filter((option) => !isParkWhizNoPriceSentinel(option))
            .map((option) => withStableParkingRouteStatus({
                ...option,
                serviceAirportCode: option.serviceAirportCode?.toUpperCase() ?? airportCode,
                priceSource: hasLiveParkWhizPrice(option) ? 'parkwhiz-live' : option.priceSource,
                priceUnit: isParkWhizOption(option) ? 'total' : option.priceUnit,
                priceNote:
                    isParkWhizOption(option)
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

export async function getParkWhizDestinationParkingOptions(args: {
    destination: string;
    coordinates: { lat: number; lng: number };
    destinationKind?: string;
    isEventVenue?: boolean;
    checkInDate?: string;
    checkOutDate?: string;
    checkInAt?: string;
    checkOutAt?: string;
}): Promise<ParkingOption[]> {
    if (!args.checkInDate || !args.checkOutDate) return [];

    const startTime = args.checkInAt || toParkWhizDateTime(args.checkInDate, '09:00');
    const endTime = args.checkOutAt || toParkWhizDateTime(args.checkOutDate, '18:00');
    const isEventVenue =
        args.isEventVenue === true ||
        args.destinationKind === 'stadium' ||
        args.destinationKind === 'event';
    const distanceMiles = isEventVenue ? 2.0 : 1.5;

    const url = new URL('https://api.parkwhiz.com/v4/quotes/');
    url.searchParams.set(
        'q',
        `coordinates:${args.coordinates.lat},${args.coordinates.lng} distance:${distanceMiles}`
    );
    url.searchParams.set('start_time', startTime);
    url.searchParams.set('end_time', endTime);
    url.searchParams.set('returns', 'offstreet_bookable');

    if (process.env.NODE_ENV === 'development') {
        console.log('[ParkWhiz city] fetching quotes', {
            destination: args.destination,
            coordinates: args.coordinates,
            startTime,
            endTime,
            distanceMiles,
        });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
        const response = await fetch(url.toString(), {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
        });

        if (!response.ok) return [];

        const json = (await response.json()) as unknown;
        if (!Array.isArray(json)) return [];

        let lotGeocodesRemaining = parkWhizCityLotGeocodeLimit();
        const quoteEntries = await Promise.all(
            json.map(async (rawQuote) => {
                const quote = rawQuote as ParkWhizQuote;
                const location = quote._embedded?.['pw:location'];
                const providerCoords = extractLocationCoordinates(location);
                const address = buildParkWhizLocationAddress(location);
                const hasProviderCoords =
                    typeof providerCoords.lat === 'number' && typeof providerCoords.lng === 'number';
                const hasQuoteDistance = quoteStraightLineDistanceMiles(quote) != null;
                const shouldGeocode =
                    !hasProviderCoords &&
                    !hasQuoteDistance &&
                    address &&
                    lotGeocodesRemaining > 0;

                if (!shouldGeocode) return { quote, geocodedLotCoordinates: null };

                lotGeocodesRemaining -= 1;
                const geocodedLotCoordinates = await geocodeParkWhizCityLotAddress(address);
                return { quote, geocodedLotCoordinates };
            }),
        );

        return quoteEntries
            .flatMap(({ quote, geocodedLotCoordinates }) =>
                normalizeParkWhizQuoteToParkingOptions({
                    quote,
                    mode: 'city',
                    destinationCoordinates: args.coordinates,
                    geocodedLotCoordinates,
                    isEventVenue,
                }),
            )
            .filter((option) =>
                classifyCityLotDistance(
                    typeof option.distance === 'number' ? option.distance : null,
                    isEventVenue,
                ) !== 'excluded',
            )
            .sort((a, b) => {
                const decisionA = classifyCityLotDistance(
                    typeof a.distance === 'number' ? a.distance : null,
                    isEventVenue,
                );
                const decisionB = classifyCityLotDistance(
                    typeof b.distance === 'number' ? b.distance : null,
                    isEventVenue,
                );
                const rank = (decision: CityLotDistanceDecision) =>
                    decision === 'within_preferred' ? 0 : 1;
                const rankDiff = rank(decisionA) - rank(decisionB);
                if (rankDiff !== 0) return rankDiff;
                return (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY);
            });
    } catch {
        return [];
    } finally {
        clearTimeout(timeout);
    }
}
