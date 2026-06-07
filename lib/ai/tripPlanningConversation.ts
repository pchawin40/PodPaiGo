import { inferDestinationCategory } from '../parking/destinationParkingClassifier';
import { RETAIL_GROCERY_PATTERN } from '../parking/destinationParkingClassifier';
import { computeMissingParsedFields, isAirportPlanningTrip } from './normalizeParsedTrip';
import type { ParsedTripAssistantResult } from './tripParseTypes';
import type { ParkingPreference } from '../types';

export type TripPlanningPhase =
  | 'idle'
  | 'parsed'
  | 'awaiting_origin_confirmation'
  | 'awaiting_origin_input'
  | 'ready_to_plan'
  | 'submitted'
  | 'review_edit';

export type TripPlanningContext = {
  geolocationAvailable: boolean;
  geolocationDenied: boolean;
  currentLocationLabel: string | null;
};

export type TripPlanningQuickReplyAction =
  | 'plan_trip'
  | 'change_start'
  | 'edit_details'
  | 'await_origin_input'
  | 'reject_origin_confirmation'
  | 'choose_recent_origin'
  | 'back_from_origin_input';

export type TripPlanningQuickReply = {
  id: string;
  label: string;
  value: string;
  patch?: Partial<ParsedTripAssistantResult>;
  action?: TripPlanningQuickReplyAction;
};

export type TripPlanningAssumption = {
  id: string;
  label: string;
};

export type TripPlanningSummaryItem = {
  id: string;
  label: string;
  value: string;
  field: 'destinationText' | 'originText' | 'targetTime' | 'transportAvailability' | 'parkingPreference';
};

export type TripPlanningTurn = {
  status: 'needs_clarification' | 'ready_for_review';
  phase: TripPlanningPhase;
  headline: string;
  acknowledgment: string;
  question: string | null;
  quickReplies: TripPlanningQuickReply[];
  assumptions: TripPlanningAssumption[];
  summary: TripPlanningSummaryItem[];
  nextField: string | null;
};

export type TripPlanningBuildOptions = {
  originInputMode?: boolean;
  originInputReason?: 'reject' | 'change' | 'default';
  reviewMode?: boolean;
  phase?: TripPlanningPhase;
};

export type TripPlanningEditingField = TripPlanningSummaryItem['field'];

