import { normalizeAirlineTextForAssistant } from '../airlines/parseFlightInput';
import type { ParsedTripAssistantResult } from './tripParseTypes';

export type TripFormPrefill = {
  intent: 'flying-out';
  origin: string;
  airportCode: string;
  airlineOrFlight: string;
  date: string;
  time: string;
  parkingCheckOutDate: string;
  parkingCheckOutTime: string;
};

export function parsedTripToFormPrefill(
  parsed: ParsedTripAssistantResult,
): TripFormPrefill {
  return {
    intent: 'flying-out',
    origin: parsed.originText?.trim() || '',
    airportCode: parsed.airportCode?.trim().toUpperCase() || 'SEA',
    airlineOrFlight:
      normalizeAirlineTextForAssistant(parsed.airlineText) ||
      parsed.airlineText?.trim() ||
      '',
    date: parsed.departureDate || '',
    time: parsed.departureTime || '',
    parkingCheckOutDate: parsed.returnDate || '',
    parkingCheckOutTime: parsed.returnTime || parsed.departureTime || '',
  };
}

export function canApplyParsedTripToForm(parsed: ParsedTripAssistantResult): boolean {
  return Boolean(parsed.originText?.trim() && parsed.airportCode?.trim() && parsed.departureDate);
}
