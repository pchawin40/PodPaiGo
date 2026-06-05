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

function addQuestion(questions: string[], question: string): void {
  if (questions.length >= 3) return;
  if (!questions.includes(question)) questions.push(question);
}

function missingHas(missingFields: Set<string>, ...keys: string[]): boolean {
  return keys.some((key) => missingFields.has(key));
}

function buildClarificationQuestions(parsed: ParsedTripAssistantResult): string[] {
  const missingFields = new Set(parsed.missingFields);
  const questions: string[] = [];
  const destination = parsed.destinationText || parsed.destinationCity || 'your destination';

  if (parsed.mode === 'general_trip' || parsed.mode === 'quick_go') {
    if (missingFields.has('originText') && missingFields.has('targetTime')) {
      addQuestion(
        questions,
        `Where are you starting from, and what time do you want to arrive at ${destination}?`,
      );
    } else if (missingFields.has('originText')) {
      addQuestion(questions, `Where are you starting from for ${destination}?`);
    } else if (missingFields.has('targetTime')) {
      addQuestion(questions, `What time do you want to arrive at ${destination}, or are you leaving now?`);
    }

    if (missingFields.has('transportAvailability')) {
      addQuestion(
        questions,
        'Should I compare all options, or prefer driving/parking, rideshare, or transit?',
      );
    }

    if (missingFields.has('parkingPreference')) {
      addQuestion(
        questions,
        'Will you need destination parking, nearby parking, or no parking?',
      );
    }

    if (missingFields.has('parkingDurationMinutes')) {
      addQuestion(questions, 'How long will you need parking?');
    }
  } else if (parsed.mode === 'parking_only') {
    if (missingHas(missingFields, 'airportCode', 'destinationText')) {
      addQuestion(questions, 'Which airport or destination do you need parking for?');
    }
    if (missingHas(
      missingFields,
      'parkingCheckInDate',
      'parkingCheckInTime',
      'parkingCheckOutDate',
      'parkingCheckOutTime',
    )) {
      addQuestion(
        questions,
        'What parking check-in and check-out dates and times should I use?',
      );
    }
    if (missingFields.has('originText')) {
      addQuestion(
        questions,
        'Optional: where are you starting from if you want route timing too?',
      );
    }
  } else {
    if (missingFields.has('originText') && missingHas(missingFields, 'departureDate', 'departureTime')) {
      addQuestion(
        questions,
        'Where are you starting from, and what date and time is the flight or airport arrival?',
      );
    } else if (missingFields.has('originText')) {
      addQuestion(questions, 'Where are you starting from?');
    }

    if (missingFields.has('airportCode')) {
      addQuestion(questions, 'Which airport should I plan around?');
    }

    if (missingHas(missingFields, 'departureDate', 'departureTime')) {
      addQuestion(questions, 'What date and time is the flight or airport arrival?');
    }

    if (missingFields.has('transportAvailability')) {
      addQuestion(
        questions,
        'Should I compare all options, or prefer driving/parking, rideshare, or transit?',
      );
    }
  }

  if (questions.length === 0 && parsed.missingFields.length > 0) {
    addQuestion(questions, 'Can you add the missing trip details so I can prepare the review?');
  }

  return questions;
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
  const missingFields = new Set(parsed.missingFields);

  if (parsed.mode === 'general_trip' || parsed.mode === 'quick_go') {
    if (!parsed.destinationText?.trim()) missingFields.add('destinationText');
    else missingFields.delete('destinationText');

    if (parsed.originSource !== 'current_location' && !parsed.originText?.trim()) {
      missingFields.add('originText');
    } else {
      missingFields.delete('originText');
    }

    if (parsed.timeAnchor !== 'now' && (!parsed.departureDate || !parsed.departureTime)) {
      missingFields.add('targetTime');
    } else {
      missingFields.delete('targetTime');
    }

    if (!parsed.transportAvailability) {
      missingFields.add('transportAvailability');
    } else {
      missingFields.delete('transportAvailability');
    }

    const parkingPreference =
      parsed.parkingPreference ||
      (parsed.transportAvailability === 'rideshare' || parsed.transportAvailability === 'transit'
        ? 'none'
        : null);

    if (!parkingPreference) {
      missingFields.add('parkingPreference');
    } else {
      missingFields.delete('parkingPreference');
    }

    if (
      parkingPreference &&
      parkingPreference !== 'none' &&
      !parsed.parkingDurationMinutes
    ) {
      missingFields.add('parkingDurationMinutes');
    } else {
      missingFields.delete('parkingDurationMinutes');
    }

    missingFields.delete('airportCode');
    missingFields.delete('departureDate');
    missingFields.delete('departureTime');
  } else if (parsed.mode === 'parking_only') {
    if (!parsed.airportCode && !parsed.destinationText?.trim()) {
      missingFields.add('airportCode');
    } else {
      missingFields.delete('airportCode');
      missingFields.delete('destinationText');
    }

    if (!parsed.parkingCheckInDate) missingFields.add('parkingCheckInDate');
    else missingFields.delete('parkingCheckInDate');
    if (!parsed.parkingCheckInTime) missingFields.add('parkingCheckInTime');
    else missingFields.delete('parkingCheckInTime');
    if (!parsed.parkingCheckOutDate) missingFields.add('parkingCheckOutDate');
    else missingFields.delete('parkingCheckOutDate');
    if (!parsed.parkingCheckOutTime) missingFields.add('parkingCheckOutTime');
    else missingFields.delete('parkingCheckOutTime');
  } else {
    if (!parsed.originText) missingFields.add('originText');
    else missingFields.delete('originText');
    if (!parsed.airportCode) missingFields.add('airportCode');
    else missingFields.delete('airportCode');
    if (!parsed.departureDate) missingFields.add('departureDate');
    else missingFields.delete('departureDate');
    if (!parsed.departureTime) missingFields.add('departureTime');
    else missingFields.delete('departureTime');
    if (!parsed.transportAvailability) missingFields.add('transportAvailability');
    else missingFields.delete('transportAvailability');
    missingFields.delete('destinationText');
  }

  const next: ParsedTripAssistantResult = {
    ...parsed,
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