export type TripPlanningPlaceholderInput = {
  phase: TripPlanningPhase;
  nextField: string | null;
  status: 'needs_clarification' | 'ready_for_review';
  originInputMode?: boolean;
  reviewMode?: boolean;
  editingField?: TripPlanningEditingField | null;
  page?: 'home' | 'trip' | 'results';
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

const TURN_SNAPSHOT_FIELDS = [
  'status',
  'mode',
  'destinationText',
  'originText',
  'originSource',
  'departureDate',
  'departureTime',
  'timeAnchor',
  'transportAvailability',
  'parkingPreference',
  'parkingDurationMinutes',
  'airportCode',
  'missingFields',
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
  const airportTrip = isAirportPlanningTrip(parsed);

  for (const field of CLARIFICATION_PRIORITY) {
    if (field === 'airportCode' && !airportTrip) continue;
    if (missing.has(field)) return field;
  }

  return parsed.missingFields.find((field) => field !== 'airportCode' || airportTrip) ?? null;
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

function originSummaryLabel(
  parsed: ParsedTripAssistantResult,
  context: TripPlanningContext,
): string {
  if (parsed.originSource === 'current_location') {
    return context.currentLocationLabel
      ? `Near ${extractCityLabelFromAddress(context.currentLocationLabel)}`
      : 'Current location';
  }

  return parsed.originText?.trim() || 'Not set';
}

function transportSummaryLabel(parsed: ParsedTripAssistantResult): string {
  switch (parsed.transportAvailability) {
    case 'all':
      return 'Compare all';
    case 'car':
      return 'Drive / park';
    case 'rideshare':
      return 'Rideshare';
    case 'transit':
      return 'Transit';
    default:
      return 'Compare all';
  }
}

function parkingSummaryLabel(parsed: ParsedTripAssistantResult): string {
  switch (parsed.parkingPreference) {
    case 'destination':
      return 'At destination';
    case 'nearby':
      return 'Near destination';
    case 'none':
      return 'No parking';
    default:
      return 'Near destination';
  }
}

function timeSummaryLabel(parsed: ParsedTripAssistantResult): string {
  if (parsed.timeAnchor === 'now') return 'Leaving now';
  if (parsed.departureDate && parsed.departureTime) {
    return `${parsed.departureDate} ${parsed.departureTime}`;
  }
  return 'Not set';
}

export function buildTripPlanningSummary(
  parsed: ParsedTripAssistantResult,
  context: TripPlanningContext,
): TripPlanningSummaryItem[] {
  return [
    {
      id: 'from',
      label: 'From',
      value: originSummaryLabel(parsed, context),
      field: 'originText',
    },
    {
      id: 'to',
      label: 'To',
      value: destinationLabel(parsed),
      field: 'destinationText',
    },
    {
      id: 'when',
      label: 'When',
      value: timeSummaryLabel(parsed),
      field: 'targetTime',
    },
    {
      id: 'compare',
      label: 'Compare',
      value: transportSummaryLabel(parsed),
      field: 'transportAvailability',
    },
    {
      id: 'parking',
      label: 'Parking',
      value: parkingSummaryLabel(parsed),
      field: 'parkingPreference',
    },
  ];
}

function parsedTripTurnSnapshot(parsed: ParsedTripAssistantResult | null): string {
  if (!parsed) return '';

  const snapshot: Record<string, unknown> = {};
  for (const field of TURN_SNAPSHOT_FIELDS) {
    if (field === 'missingFields') {
      snapshot[field] = [...parsed.missingFields].sort();
      continue;
    }
    snapshot[field] = parsed[field];
  }

  return JSON.stringify(snapshot);
}

export function shouldAppendPlanningTurn(
  previousTurn: TripPlanningTurn | null | undefined,
  nextTurn: TripPlanningTurn,
  previousParsed: ParsedTripAssistantResult | null,
  nextParsed: ParsedTripAssistantResult,
): boolean {
  if (!previousTurn) return true;

  if (previousTurn.phase !== nextTurn.phase) {
    return true;
  }

  if (
    nextTurn.status === 'ready_for_review' &&
    previousTurn.status === 'ready_for_review' &&
    parsedTripTurnSnapshot(previousParsed) === parsedTripTurnSnapshot(nextParsed)
  ) {
    return false;
  }

  if (
    previousTurn.phase === 'ready_to_plan' &&
    nextTurn.phase === 'ready_to_plan' &&
    parsedTripTurnSnapshot(previousParsed) === parsedTripTurnSnapshot(nextParsed)
  ) {
    return false;
  }

  if (
    previousTurn.phase === 'awaiting_origin_confirmation' &&
    nextTurn.phase === 'ready_to_plan' &&
    nextParsed.originSource === 'current_location' &&
    previousParsed?.originSource === 'current_location'
  ) {
    return false;
  }

  if (
    previousTurn.nextField &&
    previousTurn.nextField === nextTurn.nextField &&
    parsedTripTurnSnapshot(previousParsed) === parsedTripTurnSnapshot(nextParsed)
  ) {
    return false;
  }

  return true;
}

export function deriveTripPlanningPhase(
  parsed: ParsedTripAssistantResult,
  context: TripPlanningContext,
  options: TripPlanningBuildOptions = {},
): TripPlanningPhase {
  if (options.phase) return options.phase;
  if (options.reviewMode) return 'review_edit';

  // Use the already-processed parsed trip; reprocessParsedTrip would recurse back
  // through computeMissingParsedFields -> buildClarificationQuestions.
  const nextField = getNextMissingField(parsed);

  if (parsed.status === 'ready_for_review' || !nextField) {
    return 'ready_to_plan';
  }

  if (options.originInputMode) {
    return 'awaiting_origin_input';
  }

  if (
    nextField === 'originText' &&
    context.geolocationAvailable &&
    context.currentLocationLabel &&
    !context.geolocationDenied &&
    parsed.originSource !== 'current_location' &&
    !parsed.originText?.trim()
  ) {
    return 'awaiting_origin_confirmation';
  }

  return 'parsed';
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

function buildReadyQuickReplies(): TripPlanningQuickReply[] {
  return [
    {
      id: 'plan-trip',
      label: 'Plan trip',
      value: '',
      action: 'plan_trip',
    },
  ];
}

function buildOriginInputQuestion(
  parsed: ParsedTripAssistantResult,
  context: TripPlanningContext,
  options: TripPlanningBuildOptions = {},
): { question: string; quickReplies: TripPlanningQuickReply[] } {
  const destination = destinationLabel(parsed);
  const quickReplies: TripPlanningQuickReply[] = [];
  const rejected = options.originInputReason === 'reject';

  if (context.geolocationAvailable && !context.geolocationDenied) {
    quickReplies.push({
      id: 'origin-geo',
      label: 'Use current location',
      value: '',
      patch: { originSource: 'current_location', originText: null },
    });
  }

  quickReplies.push({
    id: 'origin-recent',
    label: 'Choose recent start',
    value: '',
    action: 'choose_recent_origin',
  });

  quickReplies.push({
    id: 'origin-back',
    label: 'Back',
    value: '',
    action: 'back_from_origin_input',
  });

  return {
    question: rejected
      ? 'No problem — where should I start from?'
      : `Enter your starting address for ${destination}.`,
    quickReplies,
  };
}

function buildOriginQuestion(
  parsed: ParsedTripAssistantResult,
  context: TripPlanningContext,
  phase: TripPlanningPhase,
  options: TripPlanningBuildOptions = {},
): { question: string; quickReplies: TripPlanningQuickReply[] } {
  const destination = destinationLabel(parsed);

  if (phase === 'awaiting_origin_input') {
    return buildOriginInputQuestion(parsed, context, options);
  }

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
          value: '',
          patch: { originSource: 'current_location', originText: null },
        },
        {
          id: 'origin-no',
          label: 'No',
          value: '',
          action: 'reject_origin_confirmation',
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
          value: '',
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
  phase: TripPlanningPhase,
  options: TripPlanningBuildOptions = {},
): { question: string; quickReplies: TripPlanningQuickReply[] } {
  const destination = destinationLabel(parsed);

  switch (field) {
    case 'destinationText':
      return {
        question: 'Where would you like to go?',
        quickReplies: [],
      };
    case 'originText':
      return buildOriginQuestion(parsed, context, phase, options);
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
      if (!isAirportPlanningTrip(parsed)) {
        return buildQuestionForField('originText', parsed, context, phase, options);
      }
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
  options: TripPlanningBuildOptions = {},
): TripPlanningTurn {
  const phase = deriveTripPlanningPhase(processed, context, options);
  const nextField = getNextMissingField(processed);

  if (processed.status === 'ready_for_review' || !nextField) {
    return {
      status: 'ready_for_review',
      phase: 'ready_to_plan',
      headline: 'Ready to plan',
      acknowledgment: buildAcknowledgment(processed),
      question: null,
      quickReplies: buildReadyQuickReplies(),
      assumptions: buildAssumptions(processed),
      summary: buildTripPlanningSummary(processed, context),
      nextField: null,
    };
  }

  const { question, quickReplies } = buildQuestionForField(
    nextField,
    processed,
    context,
    phase,
    options,
  );

  return {
    status: 'needs_clarification',
    phase,
    headline: buildHeadline(processed),
    acknowledgment: buildAcknowledgment(processed),
    question,
    quickReplies,
    assumptions: buildAssumptions(processed),
    summary: [],
    nextField,
  };
}

function editingFieldPlaceholder(field: TripPlanningEditingField): string {
  switch (field) {
    case 'originText':
      return 'Enter a starting address…';
    case 'destinationText':
      return 'Where are you going?';
    case 'targetTime':
      return 'When are you going?';
    case 'transportAvailability':
      return 'Choose how to compare options…';
    case 'parkingPreference':
      return 'Choose parking preference…';
    default:
      return 'Ask for a change, or tap Plan trip…';
  }
}

export function getTripPlanningPlaceholder(
  input: TripPlanningPlaceholderInput,
): string {
  if (input.page === 'results') {
    return 'Ask about leave time, parking, TSA, or weather…';
  }

  if (input.editingField) {
    return editingFieldPlaceholder(input.editingField);
  }

  if (input.originInputMode || input.phase === 'awaiting_origin_input') {
    return 'Enter a starting address…';
  }

  if (input.status === 'ready_for_review' || input.phase === 'ready_to_plan') {
    return 'Ask for a change, or tap Plan trip…';
  }

  if (input.nextField === 'destinationText') {
    return 'Where are you going?';
  }

  if (
    input.nextField === 'originText' ||
    input.phase === 'awaiting_origin_confirmation'
  ) {
    return 'Enter a starting address…';
  }

  if (
    input.nextField === 'targetTime' ||
    input.nextField === 'departureTime' ||
    input.nextField === 'departureDate'
  ) {
    return 'When are you going?';
  }

  return 'Describe a trip or destination…';
}

export function buildTripPlanningTurn(
  parsed: ParsedTripAssistantResult,
  context: TripPlanningContext,
  options: TripPlanningBuildOptions = {},
): TripPlanningTurn {
  return buildTurnFromProcessed(reprocessParsedTrip(parsed), context, options);
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
  const phase = deriveTripPlanningPhase(parsed, context);
  const { question } = buildQuestionForField(nextField, parsed, context, phase);
  return question;
}

export function isOriginConfirmationPatch(
  patch: Partial<ParsedTripAssistantResult> | undefined,
): boolean {
  return (
    patch?.originSource === 'current_location' &&
    (patch.originText === null || patch.originText === undefined)
  );
}
