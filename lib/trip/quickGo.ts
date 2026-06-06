import { getAirportById, AIRPORTS_CATALOG, type AirportInfo } from '../airports/catalog';
import {
  classifyDestinationParking,
  destinationParkingHeadline,
  isRetailOrGroceryDestination,
  type DestinationParkingClassification,
} from '../parking/destinationParkingClassifier';
import type { RankedRecommendation } from '../domain';
import type { DestinationKind, TransportAvailability, TripData } from '../types';
import { buildResultsPathFromSearchParams } from './searchParams';
import { deriveParkingWindowFromArrival } from './parkingWindow';

export const QUICK_GO_TRIP_MODE = 'quick-go';
export const RECENT_ORIGINS_STORAGE_KEY = 'podpaigo-recent-origins';

export const QUICK_GO_EXAMPLE_DESTINATIONS = [
  'Grocery store',
  'Downtown shopping district',
  'Regional airport',
  'Coffee shop',
  'Trailhead parking lot',
] as const;

export type QuickGoOriginSource = 'manual' | 'geolocation' | 'saved';

export type QuickGoPurpose =
  | 'flying-out'
  | 'picking-up'
  | 'dropping-off'
  | 'parking-trip'
  | 'general-destination';

export type QuickGoPreference = 'easiest' | 'cheapest' | 'fastest';

export type QuickGoDestinationSource =
  | 'saved'
  | 'recent'
  | 'airport'
  | 'geocoder'
  | 'google'
  | 'typed';

export type QuickGoOriginSelection = {
  origin: string;
  originLabel: string;
  originSource: QuickGoOriginSource;
  originLat?: number;
  originLng?: number;
};

export type QuickGoDestinationSelection = {
  destination: string;
  destinationLabel: string;
  destinationAddress: string;
  destinationSource: QuickGoDestinationSource;
  destinationLat?: number;
  destinationLng?: number;
  destinationConfidence?: 'high' | 'medium' | 'low';
  detectedAirportCode?: string;
};

export const QUICK_GO_TRIP_DEFINING_PARAM_KEYS = [
  'type',
  'tripMode',
  'origin',
  'originLabel',
  'originSource',
  'originLat',
  'originLng',
  'destination',
  'destinationName',
  'destinationLabel',
  'destinationAddress',
  'destinationSource',
  'destinationLat',
  'destinationLng',
  'destinationConfidence',
  'destinationKind',
  'intent',
  'transport',
  'transitPayment',
  'arrivalDate',
  'arrivalTime',
  'parkingCheckInDate',
  'parkingCheckInTime',
  'parkingDuration',
  'quickGoPurpose',
  'quickGoPreference',
  'calculateLeaveTime',
  'familyLuggageFriendly',
  'detectedAirportCode',
  'detectedAirport',
  'quickGoConfirmed',
] as const;

export function isQuickGoMode(params: Pick<URLSearchParams, 'get'>): boolean {
  return (
    params.get('tripMode') === QUICK_GO_TRIP_MODE || params.get('type') === QUICK_GO_TRIP_MODE
  );
}

