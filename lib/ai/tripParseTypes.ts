export type ParsedTripAssistantResult = {
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
  'airportCode',
  'departureDate',
  'returnDate',
] as const;

export type ParsedTripFieldKey = (typeof PARSED_TRIP_FIELD_KEYS)[number];
