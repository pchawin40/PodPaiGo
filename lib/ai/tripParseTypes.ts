import type { DestinationCategory } from '../parking/destinationParkingClassifier';

export type TripParseMode = 'airport_trip' | 'quick_go' | 'unknown';

export type ParsedTripOriginSource =
  | 'current_location'
  | 'manual'
  | 'saved'
  | 'unknown';

export type ParsedTripAssistantResult = {
  mode: TripParseMode;
  destinationText: string | null;
  originSource: ParsedTripOriginSource;
  destinationCategory: DestinationCategory | null;
  originText: string | null;
  airportCode: string | null;
  destinationCity: string | null;
  airlineText: string | null;
  departureDate: string | null;
  departureTime: string | null;
  returnDate: string | null;
  returnTime: string | null;
  tripType: string | null;
  needsParking: boolean;
  needsLeaveTime: boolean;
  confidence: 'high' | 'medium' | 'low';
  missingFields: string[];
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