export function getRecentOrigins(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(RECENT_ORIGINS_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberRecentOrigin(origin: string): void {
  if (typeof window === 'undefined') return;

  const trimmed = origin.trim();
  if (trimmed.length < 5) return;

  try {
    const recents = getRecentOrigins();
    const next = [trimmed, ...recents.filter((value) => value !== trimmed)].slice(0, 5);
    window.localStorage.setItem(RECENT_ORIGINS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private mode errors.
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatQuickGoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatQuickGoTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function matchesAirportHint(haystack: string, token: string): boolean {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return false;

  if (normalized.length === 3) {
    return new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
      haystack,
    );
  }

  return haystack.includes(normalized);
}

export function detectAirportFromDestination(destination: string): AirportInfo | null {
  const raw = destination.trim();
  if (!raw) return null;

  if (isRetailOrGroceryDestination(raw)) {
    return null;
  }

  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  const direct = getAirportById(upper);
  if (direct) return direct;

  const codeMatch = upper.match(/\(([A-Z]{3})\)/);
  if (codeMatch) {
    const byCode = getAirportById(codeMatch[1]!);
    if (byCode) return byCode;
  }

  if (/\bairport\b/i.test(raw) || /\bterminal\b/i.test(raw) || /\bseatac\b/i.test(raw)) {
    const airportWordMatch = AIRPORTS_CATALOG.find((airport) => {
      const values = [airport.label, airport.destinationName, airport.routingAddress, airport.id];
      return values.some((value) => {
        const text = String(value || '').toLowerCase();
        return text && matchesAirportHint(lower, text);
      });
    });
    if (airportWordMatch) return airportWordMatch;
  }

  if (/\b(sea-tac|seatac)\b/i.test(raw) || matchesAirportHint(lower, 'sea-tac')) {
    return getAirportById('SEA');
  }

  if (matchesAirportHint(lower, 'sea airport') || matchesAirportHint(lower, 'seattle-tacoma')) {
    return getAirportById('SEA');
  }

  return (
    AIRPORTS_CATALOG.find((airport) => {
      const values = [
        airport.id,
        airport.label,
        airport.destinationName,
        airport.routingAddress,
        airport.rideshareDestinationName,
      ];

      return values.some((value) => {
        const text = String(value || '').toLowerCase();
        if (!text || text.length < 4) {
          return airport.id.length === 3 && matchesAirportHint(lower, airport.id);
        }
        return matchesAirportHint(lower, text);
      });
    }) || null
  );
}

export function inferQuickGoDestinationKind(
  destination: string,
  airport: AirportInfo | null,
): DestinationKind {
  if (airport) return 'airport';

  const classification = classifyDestinationParking({ destination });

  if (classification.mode === 'paid_likely') return 'downtown';
  if (classification.mode === 'restricted_possible') return 'office';
  if (classification.mode === 'validated_possible') return 'restaurant';
  if (classification.mode === 'permit_possible') return 'general';

  return 'general';
}

export function readQuickGoOriginFromSearchParams(
  params: Pick<URLSearchParams, 'get'>,
): QuickGoOriginSelection | null {
  const origin = params.get('origin')?.trim();
  if (!origin) return null;

  const originSource = params.get('originSource') as QuickGoOriginSource | null;
  const originLabel = params.get('originLabel')?.trim() || origin;
  const originLatRaw = params.get('originLat');
  const originLngRaw = params.get('originLng');
  const originLat = originLatRaw ? Number(originLatRaw) : undefined;
  const originLng = originLngRaw ? Number(originLngRaw) : undefined;

  return {
    origin,
    originLabel,
    originSource:
      originSource === 'manual' || originSource === 'geolocation' || originSource === 'saved'
        ? originSource
        : 'manual',
    originLat: Number.isFinite(originLat) ? originLat : undefined,
    originLng: Number.isFinite(originLng) ? originLng : undefined,
  };
}

export function formatQuickGoOriginDisplayLabel(
  params: Pick<URLSearchParams, 'get'>,
): string {
  const selection = readQuickGoOriginFromSearchParams(params);
  if (!selection) return 'Starting point required';

  switch (selection.originSource) {
    case 'geolocation':
      return 'From current location';
    case 'saved':
      return `From saved origin: ${selection.originLabel}`;
    case 'manual':
    default:
      return `From typed origin: ${selection.originLabel}`;
  }
}

export function applyQuickGoOriginToSearchParams(
  params: URLSearchParams,
  origin: QuickGoOriginSelection,
): void {
  params.set('origin', origin.origin.trim());
  params.set('originLabel', origin.originLabel.trim() || origin.origin.trim());
  params.set('originSource', origin.originSource);

  if (typeof origin.originLat === 'number' && Number.isFinite(origin.originLat)) {
    params.set('originLat', String(origin.originLat));
  } else {
    params.delete('originLat');
  }

  if (typeof origin.originLng === 'number' && Number.isFinite(origin.originLng)) {
    params.set('originLng', String(origin.originLng));
  } else {
    params.delete('originLng');
  }
}

export async function resolveGeolocationOrigin(): Promise<QuickGoOriginSelection> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation not supported in this browser');
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60_000,
    });
  });

  const originLat = position.coords.latitude;
  const originLng = position.coords.longitude;
  let resolvedAddress = '';

  try {
    const response = await fetch(`/api/geocode/reverse?lat=${originLat}&lng=${originLng}`);
    if (response.ok) {
      const data = (await response.json()) as { formattedAddress?: string };
      resolvedAddress = data.formattedAddress?.trim() || '';
    }
  } catch {
    resolvedAddress = '';
  }

  return {
    origin: resolvedAddress || `${originLat},${originLng}`,
    originLabel: 'Current location',
    originSource: 'geolocation',
    originLat,
    originLng,
  };
}

