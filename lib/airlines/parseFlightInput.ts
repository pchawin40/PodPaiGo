import { resolveAirlineInput, type ResolvedAirlineInput } from './airlineCatalog';

export type ParsedFlightInput = {
  rawInput: string;
  airlineName: string | null;
  airlineCode: string | null;
  flightNumber: string | null;
  normalizedLabel: string | null;
  matchedCatalogEntry: ResolvedAirlineInput['matchedCatalogEntry'];
};

export function parseFlightInput(inputRaw: string): ParsedFlightInput {
  const resolved = resolveAirlineInput(inputRaw);
  const airlineCode = resolved.carrierCode;
  const airlineName = resolved.airlineName;
  const flightNumber = resolved.flightNumber;

  let normalizedLabel: string | null = null;
  if (airlineName && airlineCode && flightNumber) {
    normalizedLabel = `${airlineName} · ${airlineCode} ${flightNumber}`;
  } else if (airlineName && airlineCode) {
    normalizedLabel = `${airlineName} · ${airlineCode}`;
  } else if (airlineName) {
    normalizedLabel = airlineName;
  } else if (resolved.rawInput) {
    normalizedLabel = resolved.rawInput;
  }

  return {
    rawInput: resolved.rawInput,
    airlineName,
    airlineCode,
    flightNumber,
    normalizedLabel,
    matchedCatalogEntry: resolved.matchedCatalogEntry,
  };
}

export function normalizeAirlineTextForTrip(inputRaw: string | null | undefined): string | null {
  if (!inputRaw?.trim()) return null;
  return parseFlightInput(inputRaw).normalizedLabel || inputRaw.trim();
}

/**
 * Compact airline/flight label for trip search params and form fields.
 * Flight numbers stay as "AS 123"; catalog names expand; unknown text is preserved.
 */
export function normalizeAirlineTextForAssistant(
  inputRaw: string | null | undefined,
): string | null {
  if (!inputRaw?.trim()) return null;

  const trimmed = inputRaw.trim();
  const parsed = parseFlightInput(trimmed);

  if (parsed.airlineCode && parsed.flightNumber) {
    return `${parsed.airlineCode} ${parsed.flightNumber}`;
  }

  if (parsed.matchedCatalogEntry && parsed.airlineName) {
    return parsed.airlineName;
  }

  return trimmed;
}
