import {
  applyTripPlanningDefaults,
  buildSingleClarificationQuestion,
} from './tripPlanningConversation';
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

function resolveMode(parsed: Partial<ParsedTripAssistantResult>): TripParseMode {
  if (parsed.mode && MODE_VALUES.has(parsed.mode)) {
    return parsed.mode;
  }
  return 'airport_trip';
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

  const mode = resolveMode(parsed);
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
  const withDefaults = applyTripPlanningDefaults(parsed);
  const missingFields = new Set(withDefaults.missingFields);

  if (withDefaults.mode === 'general_trip' || withDefaults.mode === 'quick_go') {
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
    if (!withDefaults.airportCode && !withDefaults.destinationText?.trim()) {
      missingFields.add('airportCode');
    } else {
      missingFields.delete('airportCode');
      missingFields.delete('destinationText');
    }

    if (!withDefaults.parkingCheckInDate) missingFields.add('parkingCheckInDate');
    else missingFields.delete('parkingCheckInDate');
    if (!withDefaults.parkingCheckInTime) missingFields.add('parkingCheckInTime');
    else missingFields.delete('parkingCheckInTime');
    if (!withDefaults.parkingCheckOutDate) missingFields.add('parkingCheckOutDate');
    else missingFields.delete('parkingCheckOutDate');
    if (!withDefaults.parkingCheckOutTime) missingFields.add('parkingCheckOutTime');
    else missingFields.delete('parkingCheckOutTime');
  } else {
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