export function buildQuickGoDestinationSelectionFromText(
  destinationText: string,
): QuickGoDestinationSelection {
  const destination = destinationText.trim();

  return {
    destination,
    destinationLabel: destination,
    destinationAddress: destination,
    destinationSource: 'typed',
    destinationConfidence: 'low',
  };
}

export function readQuickGoDestinationFromSearchParams(
  params: Pick<URLSearchParams, 'get'>,
): QuickGoDestinationSelection | null {
  const destination = params.get('destination')?.trim();
  if (!destination) return null;

  const destinationSource = params.get('destinationSource') as QuickGoDestinationSource | null;
  const destinationLabel = params.get('destinationLabel')?.trim() || destination;
  const destinationAddress = params.get('destinationAddress')?.trim() || destination;
  const destinationLatRaw = params.get('destinationLat');
  const destinationLngRaw = params.get('destinationLng');
  const destinationLat = destinationLatRaw ? Number(destinationLatRaw) : undefined;
  const destinationLng = destinationLngRaw ? Number(destinationLngRaw) : undefined;
  const destinationConfidenceRaw = params.get('destinationConfidence');
  const destinationConfidence =
    destinationConfidenceRaw === 'high' ||
    destinationConfidenceRaw === 'medium' ||
    destinationConfidenceRaw === 'low'
      ? destinationConfidenceRaw
      : undefined;

  return {
    destination,
    destinationLabel,
    destinationAddress,
    destinationSource:
      destinationSource === 'saved' ||
      destinationSource === 'recent' ||
      destinationSource === 'airport' ||
      destinationSource === 'geocoder' ||
      destinationSource === 'google' ||
      destinationSource === 'typed'
        ? destinationSource
        : 'typed',
    destinationLat: Number.isFinite(destinationLat) ? destinationLat : undefined,
    destinationLng: Number.isFinite(destinationLng) ? destinationLng : undefined,
    destinationConfidence,
    detectedAirportCode: params.get('detectedAirportCode')?.trim() || undefined,
  };
}

export function applyQuickGoDestinationToSearchParams(
  params: URLSearchParams,
  destination: QuickGoDestinationSelection,
): void {
  params.set('destination', destination.destination.trim());
  params.set('destinationName', destination.destinationLabel.trim() || destination.destination.trim());
  params.set('destinationLabel', destination.destinationLabel.trim() || destination.destination.trim());
  params.set('destinationAddress', destination.destinationAddress.trim() || destination.destination.trim());
  params.set('destinationSource', destination.destinationSource);

  if (typeof destination.destinationLat === 'number' && Number.isFinite(destination.destinationLat)) {
    params.set('destinationLat', String(destination.destinationLat));
  } else {
    params.delete('destinationLat');
  }

  if (typeof destination.destinationLng === 'number' && Number.isFinite(destination.destinationLng)) {
    params.set('destinationLng', String(destination.destinationLng));
  } else {
    params.delete('destinationLng');
  }

  if (destination.destinationConfidence) {
    params.set('destinationConfidence', destination.destinationConfidence);
  } else {
    params.delete('destinationConfidence');
  }
}

export type BuildQuickGoSearchParamsInput = {
  destinationText?: string;
  destination?: QuickGoDestinationSelection;
  origin: QuickGoOriginSelection;
  continueAsQuickGo?: boolean;
  transportAvailability?: TransportAvailability;
  purpose?: QuickGoPurpose;
  preference?: QuickGoPreference;
  calculateLeaveTime?: boolean;
  familyLuggageFriendly?: boolean;
  parkingDurationMinutes?: number;
  now?: Date;
};

