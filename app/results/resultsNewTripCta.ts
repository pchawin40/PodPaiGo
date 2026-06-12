type ResultsParamsLike = Pick<URLSearchParams, 'get'>;

const LEGACY_AIRPORT_TYPES = new Set([
  'one-way-departure',
  'one-way-arrival',
  'round-trip',
  'dropoff-pickup',
]);

function normalizeParams(params: ResultsParamsLike | string | null | undefined): ResultsParamsLike | null {
  if (!params) return null;
  if (typeof params === 'string') return new URLSearchParams(params);
  return params;
}

export function shouldShowResultsNewTripCta(
  params: ResultsParamsLike | string | null | undefined,
): boolean {
  const normalized = normalizeParams(params);
  if (!normalized) return false;

  const type = (normalized.get('type') || '').toLowerCase();
  const destinationKind = (normalized.get('destinationKind') || '').toLowerCase();
  const airportCode =
    normalized.get('airportCode') ||
    normalized.get('detectedAirportCode') ||
    normalized.get('airport');

  return (
    Boolean(airportCode) ||
    destinationKind === 'airport' ||
    type.includes('airport') ||
    LEGACY_AIRPORT_TYPES.has(type)
  );
}
