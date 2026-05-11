function cleanText(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PARKING_MARKETPLACE_PROVIDERS = new Set([
  'parkwhiz',
  'spothero',
  'way',
  'way com',
  'airportparkingreservations',
  'airport parking reservations',
  'apr',
]);

export function cleanGoogleParkingSearchName(name: string): string {
  return String(name || '')
    .replace(/\s+-\s*self\s+uncovered.*$/i, '')
    .replace(/\s+-\s*self\s+covered.*$/i, '')
    .replace(/\s+-\s*uncovered.*$/i, '')
    .replace(/\s+-\s*covered.*$/i, '')
    .replace(/\s+-\s*valet.*$/i, '')
    .replace(/\s+-\s*rooftop.*$/i, '')
    .replace(/\s+-\s*daily.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeParkingLotName(name: string): string {
  return cleanText(cleanGoogleParkingSearchName(name));
}

function hasParkingSignal(text: string): boolean {
  return /\b(parking|garage|lot|valet|shuttle|park|self covered|self uncovered|covered|uncovered)\b/.test(text);
}

function hasAirportOnlySignal(text: string): boolean {
  return /\b(terminal|central terminal|concourse|rideshare|transit)\b/.test(text);
}

function normalizeAddress(value?: string | null): string {
  return cleanText(value);
}

export function shouldAttemptGooglePlaceMatch(args: {
  lotName: string;
  lotAddress?: string | null;
  provider?: string | null;
  source?: string | null;
  airportCode?: string | null;
}): boolean {
  const name = cleanText(args.lotName);
  const address = cleanText(args.lotAddress);
  const provider = cleanText(args.provider);
  const source = cleanText(args.source);

  const providerIsParkingMarketplace =
    PARKING_MARKETPLACE_PROVIDERS.has(provider) ||
    PARKING_MARKETPLACE_PROVIDERS.has(source);

  const parkingSignal =
    hasParkingSignal(name) ||
    hasParkingSignal(provider) ||
    hasParkingSignal(source);

  const hasUsableName = Boolean(normalizeParkingLotName(args.lotName));

  if (!hasUsableName) return false;

  // ParkWhiz/SpotHero/Way entries are parking products even if the business is a hotel.
  if (providerIsParkingMarketplace) return true;

  // Airport-only destinations like Central Terminal should still be skipped.
  const airportOnlyName = hasAirportOnlySignal(name) && !parkingSignal;
  const airportOnlyAddress = hasAirportOnlySignal(address) && !parkingSignal;

  if (airportOnlyName || airportOnlyAddress) return false;

  return parkingSignal;
}

export function buildParkingGoogleCacheKey(args: {
  airportCode?: string | null;
  parkingLotId?: string | number | null;
  lotName: string;
  lotAddress?: string | null;
}): string {
  const airportCode = String(args.airportCode || 'UNKNOWN').toUpperCase();
  const namePart = `name:${normalizeParkingLotName(args.lotName) || cleanText(args.lotName)}`;
  const addressPart = args.lotAddress ? `addr:${normalizeAddress(args.lotAddress)}` : '';
  const lotIdPart = args.parkingLotId ? `id:${String(args.parkingLotId)}` : '';

  return [airportCode, namePart, addressPart, lotIdPart].filter(Boolean).join('|');
}