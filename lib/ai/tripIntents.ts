import { parseTripTextMock } from './mockTripParser';
import { extractDrivingPreferences } from './drivingPreferences';
import { inferEventVenue, type EventVenueInference } from './eventVenueInference';
import { detectTripCity, extractLodgingContext } from './lodgingContext';
import { isAirportPlanningTrip } from './normalizeParsedTrip';
import {
  buildSingleClarificationQuestion,
  reprocessParsedTrip,
  type TripPlanningIntentCard,
} from './tripPlanningConversation';
import type { DrivingPreferences, ParsedTripAssistantResult } from './tripParseTypes';
import type {
  TripIntent,
  TripIntentExtraction,
  TripIntentType,
} from './tripIntentTypes';

const NEW_TRIP_CONNECTOR =
  /^(also|additionally|then|next|second(?:ly)?|and then|lastly|finally|plus)\b/i;
const NEW_TRIP_PHRASE =
  /\b(for my [a-z\s]{0,24}?trip|when i['’]?m? in|when i am in|while i['’]?m? (?:in|there)|while i am (?:in|there)|on my [a-z\s]{0,24}?trip|second trip|another trip|other trip|next trip)\b/i;

const TRIP_CONTENT_SIGNAL =
  /\b(to|from|get to|drive|trip|game|stadium|arena|airport|seatac|sea-tac|hotel|staying|fly|flight)\b/i;

function looksLikeTripSentence(sentence: string): boolean {
  return TRIP_CONTENT_SIGNAL.test(sentence);
}

function startsNewIntent(sentence: string): boolean {
  if (!looksLikeTripSentence(sentence)) return false;
  return NEW_TRIP_CONNECTOR.test(sentence.trim()) || NEW_TRIP_PHRASE.test(sentence);
}

/**
 * Split a free-text message into intent segments. Conservative: it only starts a
 * new segment when a sentence opens with a new-trip connector ("Also …",
 * "for my Vegas trip", "when I'm in …"). A single trip described across several
 * sentences (e.g. an event + lodging + dates) stays as one segment.
 */
