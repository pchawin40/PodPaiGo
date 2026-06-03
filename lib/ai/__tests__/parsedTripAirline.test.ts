import { parsedTripToFormPrefill } from '../parsedTripToFormPrefill';
import { parsedTripToSearchParams } from '../parsedTripToSearchParams';
import type { ParsedTripAssistantResult } from '../tripParseTypes';

function buildParsed(airlineText: string | null): ParsedTripAssistantResult {
  return {
    mode: 'airport_trip',
    destinationText: null,
    originSource: 'manual',
    destinationCategory: null,
    originText: 'Monroe',
    airportCode: 'SEA',
    destinationCity: 'Las Vegas',
    airlineText,
    departureDate: '2026-11-15',
    departureTime: '12:00',
    returnDate: '2026-11-17',
    returnTime: '12:00',
    tripType: 'one-way-departure',
    needsParking: true,
    needsLeaveTime: true,
    missingFields: [],
    confidence: 'high',
    parser: 'mock',
  };
}

describe('AI assistant airline normalization', () => {
  test('maps Alaska to Alaska Airlines in search params', () => {
    const params = parsedTripToSearchParams(buildParsed('Alaska'), { confirmed: true });

    expect(params?.get('airlineOrFlight')).toBe('Alaska Airlines');
  });

  test('keeps AS 123 as AS 123 in search params', () => {
    const params = parsedTripToSearchParams(buildParsed('AS 123'), { confirmed: true });

    expect(params?.get('airlineOrFlight')).toBe('AS 123');
  });

  test('maps DL1234 to DL 1234 in search params', () => {
    const params = parsedTripToSearchParams(buildParsed('DL1234'), { confirmed: true });

    expect(params?.get('airlineOrFlight')).toBe('DL 1234');
  });

  test('preserves unknown airline text', () => {
    const params = parsedTripToSearchParams(buildParsed('Cool Airline'), { confirmed: true });

    expect(params?.get('airlineOrFlight')).toBe('Cool Airline');
  });

  test('maps Alaska to Alaska Airlines in form prefill', () => {
    const prefill = parsedTripToFormPrefill(buildParsed('Alaska'));

    expect(prefill.airlineOrFlight).toBe('Alaska Airlines');
  });

  test('keeps AS 123 in form prefill', () => {
    const prefill = parsedTripToFormPrefill(buildParsed('AS 123'));

    expect(prefill.airlineOrFlight).toBe('AS 123');
  });
});