export function buildQuickGoSearchParams(input: BuildQuickGoSearchParamsInput): URLSearchParams {
  const destinationSelection =
    input.destination ??
    buildQuickGoDestinationSelectionFromText(input.destinationText || '');
  const destination = destinationSelection.destination.trim();
  const now = input.now ?? new Date();
  const parkingDurationMinutes =
    typeof input.parkingDurationMinutes === 'number' &&
    Number.isFinite(input.parkingDurationMinutes) &&
    input.parkingDurationMinutes > 0
      ? Math.round(input.parkingDurationMinutes)
      : 2 * 60;
  const purpose = input.purpose || 'general-destination';
  const preference = input.preference || 'easiest';
  const airportCode =
    destinationSelection.detectedAirportCode ||
    (input.continueAsQuickGo ? null : detectAirportFromDestination(destination)?.id);
  const airport = airportCode ? getAirportById(airportCode) : null;

  const params = new URLSearchParams();
  params.set('type', QUICK_GO_TRIP_MODE);
  params.set('tripMode', QUICK_GO_TRIP_MODE);
  applyQuickGoOriginToSearchParams(params, input.origin);
  applyQuickGoDestinationToSearchParams(params, destinationSelection);
  params.set('intent', purpose === 'flying-out' ? 'flying-out' : 'general-trip');
  params.set('transport', input.transportAvailability || 'all');
  params.set('transitPayment', 'normal');
  params.set('destinationKind', inferQuickGoDestinationKind(destination, airport));
  params.set('quickGoPurpose', purpose);
  params.set('quickGoPreference', preference);
  params.set('calculateLeaveTime', input.calculateLeaveTime === false ? '0' : '1');
  if (input.familyLuggageFriendly) {
    params.set('familyLuggageFriendly', '1');
  }

  const arrivalDate = formatQuickGoDate(now);
  const arrivalTime = formatQuickGoTime(now);

  params.set('arrivalDate', arrivalDate);
  params.set('arrivalTime', arrivalTime);
  const parkingWindow = deriveParkingWindowFromArrival(arrivalDate, arrivalTime, parkingDurationMinutes);

  params.set('parkingCheckInDate', parkingWindow?.parkingCheckInDate || arrivalDate);
  params.set('parkingCheckInTime', parkingWindow?.parkingCheckInTime || arrivalTime);
  params.set('parkingCheckOutDate', parkingWindow?.parkingCheckOutDate || '');
  params.set('parkingCheckOutTime', parkingWindow?.parkingCheckOutTime || '');
  params.set('parkingDuration', String(parkingWindow?.parkingDuration ?? parkingDurationMinutes));

  if (airport) {
    params.set('detectedAirportCode', airport.id);
    params.set('detectedAirport', '1');
  }

  if (input.continueAsQuickGo) {
    params.set('quickGoConfirmed', '1');
  }

  return params;
}

export function mergeStoredTripSearchParams(
  storedSearchParams: string | null | undefined,
  routeSearchParamsString: string,
): URLSearchParams {
  const params = new URLSearchParams(storedSearchParams || routeSearchParamsString);

  if (storedSearchParams) {
    const routeParams = new URLSearchParams(routeSearchParamsString);
    const storedParams = new URLSearchParams(storedSearchParams);
    const protectQuickGoTripParams = isQuickGoMode(storedParams);
    const protectedKeys = new Set<string>(QUICK_GO_TRIP_DEFINING_PARAM_KEYS);

    routeParams.forEach((value, key) => {
      if (protectQuickGoTripParams && protectedKeys.has(key)) {
        return;
      }
      params.set(key, value);
    });
  }

  return params;
}

export function buildQuickGoResultsPath(input: BuildQuickGoSearchParamsInput): string {
  return buildResultsPathFromSearchParams(buildQuickGoSearchParams(input));
}

