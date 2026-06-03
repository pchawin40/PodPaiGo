import type { ParsedTripAssistantResult, TripParseMode } from './tripParseTypes';
import type { DestinationCategory } from '../parking/destinationParkingClassifier';

const CONFIDENCE_VALUES = new Set<ParsedTripAssistantResult['confidence']>(['high', 'medium', 'low']);

const MODE_VALUES = new Set<TripParseMode>(['airport_trip', 'quick_go', 'unknown']);

const ORIGIN_SOURCE_VALUES = new Set<ParsedTripAssistantResult['originSource']>([
  'current_location',
  'manual',
  'saved',
  'unknown',
]);

const DESTINATION_CATEGORY_VALUES = new Set<DestinationCategory>([
  'airport',
  'grocery_or_retail',
  'office_or_workplace',
  'hiking_or_park',
  'restaurant',
  'hotel',
  'general',
]);

function resolveMode(parsed: Partial<ParsedTripAssistantResult>): TripParseMode {
  if (parsed.mode && MODE_VALUES.has(parsed.mode)) {
    return parsed.mode;
  }
  return 'airport_trip';
}

export function normalizeParsedTripAssistantResult(
  raw: unknown,
  parser: ParsedTripAssistantResult['parser'],
): ParsedTripAssistantResult | null {
  if (!raw || typeof raw !== 'object') return null;

  const parsed = raw as Partial<ParsedTripAssistantResult>;
  const confidence = CONFIDENCE_VALUES.has(parsed.confidence as ParsedTripAssistantResult['confidence'])
    ? (parsed.confidence as ParsedTripAssistantResult['confidence'])
    : 'medium';

  const mode = resolveMode(parsed);
  const originSource = ORIGIN_SOURCE_VALUES.has(
    parsed.originSource as ParsedTripAssistantResult['originSource'],
  )
    ? (parsed.originSource as ParsedTripAssistantResult['originSource'])
    : 'unknown';

  const destinationCategory =
    parsed.destinationCategory &&
    DESTINATION_CATEGORY_VALUES.has(parsed.destinationCategory as DestinationCategory)
      ? (parsed.destinationCategory as DestinationCategory)
      : null;

  const normalized: ParsedTripAssistantResult = {
    mode,
    destinationText:
      typeof parsed.destinationText === 'string' ? parsed.destinationText.trim() || null : null,
    originSource,
    destinationCategory,
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

  return computeMissingParsedFields(normalized);
}

export function computeMissingParsedFields(
  parsed: ParsedTripAssistantResult,
): ParsedTripAssistantResult {
  const missingFields = new Set(parsed.missingFields);

  if (parsed.mode === 'quick_go') {
    if (!parsed.destinationText?.trim()) missingFields.add('destinationText');
    missingFields.delete('airportCode');
    missingFields.delete('departureDate');
    missingFields.delete('originText');
  } else {
    if (!parsed.originText) missingFields.add('originText');
    if (!parsed.airportCode) missingFields.add('airportCode');
    if (!parsed.departureDate) missingFields.add('departureDate');
    missingFields.delete('destinationText');
  }

  return {
    ...parsed,
    missingFields: Array.from(missingFields),
  };
}
