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
