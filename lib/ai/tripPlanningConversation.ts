import { inferDestinationCategory } from '../parking/destinationParkingClassifier';
import { RETAIL_GROCERY_PATTERN } from '../parking/destinationParkingClassifier';
import { computeMissingParsedFields } from './normalizeParsedTrip';
import type { ParsedTripAssistantResult } from './tripParseTypes';
import type { ParkingPreference } from '../types';

export type TripPlanningContext = {
  geolocationAvailable: boolean;
  geolocationDenied: boolean;
  currentLocationLabel: string | null;
};

export type TripPlanningQuickReply = {
  id: string;
  label: string;
  value: string;
  patch?: Partial<ParsedTripAssistantResult>;
};

export type TripPlanningAssumption = {
  id: string;
  label: string;
};

export type TripPlanningTurn = {
  status: 'needs_clarification' | 'ready_for_review';
  headline: string;
  acknowledgment: string;
  question: string | null;
  quickReplies: TripPlanningQuickReply[];
  assumptions: TripPlanningAssumption[];
  nextField: string | null;
};

const CLARIFICATION_PRIORITY = [
  'destinationText',
  'originText',
  'departureDate',
  'departureTime',
  'targetTime',
  'airportCode',
  'parkingCheckInDate',
  'parkingCheckInTime',
  'parkingCheckOutDate',
  'parkingCheckOutTime',
  'parkingDurationMinutes',
  'transportAvailability',
  'parkingPreference',
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function inferDefaultParkingPreference(
  parsed: ParsedTripAssistantResult,
): ParkingPreference | null {
  if (parsed.parkingPreference) return parsed.parkingPreference;

  const transport = parsed.transportAvailability;
  if (transport === 'rideshare' || transport === 'transit') return 'none';

  const destination = String(parsed.destinationText || '').toLowerCase();
  const category = parsed.destinationCategory || inferDestinationCategory({ destination: parsed.destinationText });

  if (RETAIL_GROCERY_PATTERN.test(destination) || category === 'grocery_or_retail') {
    return 'destination';
  }

  if (
    parsed.mode === 'airport_trip' ||
    parsed.destinationKind === 'airport' ||
    /\b(airport|seatac|sea-tac)\b/i.test(destination)
  ) {
    return parsed.needsParking ? 'nearby' : 'none';
  }

  if (
    parsed.destinationKind === 'downtown' ||
    /\b(pike place|downtown|waterfront|stadium|arena|ballpark)\b/i.test(destination)
  ) {
    return 'nearby';
  }

  if (parsed.mode === 'quick_go' || parsed.mode === 'general_trip') {
    return 'nearby';
  }

  return null;
}

function inferDefaultParkingDurationMinutes(parsed: ParsedTripAssistantResult): number | null {
  if (parsed.parkingDurationMinutes) return parsed.parkingDurationMinutes;
  if (parsed.parkingPreference === 'none') return null;

  const destination = String(parsed.destinationText || '').toLowerCase();
  const category = parsed.destinationCategory || inferDestinationCategory({ destination: parsed.destinationText });

  if (RETAIL_GROCERY_PATTERN.test(destination) || category === 'grocery_or_retail') {
    return 90;
  }

  if (parsed.destinationKind === 'downtown' || /\b(pike place|downtown)\b/i.test(destination)) {
    return 180;
  }

  if (parsed.mode === 'airport_trip' && parsed.returnDate && parsed.departureDate) {
    return null;
  }

  return 120;
}

export function applyTripPlanningDefaults(
  parsed: ParsedTripAssistantResult,
  now = new Date(),
): ParsedTripAssistantResult {
  const next: ParsedTripAssistantResult = { ...parsed };

  if (!next.transportAvailability) {
    next.transportAvailability = 'all';
  }

  const parkingPreference = inferDefaultParkingPreference({
    ...next,
    transportAvailability: next.transportAvailability,
  });
  if (!next.parkingPreference && parkingPreference) {
    next.parkingPreference = parkingPreference;
  }

  if (next.mode === 'quick_go' || next.mode === 'general_trip') {
    if (!next.departureDate && !next.departureTime) {
      next.timeAnchor = 'now';
      next.departureDate = formatDateFromDate(now);
      next.departureTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    } else if (next.departureDate && !next.departureTime) {
      if (next.timeAnchor === 'now') {
        next.departureTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
      } else {
        next.timeAnchor = next.timeAnchor === 'unknown' ? 'arrive_by' : next.timeAnchor;
        next.departureTime = '09:00';
      }
    }
  }

  if (next.parkingPreference && next.parkingPreference !== 'none') {
    const duration = inferDefaultParkingDurationMinutes(next);
    if (!next.parkingDurationMinutes && duration) {
      next.parkingDurationMinutes = duration;
    }
  }

  if (next.mode === 'airport_trip' && !next.transportAvailability) {
    next.transportAvailability = 'all';
  }

  return next;
}

export function reprocessParsedTrip(
  parsed: ParsedTripAssistantResult,
  patch: Partial<ParsedTripAssistantResult> = {},
  now = new Date(),
): ParsedTripAssistantResult {
  return computeMissingParsedFields(applyTripPlanningDefaults({ ...parsed, ...patch }, now));
}

export function getNextMissingField(parsed: ParsedTripAssistantResult): string | null {
  const missing = new Set(parsed.missingFields);

  for (const field of CLARIFICATION_PRIORITY) {
    if (missing.has(field)) return field;
  }

  return parsed.missingFields[0] ?? null;
}

export function extractCityLabelFromAddress(address: string): string {
  const cleaned = address.trim().replace(/^current location near\s+/i, '');
  const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 3 && /^[A-Z]{2}$/i.test(parts[parts.length - 2])) {
    return `${parts[parts.length - 3]}, ${parts[parts.length - 2]}`;
  }

  if (parts.length >= 2) {
    return `${parts[0]}, ${parts[1]}`;
  }

  return cleaned || 'your area';
}

