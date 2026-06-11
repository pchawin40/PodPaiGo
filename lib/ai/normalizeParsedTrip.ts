import {
  applyTripPlanningDefaults,
  buildSingleClarificationQuestion,
} from './tripPlanningConversation';
import { needsPassengerCount } from './drivingPreferences';
import type {
  ParsedTripAssistantResult,
  ParsedTripTimeAnchor,
  TripParseMode,
} from './tripParseTypes';
import type { DestinationCategory } from '../parking/destinationParkingClassifier';
import type {
  DestinationKind,
  ParkingPreference,
  TransportAvailability,
} from '../types';

const CONFIDENCE_VALUES = new Set<ParsedTripAssistantResult['confidence']>(['high', 'medium', 'low']);

const MODE_VALUES = new Set<TripParseMode>([
  'airport_trip',
  'general_trip',
  'quick_go',
  'parking_only',
  'unknown',
]);

const ORIGIN_SOURCE_VALUES = new Set<ParsedTripAssistantResult['originSource']>([
  'current_location',
  'manual',
  'saved',
  'unknown',
]);

const DESTINATION_CATEGORY_VALUES = new Set<DestinationCategory>([
  'airport',
  'grocery_or_retail',
  'office_or_workplace',
  'hiking_or_park',
  'restaurant',
  'hotel',
  'general',
]);

const DESTINATION_KIND_VALUES = new Set<DestinationKind>([
  'airport',
  'office',
  'downtown',
  'stadium',
  'event',
  'hospital',
  'restaurant',
  'hotel',
  'general',
]);

const TRANSPORT_VALUES = new Set<TransportAvailability>([
  'car',
  'rideshare',
  'transit',
  'all',
]);

const PARKING_PREFERENCE_VALUES = new Set<ParkingPreference>([
  'none',
  'destination',
  'nearby',
]);

const TIME_ANCHOR_VALUES = new Set<ParsedTripTimeAnchor>([
  'arrive_by',
  'depart_at',
  'now',
  'unknown',
]);

const LOCAL_DESTINATION_KINDS = new Set<DestinationKind>([
  'office',
  'downtown',
  'stadium',
  'event',
  'hospital',
  'restaurant',
  'hotel',
  'general',
]);

const LOCAL_DESTINATION_PATTERN =
  /\b(pike place|fred meyer|safeway|costco|walmart|target|restaurant|hotel|hospital|downtown|grocery|trailhead|office|mall|square|market)\b/i;

const AIRPORT_DESTINATION_PATTERN =
  /\b(airport|seatac|sea-tac|terminal|airfield|international airport)\b/i;

const KNOWN_AIRPORT_CODES = new Set([
  'SEA',
  'LAX',
  'LAS',
  'SFO',
  'ORD',
  'JFK',
  'DFW',
  'ATL',
  'DEN',
  'PHX',
  'MCO',
  'PAE',
  'BLI',
]);

function destinationTextLooksLikeAirport(destinationText: string): boolean {
  if (AIRPORT_DESTINATION_PATTERN.test(destinationText)) return true;

  const upper = destinationText.toUpperCase();
  for (const match of upper.matchAll(/\b([A-Z]{3})\b/g)) {
    if (KNOWN_AIRPORT_CODES.has(match[1])) return true;
  }

  return false;
}

export function isLocalDestinationTrip(
  parsed: {
    destinationText?: string | null;
    destinationKind?: DestinationKind | null;
    destinationCategory?: DestinationCategory | null;
  },
): boolean {
  if (parsed.destinationCategory === 'airport' || parsed.destinationKind === 'airport') {
    return false;
  }

  if (parsed.destinationText?.trim()) {
    if (destinationTextLooksLikeAirport(parsed.destinationText)) return false;
    if (LOCAL_DESTINATION_PATTERN.test(parsed.destinationText)) return true;
    if (parsed.destinationKind && LOCAL_DESTINATION_KINDS.has(parsed.destinationKind)) {
      return true;
    }
  }

  return false;
}