export function buildFullAirportPlannerSearchParams(input: {
  origin: string;
  airportCode: string;
  now?: Date;
}): URLSearchParams {
  const airport = getAirportById(input.airportCode.toUpperCase()) || getAirportById('SEA')!;
  const now = input.now ?? new Date();
  const departure = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const params = new URLSearchParams();
  params.set('type', 'one-way-departure');
  params.set('intent', 'flying-out');
  params.set('origin', input.origin.trim());
  params.set('destination', airport.routingAddress);
  params.set('destinationKind', 'airport');
  params.set('transport', 'all');
  params.set('transitPayment', 'normal');
  params.set('airport', airport.id);
  params.set('airportCode', airport.id);
  params.set('airportName', airport.label);
  params.set('rideshareDestinationName', airport.rideshareDestinationName);
  params.set('airportCheckinNote', airport.checkinNote || '');
  params.set('departureDate', formatQuickGoDate(departure));
  params.set('departureTime', formatQuickGoTime(departure));
  params.set('parkingCheckInDate', formatQuickGoDate(departure));
  params.set('timeAnchor', 'flight-departure');
  params.set('bagPlan', 'none');
  params.set('bags', 'no');
  params.set('securityOption', 'standard');
  params.set('security', 'standard');
  params.set('flightType', 'domestic');
  params.set('cabin', 'economy');

  return params;
}

export function buildFullAirportPlannerPath(input: {
  origin: string;
  airportCode: string;
  now?: Date;
}): string {
  return buildResultsPathFromSearchParams(buildFullAirportPlannerSearchParams(input));
}

export function quickGoParkingExpectationLabel(
  classification: DestinationParkingClassification,
): string {
  switch (classification.mode) {
    case 'free_likely':
      return 'Free customer parking likely';
    case 'paid_likely':
      return 'Likely paid';
    case 'restricted_possible':
      return 'Restricted / employee only';
    case 'validated_possible':
      return 'Validation possible';
    case 'permit_possible':
      return 'Trailhead / recreation';
    case 'airport':
      return 'Airport parking rules';
    default:
      return 'Unknown';
  }
}

export function quickGoParkingConfidenceLabel(
  confidence: DestinationParkingClassification['confidence'],
): string {
  switch (confidence) {
    case 'high':
      return 'High confidence';
    case 'medium':
      return 'Medium confidence';
    case 'low':
      return 'Low confidence';
    default:
      return 'Unknown confidence';
  }
}

export function quickGoStressLabel(stressScore: number): string {
  if (stressScore >= 75) return 'Low';
  if (stressScore >= 45) return 'Medium';
  return 'High';
}

export function quickGoClassificationForTrip(input: {
  destination: string;
  destinationKind?: string | null;
  airportCode?: string | null;
  detectedAirportCode?: string | null;
}): DestinationParkingClassification {
  const destinationKind = String(input.destinationKind || '').trim().toLowerCase();
  const detectedAirportCode = String(input.detectedAirportCode || '').trim().toUpperCase();
  const isAirportTrip =
    destinationKind === 'airport' ||
    Boolean(detectedAirportCode) ||
    Boolean(detectAirportFromDestination(input.destination));

  return classifyDestinationParking({
    destination: input.destination,
    destinationKind: isAirportTrip ? 'airport' : destinationKind || null,
  });
}

export type QuickGoBestWayResult = {
  bestWayLabel: string;
  backupWayLabel: string;
  bestOption: RankedRecommendation | null;
  backupOption: RankedRecommendation | null;
};

function findRankedOption(
  rankedOptions: RankedRecommendation[],
  type: RankedRecommendation['type'],
): RankedRecommendation | null {
  return rankedOptions.find((option) => option.type === type) ?? null;
}

function formatRankedOptionLabel(option: RankedRecommendation | null): string | null {
  if (!option) return null;

  if (option.type === 'parking') {
    const name = String((option.option as { name?: string }).name || 'Parking');
    return `Drive + park · ${name}`;
  }

  if (option.type === 'rideshare') {
    return 'Rideshare / taxi';
  }

  return 'Transit';
}

export type QuickGoDriveTimeInput = {
  duration?: number | null;
  routeUnavailable?: boolean;
  trustStatus?: string;
  distanceMeters?: number;
} | null | undefined;

export type QuickGoDriveTime = {
  /** Minutes to display, or null when no trustworthy drive time exists. */
  minutes: number | null;
  /** True when the UI should show a "drive time unavailable" message. */
  unavailable: boolean;
};

/**
 * Resolve the drive time to display for a Quick Go trip. A bare `duration === 0`
 * is NOT a valid drive time (Google Routes returns 0 on the fallback path); it is
 * only treated as a real "you're already there" time when there is an explicit
 * same-place signal (zero distance on a real, non-fallback route).
 */
