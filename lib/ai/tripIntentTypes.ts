import type {
  DrivingPreferences,
  EventContext,
  ParsedTripAssistantResult,
  ParsedTripOriginSource,
} from './tripParseTypes';

/**
 * High-level classification of a single trip the user described. A user message
 * can contain several of these (multi-intent). Each TripIntent wraps the
 * existing ParsedTripAssistantResult so it can flow through the existing
 * conversation, review, and search-params machinery once selected.
 */
export type TripIntentType =
  | 'airport-access'
  | 'event-local'
  | 'general-local'
  | 'parking-only'
  | 'unknown';

export type TripIntent = {
  id: string;
  intentType: TripIntentType;
  /** The raw text segment this intent was extracted from. */
  sourceText: string;
  /** Short title for selection cards, e.g. "Monroe → SeaTac". */
  title: string;
  /** Secondary line for selection cards, e.g. "Airport access · carpool". */
  subtitle: string;
  /** Short badges, e.g. ["Event", "Express Pass"]. */
  badges: string[];
  origin: string | null;
  originSource: ParsedTripOriginSource;
  destination: string | null;
  tripCity: string | null;
  eventContext: EventContext | null;
  drivingPreferences: DrivingPreferences | null;
  compareModes: string[];
  confidence: 'high' | 'medium' | 'low';
  missingSlots: string[];
  recommendedNextQuestion: string | null;
  /** The underlying parsed trip, ready for the existing planner flow. */
  parsed: ParsedTripAssistantResult;
};

export type TripIntentExtraction = {
  originalText: string;
  intents: TripIntent[];
  /** Id of the highest-confidence intent (tie broken by source order). */
  primaryIntentId: string | null;
};