export function isAirportPlanningTrip(
  parsed: Pick<
    ParsedTripAssistantResult,
    | 'mode'
    | 'destinationKind'
    | 'destinationCategory'
    | 'destinationText'
    | 'airportCode'
    | 'destinationCity'
  >,
): boolean {
  if (isLocalDestinationTrip(parsed)) return false;

  if (parsed.destinationKind === 'airport' || parsed.destinationCategory === 'airport') {
    return true;
  }

  if (parsed.mode === 'parking_only') {
    return Boolean(parsed.airportCode) || !parsed.destinationText?.trim();
  }

  if (parsed.mode === 'airport_trip') {
    return Boolean(parsed.airportCode || parsed.destinationCity);
  }

  return false;
}

type TripModeResolutionInput = {
  mode?: TripParseMode | null;
  destinationText?: string | null;
  destinationKind?: DestinationKind | null;
  destinationCategory?: DestinationCategory | null;
  airportCode?: string | null;
  destinationCity?: string | null;
};

function resolveTripMode(parsed: TripModeResolutionInput): TripParseMode {
  const destinationKind =
    parsed.destinationKind ??
    inferDestinationKindFromCategory(parsed.destinationCategory ?? null, parsed.destinationText ?? null);
  const classification = {
    destinationText: parsed.destinationText ?? null,
    destinationKind,
    destinationCategory: parsed.destinationCategory ?? null,
  };
  const explicit =
    parsed.mode && MODE_VALUES.has(parsed.mode) && parsed.mode !== 'unknown'
      ? parsed.mode
      : null;

  if (isLocalDestinationTrip(classification)) {
    if (explicit === 'parking_only') return 'parking_only';
    if (explicit === 'general_trip') return 'general_trip';
    return 'quick_go';
  }

  if (
    destinationKind === 'airport' ||
    parsed.destinationCategory === 'airport' ||
    parsed.airportCode
  ) {
    if (explicit === 'parking_only') return 'parking_only';
    return 'airport_trip';
  }

  if (explicit) return explicit;

  if (parsed.destinationText?.trim()) return 'quick_go';
  if (parsed.destinationCity || parsed.airportCode) return 'airport_trip';

  return 'unknown';
}

function reconcileTripMode(parsed: ParsedTripAssistantResult): ParsedTripAssistantResult {
  const mode = resolveTripMode(parsed);
  const localMode = mode === 'quick_go' || mode === 'general_trip';
  const shouldClearAirport = localMode && Boolean(parsed.airportCode);

  if (mode === parsed.mode && !shouldClearAirport) {
    return parsed;
  }

  return {
    ...parsed,
    mode,
    airportCode: localMode ? null : parsed.airportCode,
    tripType: localMode
      ? mode === 'general_trip'
        ? 'general-trip'
        : 'quick-go'
      : parsed.tripType,
  };
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

function normalizeMinutes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const minutes = Math.round(value);
  return minutes > 0 ? minutes : null;
}

function inferDestinationKindFromCategory(
  category: DestinationCategory | null,
  destinationText: string | null,
): DestinationKind {
  const lower = String(destinationText || '').toLowerCase();
  if (/\b(pike place|downtown|waterfront|market district)\b/.test(lower)) return 'downtown';

  switch (category) {
    case 'airport':
      return 'airport';
    case 'office_or_workplace':
      return 'office';
    case 'restaurant':
      return 'restaurant';
    case 'hotel':
      return 'hotel';
    case 'grocery_or_retail':
    case 'hiking_or_park':
    case 'general':
    default:
      return 'general';
  }
}

function buildClarificationQuestions(parsed: ParsedTripAssistantResult): string[] {
  if (parsed.missingFields.length === 0) return [];
  const question = buildSingleClarificationQuestion(parsed);
  return question ? [question] : [];
}

