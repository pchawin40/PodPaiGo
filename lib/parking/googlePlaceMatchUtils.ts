function cleanText(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeParkingLotName(name: string): string {
  return cleanText(name)
    .replace(/\bself covered\b/g, ' ')
    .replace(/\bself uncovered\b/g, ' ')
    .replace(/\bcovered\b/g, ' ')
    .replace(/\buncovered\b/g, ' ')
    .replace(/\bparking\b/g, ' ')
    .replace(/\blot\b/g, ' ')
    .replace(/\bgarage\b/g, ' ')
    .replace(/\bterminal\b/g, ' ')
    .replace(/\bairport\b/g, ' ')
    .replace(/\bsea tac\b/g, ' ')
    .replace(/\bseatac\b/g, ' ')
    .replace(/\bseattle\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasParkingSignal(text: string): boolean {
  return /\b(parking|garage|lot|valet|shuttle|park)\b/.test(text);
}

function hasAirportOnlySignal(text: string): boolean {
  return /\b(airport|terminal|central terminal|concourse|rideshare|transit)\b/.test(text);
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
  const parkingSignal = hasParkingSignal(name) || hasParkingSignal(provider) || hasParkingSignal(source);
  const airportOnlyName = hasAirportOnlySignal(name) && !parkingSignal;
  const airportOnlyAddress = hasAirportOnlySignal(address) && !parkingSignal;

  if (!normalizeParkingLotName(args.lotName)) return false;
  if (airportOnlyName) return false;
  if (airportOnlyAddress) return false;
  if (hasAirportOnlySignal(name) && parkingSignal) return true;

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
