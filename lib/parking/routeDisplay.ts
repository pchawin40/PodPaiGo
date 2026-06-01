import { ParkingOption, TripData } from '../types';
import type { PriceableParkingLike } from '../access/types';
import { canDisplayParkingPrice } from './priceDisplay';
import { googleMapsDirectionsLink, googleMapsSearchLink } from '../maps';
import { isParkingRouteUnavailable } from './routeStatus';
import { getAirportById } from '../airports/catalog';
import { cleanParkingProviderInventoryName } from './googlePlaceMatchUtils';

type ParkingRouteOption = Pick<
  ParkingOption,
  | 'routeDestination'
  | 'mapLink'
  | 'name'
  | 'lat'
  | 'lng'
  | 'normalizedAddress'
  | 'address'
  | 'googlePlaceId'
  | 'googlePlaceName'
  | 'googlePlaceAddress'
  | 'googleMapsUri'
>;

type ParkingRouteTripData = Pick<TripData, 'origin' | 'destination' | 'airportCode'> | null;

type ParkingDestinationSource =
  | 'google-place'
  | 'name-address'
  | 'route-destination'
  | 'address'
  | 'coordinates'
  | 'none';

type ParkingLotDestinationResult = {
  destination: string;
  googlePlaceId?: string;
  googleMapsUri?: string;
  usedGooglePlaceData: boolean;
  source: ParkingDestinationSource;
};

import { resolveParkingDriveMinutesWithFallback, buildParkingDriveContextFromOption, type ParkingDriveContext } from './routeMinutes';

function getParkingDriveMinutes(
  option: ParkingOption,
  context?: ParkingDriveContext,
): number {
  return resolveParkingDriveMinutesWithFallback(option, context);
}

export function parkingTimeBreakdown(
  option: ParkingOption,
  context?: ParkingDriveContext,
): {
  label: string;
  totalMinutes: number;
  parts: Array<{ label: string; minutes: number }>;
} {
  if (isParkingRouteUnavailable(option)) {
    return {
      label: 'Route unavailable',
      totalMinutes: 0,
      parts: [],
    };
  }

  const resolvedContext = context ?? buildParkingDriveContextFromOption(option);
  const drive = getParkingDriveMinutes(option, resolvedContext);
  const park = typeof option.parkingBufferMinutes === 'number' ? option.parkingBufferMinutes : 0;
  const shuttleWait =
    option.transferType === 'shuttle'
      ? typeof option.shuttleWaitMinutes === 'number'
        ? option.shuttleWaitMinutes
        : 8
      : 0;
  const transfer =
    typeof option.transferToTerminalMinutes === 'number'
      ? option.transferToTerminalMinutes
      : 0;
  const walk =
    typeof option.walkingMinutes === 'number'
      ? option.walkingMinutes
      : option.transferType === 'airport-garage'
        ? 5
        : 3;
  const risk =
    typeof option.bufferRiskMinutes === 'number'
      ? option.bufferRiskMinutes
      : option.transferType === 'shuttle'
        ? 5
        : 0;

  const parts = [
    { label: 'Drive to lot', minutes: drive },
    ...(park > 0 ? [{ label: 'Park/check-in', minutes: park }] : []),
    ...(shuttleWait > 0 ? [{ label: 'Shuttle wait', minutes: shuttleWait }] : []),
    ...(transfer > 0
      ? [
        {
          label:
            option.transferType === 'shuttle'
              ? 'Shuttle'
              : option.transferType === 'transit'
                ? 'Transit to terminal'
              : option.transferType === 'airport-garage'
                ? 'Garage to terminal'
                : 'Walk to terminal',
          minutes: transfer,
        },
      ]
      : []),
    ...(walk > 0 ? [{ label: 'Walk inside airport', minutes: walk }] : []),
    ...(risk > 0 ? [{ label: 'Buffer/risk', minutes: risk }] : []),
  ];

  const totalMinutes = parts.reduce((sum, p) => sum + p.minutes, 0);

  return {
    label: parts.map((p) => `${p.label} ${formatMinutes(p.minutes)}`).join(' + '),
    totalMinutes,
    parts,
  };
}