export function normalizeParsedTripAssistantResult(
  raw: unknown,
  parser: ParsedTripAssistantResult['parser'],
): ParsedTripAssistantResult | null {
  if (!raw || typeof raw !== 'object') return null;

  const parsed = raw as Partial<ParsedTripAssistantResult>;
  const confidence = CONFIDENCE_VALUES.has(parsed.confidence as ParsedTripAssistantResult['confidence'])
    ? (parsed.confidence as ParsedTripAssistantResult['confidence'])
    : 'medium';

  const originSource = ORIGIN_SOURCE_VALUES.has(
    parsed.originSource as ParsedTripAssistantResult['originSource'],
  )
    ? (parsed.originSource as ParsedTripAssistantResult['originSource'])
    : 'unknown';

  const destinationCategory =
    parsed.destinationCategory &&
    DESTINATION_CATEGORY_VALUES.has(parsed.destinationCategory as DestinationCategory)
      ? (parsed.destinationCategory as DestinationCategory)
      : null;
  const destinationText = normalizeNullableString(parsed.destinationText);
  const destinationKind =
    parsed.destinationKind &&
    DESTINATION_KIND_VALUES.has(parsed.destinationKind as DestinationKind)
      ? (parsed.destinationKind as DestinationKind)
      : inferDestinationKindFromCategory(destinationCategory, destinationText);
  const mode = resolveTripMode({
    mode: parsed.mode,
    destinationText,
    destinationKind,
    destinationCategory,
    airportCode:
      typeof parsed.airportCode === 'string'
        ? parsed.airportCode.trim().toUpperCase() || null
        : null,
    destinationCity: normalizeNullableString(parsed.destinationCity),
  });
  const transportAvailability =
    parsed.transportAvailability &&
    TRANSPORT_VALUES.has(parsed.transportAvailability as TransportAvailability)
      ? (parsed.transportAvailability as TransportAvailability)
      : null;
  const parkingPreference =
    parsed.parkingPreference &&
    PARKING_PREFERENCE_VALUES.has(parsed.parkingPreference as ParkingPreference)
      ? (parsed.parkingPreference as ParkingPreference)
      : null;
  const timeAnchor =
    parsed.timeAnchor &&
    TIME_ANCHOR_VALUES.has(parsed.timeAnchor as ParsedTripTimeAnchor)
      ? (parsed.timeAnchor as ParsedTripTimeAnchor)
      : 'unknown';

  const normalized: ParsedTripAssistantResult = {
    mode,
    destinationText,
    originSource,
    destinationCategory,
    destinationKind,
    originText: normalizeNullableString(parsed.originText),
    airportCode:
      typeof parsed.airportCode === 'string'
        ? parsed.airportCode.trim().toUpperCase() || null
        : null,
    destinationCity: normalizeNullableString(parsed.destinationCity),
    airlineText: normalizeNullableString(parsed.airlineText),
    departureDate: normalizeNullableString(parsed.departureDate),
    departureTime: normalizeNullableString(parsed.departureTime),
    timeAnchor,
    returnDate: normalizeNullableString(parsed.returnDate),
    returnTime: normalizeNullableString(parsed.returnTime),
    parkingCheckInDate: normalizeNullableString(parsed.parkingCheckInDate),
    parkingCheckInTime: normalizeNullableString(parsed.parkingCheckInTime),
    parkingCheckOutDate: normalizeNullableString(parsed.parkingCheckOutDate),
    parkingCheckOutTime: normalizeNullableString(parsed.parkingCheckOutTime),
    parkingDurationMinutes: normalizeMinutes(parsed.parkingDurationMinutes),
    transportAvailability,
    parkingPreference,
    tripCity: normalizeNullableString(parsed.tripCity),
    drivingPreferences:
      parsed.drivingPreferences && typeof parsed.drivingPreferences === 'object'
        ? parsed.drivingPreferences
        : null,
    eventContext:
      parsed.eventContext && typeof parsed.eventContext === 'object'
        ? parsed.eventContext
        : null,
    tripType: normalizeNullableString(parsed.tripType),
    needsParking: parsed.needsParking === true,
    needsLeaveTime: parsed.needsLeaveTime !== false,
    confidence,
    missingFields: Array.isArray(parsed.missingFields)
      ? parsed.missingFields.map(String).filter(Boolean)
      : [],
    clarificationQuestions: Array.isArray(parsed.clarificationQuestions)
      ? parsed.clarificationQuestions.map(String).filter(Boolean).slice(0, 3)
      : [],
    parser,
  };

  return computeMissingParsedFields(normalized);
}