export function resolveQuickGoDriveTime(traffic: QuickGoDriveTimeInput): QuickGoDriveTime {
  if (!traffic) return { minutes: null, unavailable: true };

  if (traffic.routeUnavailable === true) {
    return { minutes: null, unavailable: true };
  }

  const duration = typeof traffic.duration === 'number' ? traffic.duration : null;

  if (duration != null && Number.isFinite(duration) && duration > 0) {
    return { minutes: duration, unavailable: false };
  }

  const explicitSamePlace =
    duration === 0 &&
    traffic.distanceMeters === 0 &&
    traffic.trustStatus !== 'fallback';

  if (explicitSamePlace) {
    return { minutes: 0, unavailable: false };
  }

  return { minutes: null, unavailable: true };
}

export function resolveQuickGoBestWay(input: {
  tripData: TripData;
  rankedOptions: RankedRecommendation[];
  driveMinutes: number | null;
  classification: DestinationParkingClassification;
}): QuickGoBestWayResult {
  const transportPreference: TransportAvailability =
    input.tripData.transportAvailability || 'all';
  const drivingAvailable =
    transportPreference === 'all' || transportPreference === 'car';
  const ridesharePreferred = transportPreference === 'rideshare';
  const transitPreferred = transportPreference === 'transit';
  const hasDriveTime =
    input.driveMinutes != null &&
    Number.isFinite(input.driveMinutes) &&
    input.driveMinutes > 0;
  const freeRetailParking = input.classification.mode === 'free_likely';
  const restrictedOrPaidParking =
    input.classification.mode === 'paid_likely' ||
    input.classification.mode === 'restricted_possible' ||
    input.classification.mode === 'unknown';

  const rideshareOption = findRankedOption(input.rankedOptions, 'rideshare');
  const transitOption = findRankedOption(input.rankedOptions, 'transit');
  const parkingOption = findRankedOption(input.rankedOptions, 'parking');
  const rankedBest = input.rankedOptions[0] ?? null;
  const rankedBackup = input.rankedOptions[1] ?? null;

  if (transitPreferred) {
    return {
      bestWayLabel: formatRankedOptionLabel(transitOption) || 'Transit',
      backupWayLabel: formatRankedOptionLabel(rideshareOption) || 'Rideshare / taxi',
      bestOption: transitOption || rankedBest,
      backupOption: rideshareOption || rankedBackup,
    };
  }

  if (ridesharePreferred) {
    return {
      bestWayLabel: 'Rideshare / taxi',
      backupWayLabel: drivingAvailable ? 'Drive' : 'Transit',
      bestOption: rideshareOption || rankedBest,
      backupOption: drivingAvailable ? parkingOption || rankedBackup : transitOption || rankedBackup,
    };
  }

  if (
    freeRetailParking &&
    drivingAvailable &&
    (hasDriveTime || input.classification.confidence === 'high')
  ) {
    return {
      bestWayLabel: 'Drive',
      backupWayLabel: 'Rideshare / taxi',
      bestOption: parkingOption,
      backupOption: rideshareOption || rankedBackup,
    };
  }

  if (drivingAvailable && !restrictedOrPaidParking && hasDriveTime) {
    return {
      bestWayLabel: 'Drive',
      backupWayLabel: formatRankedOptionLabel(rideshareOption) || 'Rideshare / taxi',
      bestOption: parkingOption,
      backupOption: rideshareOption || rankedBackup,
    };
  }

  if (restrictedOrPaidParking && rideshareOption && rankedBest?.type === 'rideshare') {
    return {
      bestWayLabel: 'Rideshare / taxi',
      backupWayLabel: drivingAvailable ? 'Drive' : 'Transit',
      bestOption: rideshareOption,
      backupOption: drivingAvailable ? parkingOption || rankedBackup : transitOption || rankedBackup,
    };
  }

  return {
    bestWayLabel: formatRankedOptionLabel(rankedBest) || (drivingAvailable ? 'Drive' : 'Compare options'),
    backupWayLabel:
      formatRankedOptionLabel(rankedBackup) || formatRankedOptionLabel(rideshareOption) || 'Rideshare / taxi',
    bestOption: rankedBest,
    backupOption: rankedBackup,
  };
}

export function quickGoParkingHeadline(classification: DestinationParkingClassification): string {
  return destinationParkingHeadline(classification.mode);
}