function normalizeDestinationText(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSpecificPlaceContext(normalizedValue: string): boolean {
  return /\b(hotel|inn|suites|motel|garage|parking|park|lot|valet|shuttle|center|plaza|station)\b/.test(
    normalizedValue
  );
}

function looksLikeAirportDestination(
  value: string,
  airportDestination?: string | null
): boolean {
  const lower = normalizeDestinationText(value);
  const airport = normalizeDestinationText(airportDestination);

  if (!lower) return false;

  const genericAirportDestinations = new Set([
    'sea',
    'seatac',
    'sea tac',
    'sea airport',
    'seatac airport',
    'sea tac airport',
    'seattle tacoma airport',
    'seattle tacoma international airport',
    'seattle tacoma international airport sea',
    'central terminal',
    'airport terminal',
    'passenger terminal',
  ]);

  if (/^[a-z]{3}$/.test(lower)) return true;
  if (genericAirportDestinations.has(lower)) return true;

  if (airport) {
    if (lower === airport) return true;
    if (lower.length >= 12 && /[0-9]/.test(lower) && airport.includes(lower)) return true;
    if (lower.includes('airport') && airport.includes(lower)) return true;
    if (lower.includes('terminal') && airport.includes(lower)) return true;
  }

  return (
    lower.includes('central terminal') ||
    lower.includes('airport terminal') ||
    lower.includes('passenger terminal') ||
    (lower.includes('terminal') && !lower.includes('parking') && !lower.includes('garage')) ||
    lower === 'international airport' ||
    (lower.endsWith(' international airport') && !hasSpecificPlaceContext(lower)) ||
    (lower.endsWith(' airport') && !hasSpecificPlaceContext(lower))
  );
}

function looksLikeGenericParkingName(value: string): boolean {
  const lower = normalizeDestinationText(value);

  return (
    lower.includes('spothero sea parking') ||
    lower.includes('way.com') ||
    lower.includes('parkwhiz') ||
    lower.includes('airport parking options') ||
    lower.includes('parking near') ||
    lower.includes('compare parking') ||
    lower === 'parking' ||
    lower === 'parking lot' ||
    lower === 'parking garage' ||
    lower === 'airport parking' ||
    lower === 'airport parking lot' ||
    lower === 'sea parking' ||
    lower === 'sea airport parking' ||
    lower === 'seatac parking' ||
    lower === 'seatac airport parking'
  );
}

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isUsableLotDestination(
  value: string,
  airportDestination?: string | null
): boolean {
  const trimmed = value.trim();

  if (!trimmed) return false;
  if (isLikelyUrl(trimmed)) return false;
  if (looksLikeAirportDestination(trimmed, airportDestination)) return false;
  if (looksLikeGenericParkingName(trimmed)) return false;

  return true;
}

function joinNameAndAddress(name: string, address: string): string {
  if (!name) return address;
  if (!address) return name;

  const lowerName = name.toLowerCase();
  const lowerAddress = address.toLowerCase();

  if (lowerAddress.includes(lowerName) || lowerName.includes(lowerAddress)) {
    return name || address;
  }

  return `${name}, ${address}`;
}

export function parkingLotDestination(
  option: ParkingRouteOption,
  airportDestination?: string | null
): string {
  return resolveParkingLotDestination(option, airportDestination).destination;
}

export function resolveParkingLotDestination(
  option: ParkingRouteOption,
  airportDestination?: string | null
): ParkingLotDestinationResult {
  const name = String(option.name || '').trim();
  const cleanedName = cleanParkingProviderInventoryName(name);
  const routeDestination = String(option.routeDestination || '').trim();
  const cleanedRouteDestination = cleanParkingProviderInventoryName(routeDestination);
  const address = String(option.address || '').trim();
  const normalizedAddress = String(option.normalizedAddress || '').trim();
  const googlePlaceName = cleanParkingProviderInventoryName(option.googlePlaceName || '');
  const googlePlaceAddress = String(option.googlePlaceAddress || '').trim();
  const googlePlaceId = String(option.googlePlaceId || '').trim() || undefined;
  const googleMapsUri = String(option.googleMapsUri || '').trim() || undefined;
  const hasUsableAddress = isUsableLotDestination(address, airportDestination);
  const hasUsableNormalizedAddress = isUsableLotDestination(
    normalizedAddress,
    airportDestination
  );
  const hasUsableGooglePlaceAddress = isUsableLotDestination(
    googlePlaceAddress,
    airportDestination
  );

  const googlePlaceDestination = joinNameAndAddress(
    googlePlaceName,
    hasUsableGooglePlaceAddress ? googlePlaceAddress : ''
  );

  if (
    (googlePlaceId || googleMapsUri) &&
    isUsableLotDestination(googlePlaceDestination, airportDestination)
  ) {
    return {
      destination: googlePlaceDestination,
      googlePlaceId,
      googleMapsUri,
      usedGooglePlaceData: true,
      source: 'google-place',
    };
  }

  if (
    (googlePlaceId || googleMapsUri) &&
    hasUsableGooglePlaceAddress
  ) {
    return {
      destination: googlePlaceAddress,
      googlePlaceId,
      googleMapsUri,
      usedGooglePlaceData: true,
      source: 'google-place',
    };
  }

  if (
    (googlePlaceId || googleMapsUri) &&
    isUsableLotDestination(googlePlaceName, airportDestination)
  ) {
    return {
      destination: googlePlaceName,
      googlePlaceId,
      googleMapsUri,
      usedGooglePlaceData: true,
      source: 'google-place',
    };
  }

  const hasRealCleanedName =
    cleanedName && isUsableLotDestination(cleanedName, airportDestination);

  if (hasRealCleanedName && hasUsableAddress) {
    const destination = joinNameAndAddress(cleanedName, address);
    if (isUsableLotDestination(destination, airportDestination)) {
      return {
        destination,
        usedGooglePlaceData: false,
        source: 'name-address',
      };
    }
  }

  if (hasRealCleanedName && hasUsableNormalizedAddress) {
    const destination = joinNameAndAddress(cleanedName, normalizedAddress);
    if (isUsableLotDestination(destination, airportDestination)) {
      return {
        destination,
        usedGooglePlaceData: false,
        source: 'name-address',
      };
    }
  }

  if (hasRealCleanedName) {
    return {
      destination: cleanedName,
      usedGooglePlaceData: false,
      source: 'name-address',
    };
  }

  if (isUsableLotDestination(cleanedRouteDestination, airportDestination)) {
    return {
      destination: cleanedRouteDestination,
      usedGooglePlaceData: false,
      source: 'route-destination',
    };
  }

  if (isUsableLotDestination(routeDestination, airportDestination)) {
    return {
      destination: routeDestination,
      usedGooglePlaceData: false,
      source: 'route-destination',
    };
  }

  if (hasUsableAddress) {
    return {
      destination: address,
      usedGooglePlaceData: false,
      source: 'address',
    };
  }

  if (hasUsableNormalizedAddress) {
    return {
      destination: normalizedAddress,
      usedGooglePlaceData: false,
      source: 'address',
    };
  }

  if (
    typeof option.lat === 'number' &&
    Number.isFinite(option.lat) &&
    typeof option.lng === 'number' &&
    Number.isFinite(option.lng)
  ) {
    return {
      destination: `${option.lat},${option.lng}`,
      usedGooglePlaceData: false,
      source: 'coordinates',
    };
  }

  return {
    destination: '',
    googlePlaceId,
    googleMapsUri,
    usedGooglePlaceData: Boolean(googlePlaceId || googleMapsUri),
    source: 'none',
  };
}

function resolveAirportDestination(
  tripData: ParkingRouteTripData
): string {
  const rawDestination = String(tripData?.destination || '').trim();
  const airportCode = String(tripData?.airportCode || '').trim();
  const airport =
    getAirportById(airportCode) ||
    getAirportById(rawDestination) ||
    getAirportById(rawDestination.slice(0, 3));

  return airport?.routingAddress || rawDestination;
}

export function parkingRouteLinks(
  option: ParkingRouteOption,
  tripData: ParkingRouteTripData
): {
  routeToParkingUrl: string | null;
  parkingToAirportUrl: string | null;
  parkingLotDestination: string;
  airportDestination: string;
  usedGooglePlaceData: boolean;
  parkingLotDestinationSource: ParkingDestinationSource;
} {
  const airportDestination = resolveAirportDestination(tripData);
  const lotDestination = resolveParkingLotDestination(option, airportDestination);
  const origin = String(tripData?.origin || '').trim();

  const routeToParkingUrl =
    origin && lotDestination.destination
      ? googleMapsDirectionsLink(origin, lotDestination.destination, 'driving', {
        destinationPlaceId: lotDestination.googlePlaceId,
      })
      : null;

  const parkingToAirportUrl =
    lotDestination.destination && airportDestination
      ? googleMapsDirectionsLink(lotDestination.destination, airportDestination, 'driving', {
        originPlaceId: lotDestination.googlePlaceId,
      })
      : null;

  // if (process.env.NODE_ENV === 'development') {
  //   console.log('[Parking Maps route links]', {
  //     parkingOptionName: option.name,
  //     parkingLotDestination: lotDestination.destination || null,
  //     airportDestination,
  //     routeToParkingUrl,
  //     parkingToAirportUrl,
  //     usedGooglePlaceData: lotDestination.usedGooglePlaceData,
  //     parkingLotDestinationSource: lotDestination.source,
  //     googleMapsUri: lotDestination.googleMapsUri,
  //   });
  // }

  return {
    routeToParkingUrl,
    parkingToAirportUrl,
    parkingLotDestination: lotDestination.destination,
    airportDestination,
    usedGooglePlaceData: lotDestination.usedGooglePlaceData,
    parkingLotDestinationSource: lotDestination.source,
  };
}

export function parkingKey(v: Pick<ParkingOption, 'id' | 'name'>): string {
  const raw = String(v.id || v.name || '')
    .toLowerCase()
    .replace(/parking/g, '')
    .replace(/official/g, '')
    .replace(/[^a-z0-9]/g, '');

  if (raw.includes('doubletree')) return 'doubletree';
  if (raw.includes('wally')) return 'wallypark';
  if (raw.includes('master')) return 'masterpark';
  if (raw.includes('jiffy')) return 'jiffy';
  if (raw.includes('general')) return 'officialgeneral';
  if (raw.includes('reserved')) return 'officialreserved';

  return raw;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;

  const days = Math.floor(min / (60 * 24));
  const hours = Math.floor((min % (60 * 24)) / 60);
  const minutes = min % 60;

  return [
    days > 0 ? `${days}d` : null,
    hours > 0 || days > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

export function parkingRouteBreakdown(option: ParkingOption): string {
  const breakdown = parkingTimeBreakdown(option);

  const drive = breakdown.parts.find((p) => p.label === 'Drive to parking');
  const wait = breakdown.parts.find((p) => p.label === 'Shuttle wait');
  const transfer = breakdown.parts.find((p) =>
    ['Shuttle', 'Garage to terminal', 'Walk to terminal'].includes(p.label)
  );
  const risk = breakdown.parts.find((p) => p.label === 'Buffer/risk');

  return [
    drive ? `Drive ${formatMinutes(drive.minutes)}` : null,
    wait ? `wait ${formatMinutes(wait.minutes)}` : null,
    transfer ? `${transfer.label.toLowerCase()} ${formatMinutes(transfer.minutes)}` : null,
    risk ? `buffer ${formatMinutes(risk.minutes)}` : null,
    `total ${formatMinutes(breakdown.totalMinutes)}`,
  ]
    .filter(Boolean)
    .join(' + ');
}

import { formatOptionPrice } from '../access/pricingLadder';

export function parkingDailyCost(option: ParkingOption, formatMoney: (n: number) => string): string {
  const formatted = formatOptionPrice(option);
  if (formatted.includes('/day')) return formatted.replace(/^[^$]*/, '').trim() || formatted;
  if (typeof option.price === 'number' && option.price > 0) {
    return `${formatMoney(option.price)}/day`;
  }
  return formatted;
}

export function routeUrlForOption(
  option: Pick<ParkingOption, 'routeDestination' | 'mapLink'>,
  origin: string | null
): string | null {
  const routeDestination = option.routeDestination;
  const mapLink = option.mapLink;

  if (routeDestination) {
    if (routeDestination.startsWith('http')) return routeDestination;
    if (origin) return googleMapsDirectionsLink(origin, routeDestination, 'driving');
    return googleMapsSearchLink(routeDestination);
  }

  return mapLink || null;
}

export function googleMapsParkingRouteLink(
  option: ParkingRouteOption,
  origin: string | null,
  airportDestination?: string | null
): string | null {
  const parkingLot = resolveParkingLotDestination(option, airportDestination);

  if (!parkingLot.destination || !origin) return null;

  return googleMapsDirectionsLink(origin, parkingLot.destination, 'driving', {
    destinationPlaceId: parkingLot.googlePlaceId,
  });
}

export function costOf(option: { cost?: number }): number {
  return typeof option.cost === 'number' ? option.cost : 999;
}


export function parkingKeySafe(option: { id?: string; name?: string } | null | undefined): string | null {
  if (!option?.name) return null;
  return parkingKey({
    id: option.id || option.name,
    name: option.name,
  });
}

export function hasRealParkingPrice(option: {
  price?: number;
  priceDisplay?: string;
  priceMin?: number;
  priceMax?: number;
}) {
  return canDisplayParkingPrice({
    price: option.price ?? 0,
    priceDisplay: option.priceDisplay as PriceableParkingLike['priceDisplay'],
    priceMin: option.priceMin,
    priceMax: option.priceMax,
  });
}