function destinationLabel(parsed: ParsedTripAssistantResult): string {
  return (
    parsed.destinationText ||
    parsed.destinationCity ||
    parsed.airportCode ||
    'your destination'
  );
}

function buildAcknowledgment(parsed: ParsedTripAssistantResult): string {
  const destination = destinationLabel(parsed);

  if (parsed.mode === 'airport_trip') {
    const airport = parsed.airportCode ? `${parsed.airportCode}` : 'the airport';
    if (parsed.destinationCity) {
      return `Got it — ${parsed.destinationCity} via ${airport}. I'll compare driving, parking, rideshare, and transit.`;
    }
    return `Got it — ${airport} trip. I'll compare driving, parking, rideshare, and transit.`;
  }

  if (parsed.mode === 'parking_only') {
    return `Got it — parking near ${destination}. I'll line up airport parking options.`;
  }

  return `Got it — ${destination}. I'll compare driving, parking, rideshare, and transit.`;
}

function buildAssumptions(parsed: ParsedTripAssistantResult): TripPlanningAssumption[] {
  const assumptions: TripPlanningAssumption[] = [];

  if (parsed.transportAvailability === 'all') {
    assumptions.push({
      id: 'compare-all',
      label: 'Compare all options',
    });
  }

  if (parsed.parkingPreference === 'destination') {
    assumptions.push({
      id: 'parking-destination',
      label: 'Destination parking',
    });
  } else if (parsed.parkingPreference === 'nearby') {
    assumptions.push({
      id: 'parking-nearby',
      label: 'Parking near destination',
    });
  } else if (parsed.parkingPreference === 'none') {
    assumptions.push({
      id: 'parking-none',
      label: 'No parking needed',
    });
  }

  if (parsed.timeAnchor === 'now') {
    assumptions.push({ id: 'leave-now', label: 'Leaving now' });
  } else if (parsed.departureDate && parsed.departureTime) {
    assumptions.push({
      id: 'arrival-time',
      label: `Arrive ${parsed.departureDate} ${parsed.departureTime}`,
    });
  }

  return assumptions;
}

function buildHeadline(parsed: ParsedTripAssistantResult): string {
  if (parsed.status === 'ready_for_review') return 'Ready to plan';
  if (parsed.missingFields.length <= 1) return 'I just need one detail';
  return 'Almost ready';
}

function buildOriginQuestion(
  parsed: ParsedTripAssistantResult,
  context: TripPlanningContext,
): { question: string; quickReplies: TripPlanningQuickReply[] } {
  const destination = destinationLabel(parsed);

  if (context.geolocationDenied) {
    return {
      question: 'No problem — enter your starting address.',
      quickReplies: [],
    };
  }

  if (context.geolocationAvailable && context.currentLocationLabel) {
    const city = extractCityLabelFromAddress(context.currentLocationLabel);
    return {
      question: `You're starting near ${city}. Is this right?`,
      quickReplies: [
        {
          id: 'origin-yes',
          label: 'Yes',
          value: 'Yes, use current location',
          patch: { originSource: 'current_location', originText: null },
        },
        {
          id: 'origin-change',
          label: 'Change start',
          value: 'Change starting point',
        },
      ],
    };
  }

  if (context.geolocationAvailable) {
    return {
      question: `Where are you starting from for ${destination}?`,
      quickReplies: [
        {
          id: 'origin-geo',
          label: 'Use current location',
          value: 'From current location',
          patch: { originSource: 'current_location', originText: null },
        },
        {
          id: 'origin-manual',
          label: 'Enter address',
          value: 'Starting from ',
        },
      ],
    };
  }

  return {
    question: `Where are you starting from for ${destination}?`,
    quickReplies: [],
  };
}

