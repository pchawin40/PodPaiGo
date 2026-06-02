import type { ParsedTripAssistantResult } from './tripParseTypes';

const CONFIDENCE_VALUES = new Set<ParsedTripAssistantResult['confidence']>(['high', 'medium', 'low']);

export function normalizeParsedTripAssistantResult(
  raw: unknown,
  parser: ParsedTripAssistantResult['parser'],
): ParsedTripAssistantResult | null {
  if (!raw || typeof raw !== 'object') return null;

  const parsed = raw as Partial<ParsedTripAssistantResult>;
  const confidence = CONFIDENCE_VALUES.has(parsed.confidence as ParsedTripAssistantResult['confidence'])
    ? (parsed.confidence as ParsedTripAssistantResult['confidence'])
    : 'medium';

  return {
    originText: typeof parsed.originText === 'string' ? parsed.originText.trim() || null : null,
    airportCode:
      typeof parsed.airportCode === 'string'
        ? parsed.airportCode.trim().toUpperCase() || null
        : null,
    destinationCity:
      typeof parsed.destinationCity === 'string' ? parsed.destinationCity.trim() || null : null,
    airlineText: typeof parsed.airlineText === 'string' ? parsed.airlineText.trim() || null : null,
    departureDate:
      typeof parsed.departureDate === 'string' ? parsed.departureDate.trim() || null : null,
    departureTime:
      typeof parsed.departureTime === 'string' ? parsed.departureTime.trim() || null : null,
    returnDate: typeof parsed.returnDate === 'string' ? parsed.returnDate.trim() || null : null,
    returnTime: typeof parsed.returnTime === 'string' ? parsed.returnTime.trim() || null : null,
    tripType: typeof parsed.tripType === 'string' ? parsed.tripType.trim() || null : null,
    needsParking: parsed.needsParking === true,
    needsLeaveTime: parsed.needsLeaveTime !== false,
    confidence,
    missingFields: Array.isArray(parsed.missingFields)
      ? parsed.missingFields.map(String).filter(Boolean)
      : [],
    parser,
  };
}

export function computeMissingParsedFields(
  parsed: ParsedTripAssistantResult,
): ParsedTripAssistantResult {
  const missingFields = [...parsed.missingFields];

  if (!parsed.originText) missingFields.push('originText');
  if (!parsed.airportCode) missingFields.push('airportCode');
  if (!parsed.departureDate) missingFields.push('departureDate');

  return {
    ...parsed,
    missingFields: Array.from(new Set(missingFields)),
  };
}