export function computeMissingParsedFields(
  parsed: ParsedTripAssistantResult,
): ParsedTripAssistantResult {
  const reconciled = reconcileTripMode(parsed);
  const withDefaults = applyTripPlanningDefaults(reconciled);
  const missingFields = new Set(withDefaults.missingFields);
  const localTrip =
    withDefaults.mode === 'general_trip' ||
    withDefaults.mode === 'quick_go' ||
    !isAirportPlanningTrip(withDefaults);

  if (localTrip) {
    if (!withDefaults.destinationText?.trim()) missingFields.add('destinationText');
    else missingFields.delete('destinationText');

    if (withDefaults.originSource !== 'current_location' && !withDefaults.originText?.trim()) {
      missingFields.add('originText');
    } else {
      missingFields.delete('originText');
    }

    if (withDefaults.timeAnchor !== 'now' && (!withDefaults.departureDate || !withDefaults.departureTime)) {
      missingFields.add('targetTime');
    } else {
      missingFields.delete('targetTime');
    }

    missingFields.delete('transportAvailability');
    missingFields.delete('parkingPreference');

    const parkingPreference = withDefaults.parkingPreference;
    const overnightParking =
      withDefaults.parkingCheckOutDate &&
      withDefaults.departureDate &&
      withDefaults.parkingCheckOutDate !== withDefaults.departureDate;

    if (
      parkingPreference &&
      parkingPreference !== 'none' &&
      !withDefaults.parkingDurationMinutes &&
      overnightParking
    ) {
      missingFields.add('parkingDurationMinutes');
    } else {
      missingFields.delete('parkingDurationMinutes');
    }

    missingFields.delete('airportCode');
    missingFields.delete('departureDate');
    missingFields.delete('departureTime');
  } else if (withDefaults.mode === 'parking_only') {
    if (isAirportPlanningTrip(withDefaults)) {
      if (!withDefaults.airportCode) missingFields.add('airportCode');
      else missingFields.delete('airportCode');
      missingFields.delete('destinationText');
    } else if (!withDefaults.destinationText?.trim()) {
      missingFields.add('destinationText');
    } else {
      missingFields.delete('destinationText');
      missingFields.delete('airportCode');
    }

    if (!withDefaults.parkingCheckInDate) missingFields.add('parkingCheckInDate');
    else missingFields.delete('parkingCheckInDate');
    if (!withDefaults.parkingCheckInTime) missingFields.add('parkingCheckInTime');
    else missingFields.delete('parkingCheckInTime');
    if (!withDefaults.parkingCheckOutDate) missingFields.add('parkingCheckOutDate');
    else missingFields.delete('parkingCheckOutDate');
    if (!withDefaults.parkingCheckOutTime) missingFields.add('parkingCheckOutTime');
    else missingFields.delete('parkingCheckOutTime');
  } else if (isAirportPlanningTrip(withDefaults)) {
    if (!withDefaults.originText && withDefaults.originSource !== 'current_location') {
      missingFields.add('originText');
    } else {
      missingFields.delete('originText');
    }
    if (!withDefaults.airportCode) missingFields.add('airportCode');
    else missingFields.delete('airportCode');
    if (!withDefaults.departureDate) missingFields.add('departureDate');
    else missingFields.delete('departureDate');
    if (!withDefaults.departureTime) missingFields.add('departureTime');
    else missingFields.delete('departureTime');
    missingFields.delete('transportAvailability');
    missingFields.delete('destinationText');
  }

  // Soft event game/start-time slot. Asked once, then satisfiable either by a
  // real time (eventTimeKnown) or a cautious "arrive early" default
  // (eventTimeAcknowledged). We never invent a real game time.
  const eventContext = withDefaults.eventContext;
  if (
    eventContext?.isEvent &&
    !eventContext.eventTimeKnown &&
    !eventContext.eventTimeAcknowledged
  ) {
    missingFields.add('eventTime');
  } else {
    missingFields.delete('eventTime');
  }

  // Soft carpool passenger-count slot. Only appears when the user signalled
  // carpool/HOV/Express Pass intent without stating how many people are riding.
  if (needsPassengerCount(withDefaults.drivingPreferences)) {
    missingFields.add('passengerCount');
  } else {
    missingFields.delete('passengerCount');
  }

  const next: ParsedTripAssistantResult = {
    ...withDefaults,
    missingFields: Array.from(missingFields),
  };

  return {
    ...next,
    status: next.missingFields.length > 0 ? 'needs_clarification' : 'ready_for_review',
    clarificationQuestions:
      next.missingFields.length > 0
        ? buildClarificationQuestions(next)
        : [],
  };
}