function buildQuestionForField(
  field: string,
  parsed: ParsedTripAssistantResult,
  context: TripPlanningContext,
): { question: string; quickReplies: TripPlanningQuickReply[] } {
  const destination = destinationLabel(parsed);

  switch (field) {
    case 'destinationText':
      return {
        question: 'Where would you like to go?',
        quickReplies: [],
      };
    case 'originText':
      return buildOriginQuestion(parsed, context);
    case 'targetTime':
      return {
        question: `What time do you want to arrive at ${destination}, or are you leaving now?`,
        quickReplies: [
          {
            id: 'time-now',
            label: 'Leave now',
            value: 'Leaving now',
            patch: {
              timeAnchor: 'now',
              departureDate: formatDateFromDate(new Date()),
              departureTime: `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`,
            },
          },
          { id: 'time-9', label: '9 AM', value: 'Arrive by 9 AM' },
          { id: 'time-noon', label: 'Noon', value: 'Arrive by noon' },
        ],
      };
    case 'airportCode':
      return {
        question: 'Which airport should I plan around?',
        quickReplies: [
          { id: 'airport-sea', label: 'SEA', value: 'SeaTac (SEA)' },
          { id: 'airport-pae', label: 'PAE', value: 'PAE' },
        ],
      };
    case 'departureDate':
    case 'departureTime':
      return {
        question: 'What date and time is your flight or airport arrival?',
        quickReplies: [
          { id: 'flight-friday', label: 'Friday night', value: 'Friday night flight' },
          { id: 'flight-morning', label: 'Morning', value: 'Morning flight' },
        ],
      };
    case 'parkingCheckInDate':
    case 'parkingCheckInTime':
    case 'parkingCheckOutDate':
    case 'parkingCheckOutTime':
      return {
        question: 'What parking check-in and check-out dates and times should I use?',
        quickReplies: [],
      };
    case 'parkingDurationMinutes':
      return {
        question: 'How long will you need parking?',
        quickReplies: [
          { id: 'park-2h', label: '2 hours', value: 'Park for 2 hours' },
          { id: 'park-4h', label: '4 hours', value: 'Park for 4 hours' },
          { id: 'park-8h', label: '8 hours', value: 'Park for 8 hours' },
        ],
      };
    case 'transportAvailability':
      return {
        question: "I'll compare all options unless you tell me otherwise. Prefer one mode?",
        quickReplies: [
          { id: 'mode-all', label: 'Compare all', value: 'Compare all options', patch: { transportAvailability: 'all' } },
          { id: 'mode-drive', label: 'Drive/park', value: 'Driving and parking only', patch: { transportAvailability: 'car' } },
          { id: 'mode-uber', label: 'Rideshare', value: 'Uber or rideshare only', patch: { transportAvailability: 'rideshare' } },
          { id: 'mode-transit', label: 'Transit', value: 'Transit only', patch: { transportAvailability: 'transit' } },
        ],
      };
    case 'parkingPreference':
      return {
        question: "I'll include parking near the destination unless you say otherwise.",
        quickReplies: [
          { id: 'park-nearby', label: 'Nearby parking', value: 'Find nearby parking', patch: { parkingPreference: 'nearby' } },
          { id: 'park-dest', label: 'At destination', value: 'Use destination parking', patch: { parkingPreference: 'destination' } },
          { id: 'park-none', label: 'No parking', value: 'No parking needed', patch: { parkingPreference: 'none' } },
        ],
      };
    default:
      return {
        question: 'Can you add the missing trip detail?',
        quickReplies: [],
      };
  }
}

function buildTurnFromProcessed(
  processed: ParsedTripAssistantResult,
  context: TripPlanningContext,
): TripPlanningTurn {
  const nextField = getNextMissingField(processed);

  if (processed.status === 'ready_for_review' || !nextField) {
    return {
      status: 'ready_for_review',
      headline: 'Ready to plan',
      acknowledgment: buildAcknowledgment(processed),
      question: 'Looks good — review the details and tap Plan Trip when you are ready.',
      quickReplies: [],
      assumptions: buildAssumptions(processed),
      nextField: null,
    };
  }

  const { question, quickReplies } = buildQuestionForField(nextField, processed, context);

  return {
    status: 'needs_clarification',
    headline: buildHeadline(processed),
    acknowledgment: buildAcknowledgment(processed),
    question,
    quickReplies,
    assumptions: buildAssumptions(processed),
    nextField,
  };
}

export function buildTripPlanningTurn(
  parsed: ParsedTripAssistantResult,
  context: TripPlanningContext,
): TripPlanningTurn {
  return buildTurnFromProcessed(reprocessParsedTrip(parsed), context);
}

export function buildSingleClarificationQuestion(
  parsed: ParsedTripAssistantResult,
  context: TripPlanningContext = {
    geolocationAvailable: false,
    geolocationDenied: false,
    currentLocationLabel: null,
  },
): string {
  const nextField = getNextMissingField(parsed);
  if (!nextField) return '';
  const { question } = buildQuestionForField(nextField, parsed, context);
  return question;
}
