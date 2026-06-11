import type { DestinationCategory } from '../parking/destinationParkingClassifier';
import type {
  DestinationKind,
  ParkingPreference,
  TransportAvailability,
} from '../types';

export type TripParseMode = 'airport_trip' | 'general_trip' | 'quick_go' | 'parking_only' | 'unknown';

export type TripParseStatus = 'needs_clarification' | 'ready_for_review';

export type ParsedTripTimeAnchor = 'arrive_by' | 'depart_at' | 'now' | 'unknown';

export type ParsedTripOriginSource =
  | 'current_location'
  | 'manual'
  | 'saved'
  | 'unknown';

/**
 * Structured driving preferences extracted from free text. These are user
 * inputs only — they never assert that a lane is legal for the user. HOV/toll
 * eligibility must always be confirmed against posted rules before it is
 * presented as fact, so copy that surfaces these stays cautious.
 */
export type DrivingPreferences = {
  carpoolPossible: boolean;
  numberOfPeople: number | null;
  /** True once the user explicitly said they don't know the passenger count. */
  occupancyConfirmedUnknown?: boolean;
  hovLaneEligible: 'yes' | 'no' | 'unknown';
  expressPassAvailable: boolean;
  tollLaneAllowed: boolean | null;
  avoidTolls: boolean;
  willingToPayTollForTime: boolean | null;
};

/**
 * Event/stadium context for a trip. When isEvent is true the destination should
 * be treated under PodPaiGo event-parking rules (no street/meter hero, prefer
 * official/prepaid parking, transit, rideshare).
 */
export type EventContext = {
  isEvent: boolean;
  /** Human label such as "Seahawks/Raiders game". */
  eventLabel: string | null;
  /** Inferred venue name such as "Allegiant Stadium". */
  venueName: string | null;
  /** Whether a concrete game/event time is known. */
  eventTimeKnown: boolean;
  /**
   * True once the user acknowledged they don't know the game time and accepted
   * a cautious "arrive early" default. We never invent a real game time.
   */
  eventTimeAcknowledged?: boolean;
};

export type ParsedTripAssistantResult = {
  mode: TripParseMode;
  status?: TripParseStatus;
  destinationText: string | null;
  originSource: ParsedTripOriginSource;
  destinationCategory: DestinationCategory | null;
  destinationKind?: DestinationKind | null;
  originText: string | null;
  airportCode: string | null;
  destinationCity: string | null;
  airlineText: string | null;
  departureDate: string | null;
  departureTime: string | null;
  timeAnchor?: ParsedTripTimeAnchor;
  returnDate: string | null;
  returnTime: string | null;
  parkingCheckInDate?: string | null;
  parkingCheckInTime?: string | null;
  parkingCheckOutDate?: string | null;
  parkingCheckOutTime?: string | null;
  parkingDurationMinutes?: number | null;
  transportAvailability?: TransportAvailability | null;
  parkingPreference?: ParkingPreference | null;
  /** City the trip takes place in, e.g. "Las Vegas" for a lodging-based trip. */
  tripCity?: string | null;
  /** Structured carpool/HOV/Express Pass/toll preferences when present. */
  drivingPreferences?: DrivingPreferences | null;
  /** Event/stadium context when the destination is an event venue. */
  eventContext?: EventContext | null;
  tripType: string | null;
  needsParking: boolean;
  needsLeaveTime: boolean;
  confidence: 'high' | 'medium' | 'low';
  missingFields: string[];
  clarificationQuestions?: string[];
  parser: 'mock' | 'openai' | 'disabled';
};

export type ParseTripTextInput = {
  userText: string;
};

export const PARSED_TRIP_FIELD_KEYS = [
  'originText',
  'destinationText',
  'airportCode',
  'departureDate',
  'returnDate',
] as const;

export type ParsedTripFieldKey = (typeof PARSED_TRIP_FIELD_KEYS)[number];