export function segmentTripText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences = trimmed
    .split(/(?<=[.;!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length <= 1) return [trimmed];

  const segments: string[] = [];
  let current: string[] = [];

  for (const sentence of sentences) {
    if (current.length > 0 && startsNewIntent(sentence)) {
      segments.push(current.join(' '));
      current = [sentence];
    } else {
      current.push(sentence);
    }
  }

  if (current.length) segments.push(current.join(' '));
  return segments.length ? segments : [trimmed];
}

function shortPlace(value: string | null): string {
  if (!value) return 'Start';
  const beforeComma = value.split(',')[0]?.trim();
  return beforeComma || value;
}

function classifyIntentType(
  parsed: ParsedTripAssistantResult,
  eventInfo: EventVenueInference,
): TripIntentType {
  if (eventInfo.isEvent || parsed.eventContext?.isEvent) return 'event-local';
  if (parsed.mode === 'parking_only') return 'parking-only';
  if (isAirportPlanningTrip(parsed)) return 'airport-access';
  if (parsed.destinationText?.trim()) return 'general-local';
  return 'unknown';
}

function buildCompareModes(intentType: TripIntentType, dropoff: boolean): string[] {
  switch (intentType) {
    case 'event-local':
      // Event rules: official/prepaid parking, transit, rideshare, walk first;
      // street/meter only as a trailing fallback.
      return ['event-parking', 'transit', 'rideshare', 'walk', 'park-and-ride', 'street-meter'];
    case 'airport-access':
      return dropoff
        ? ['drive', 'parking', 'rideshare', 'transit', 'park-and-ride', 'dropoff']
        : ['drive', 'parking', 'rideshare', 'transit', 'park-and-ride'];
    case 'parking-only':
      return ['parking'];
    default:
      return ['drive', 'parking', 'rideshare', 'transit'];
  }
}

function buildBadges(
  intentType: TripIntentType,
  tripCity: string | null,
  prefs: DrivingPreferences | null,
): string[] {
  const badges: string[] = [];
  if (intentType === 'event-local') badges.push('Event');
  if (intentType === 'airport-access') badges.push('Airport');
  // City badge only when it's the destination city (not an airport origin city).
  if (tripCity && intentType !== 'airport-access') badges.push(tripCity);
  if (prefs?.carpoolPossible) badges.push('Carpool');
  if (prefs?.expressPassAvailable) badges.push('Express Pass');
  if (prefs?.tollLaneAllowed === true && !prefs.expressPassAvailable) badges.push('Toll lane');
  if (prefs?.avoidTolls) badges.push('Avoid tolls');
  return badges;
}

function buildTitle(
  intentType: TripIntentType,
  parsed: ParsedTripAssistantResult,
): string {
  const originLabel =
    parsed.originSource === 'current_location'
      ? 'Current location'
      : shortPlace(parsed.originText);

  const destination =
    intentType === 'airport-access'
      ? parsed.airportCode || 'Airport'
      : shortPlace(parsed.destinationText) || parsed.destinationCity || 'Destination';

  if (!parsed.originText && parsed.originSource !== 'current_location') {
    return destination;
  }
  return `${originLabel} → ${destination}`;
}

function buildSubtitle(
  intentType: TripIntentType,
  eventInfo: EventVenueInference,
): string {
  switch (intentType) {
    case 'event-local':
      return eventInfo.eventLabel || 'Event trip';
    case 'airport-access':
      return 'Airport access';
    case 'parking-only':
      return 'Parking';
    default:
      return 'Local trip';
  }
}

function intentConfidence(
  intentType: TripIntentType,
  parsed: ParsedTripAssistantResult,
  eventInfo: EventVenueInference,
): 'high' | 'medium' | 'low' {
  if (intentType === 'event-local') {
    if (parsed.originText && eventInfo.venueName) return 'high';
    if (eventInfo.venueName) return 'medium';
    return 'low';
  }
  return parsed.confidence;
}

function enrichSegment(
  segment: string,
  baseParsed: ParsedTripAssistantResult,
  now: Date,
): {
  parsed: ParsedTripAssistantResult;
  eventInfo: EventVenueInference;
  drivingPreferences: DrivingPreferences | null;
  tripCity: string | null;
} {
  const next: ParsedTripAssistantResult = { ...baseParsed };

  const tripCity = detectTripCity(segment);
  const lodging = extractLodgingContext(segment);
  const drivingPreferences = extractDrivingPreferences(segment);
  const eventInfo = inferEventVenue({
    text: segment,
    tripCity,
    destinationText: next.destinationText,
  });

  // Travel-context awareness: lodging overrides any home/current-location origin
  // for this destination-city trip.
  if (lodging) {
    next.originText = lodging.lodgingText;
    next.originSource = 'manual';
  }
  if (tripCity) next.tripCity = tripCity;

  if (eventInfo.isEvent) {
    if (eventInfo.venueName) {
      next.destinationText = eventInfo.venueName;
    }
    next.destinationKind = 'event';
    next.destinationCategory = 'stadium_event_venue';
    next.mode = 'quick_go';
    next.airportCode = null;
    next.eventContext = {
      isEvent: true,
      eventLabel: eventInfo.eventLabel,
      venueName: eventInfo.venueName,
      eventTimeKnown: false,
    };
    // Event parking should be official/paid lots, never customer/destination
    // parking; the engine applies the rest of the event-parking rules.
    if (!next.parkingPreference || next.parkingPreference === 'destination') {
      next.parkingPreference = 'nearby';
    }
    next.needsParking = next.parkingPreference !== 'none';
  }

  if (drivingPreferences) {
    next.drivingPreferences = drivingPreferences;
  }

  return {
    parsed: reprocessParsedTrip(next, {}, now),
    eventInfo,
    drivingPreferences,
    tripCity,
  };
}

function buildIntent(
  segment: string,
  index: number,
  baseParsed: ParsedTripAssistantResult,
  now: Date,
): TripIntent {
  const { parsed, eventInfo, drivingPreferences, tripCity } = enrichSegment(
    segment,
    baseParsed,
    now,
  );

  const intentType = classifyIntentType(parsed, eventInfo);
  const dropoff = /\b(drop ?off|pick ?up|curbside)\b/i.test(segment);

  return {
    id: `intent-${index}`,
    intentType,
    sourceText: segment,
    title: buildTitle(intentType, parsed),
    subtitle: buildSubtitle(intentType, eventInfo),
    badges: buildBadges(intentType, tripCity ?? parsed.tripCity ?? null, drivingPreferences),
    origin:
      parsed.originSource === 'current_location'
        ? 'Current location'
        : parsed.originText ?? null,
    originSource: parsed.originSource,
    destination:
      intentType === 'airport-access'
        ? parsed.airportCode ?? parsed.destinationCity ?? null
        : parsed.destinationText ?? null,
    tripCity: tripCity ?? parsed.tripCity ?? null,
    eventContext: parsed.eventContext ?? null,
    drivingPreferences: parsed.drivingPreferences ?? null,
    compareModes: buildCompareModes(intentType, dropoff),
    confidence: intentConfidence(intentType, parsed, eventInfo),
    missingSlots: parsed.missingFields,
    recommendedNextQuestion: buildSingleClarificationQuestion(parsed) || null,
    parsed,
  };
}

function intentButtonLabel(intent: TripIntent): string {
  switch (intent.intentType) {
    case 'airport-access':
      return `Plan ${intent.parsed.airportCode || 'airport'} trip`;
    case 'event-local': {
      const venue = intent.eventContext?.venueName || intent.destination || '';
      const venueWord = /\b(stadium|field|arena|ballpark|park)\b/i.test(venue) ? 'stadium' : 'event';
      const city = intent.tripCity ? `${intent.tripCity} ` : '';
      return `Plan ${city}${venueWord} trip`.replace(/\s+/g, ' ').trim();
    }
    case 'parking-only':
      return 'Plan parking';
    default:
      return `Plan ${shortPlace(intent.destination)} trip`;
  }
}

/** Build a selection card for a detected intent (used in the multi-intent UI). */
export function tripIntentToCard(intent: TripIntent): TripPlanningIntentCard {
  return {
    id: intent.id,
    title: intent.title,
    subtitle: intent.subtitle,
    badges: intent.badges,
    buttonLabel: intentButtonLabel(intent),
  };
}

const CONFIDENCE_RANK: Record<'high' | 'medium' | 'low', number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Extract one or more structured trip intents from a free-text message.
 *
 * - Single-segment messages produce one enriched intent. Pass `basePrimaryParsed`
 *   (the result of parseTripText) to keep any live-provider parse for that case.
 * - Multi-segment messages are parsed per-segment with the deterministic mock
 *   parser so additional intents never cost extra provider calls.
 */
export function extractTripIntents(
  userText: string,
  options: { now?: Date; basePrimaryParsed?: ParsedTripAssistantResult } = {},
): TripIntentExtraction {
  const now = options.now ?? new Date();
  const originalText = userText.trim();
  const segments = segmentTripText(originalText);

  if (segments.length === 0) {
    return { originalText, intents: [], primaryIntentId: null };
  }

  const intents = segments.map((segment, index) => {
    const base =
      segments.length === 1 && options.basePrimaryParsed
        ? options.basePrimaryParsed
        : parseTripTextMock(segment, now);
    return buildIntent(segment, index, base, now);
  });

  let primaryIntentId = intents[0]?.id ?? null;
  let bestRank = -1;
  intents.forEach((intent) => {
    const rank = CONFIDENCE_RANK[intent.confidence];
    if (rank > bestRank) {
      bestRank = rank;
      primaryIntentId = intent.id;
    }
  });

  return { originalText, intents, primaryIntentId };
}
