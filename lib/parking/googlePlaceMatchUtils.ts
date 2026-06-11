function cleanText(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')
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
  return cleanParkingProviderInventoryName(name);
}

export function cleanParkingProviderInventoryName(name: string): string {
  let cleaned = String(name || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const suffixPatterns = [
    /\s+(?:parking\s+)?lot(?:\s+[A-Z]{3})?\s*-\s*self\s+(?:uncovered|covered|rooftop|park|parking).*$/i,
    /\s+[A-Z]{3}\s*-\s*(?:[Ss]elf|SELF)\s+(?:[Uu]ncovered|[Cc]overed|[Rr]ooftop|[Pp]ark|[Pp]arking).*$/,
    /\s*-\s*self\s+(?:uncovered|covered|rooftop|park|parking).*$/i,
    /\s*-\s*(?:uncovered|covered|rooftop|valet|daily|monthly|outdoor|indoor)(?:\s+(?:parking|lot|garage|space|spaces|rate|rates))?.*$/i,
    /\s+(?:parking\s+)?lot\s+[A-Z]{3}$/i,
    /\s+[A-Z]{3}\s+(?:[Pp]arking\s+)?[Ll]ot$/,
    /\s+(?:self\s+)?(?:uncovered|covered|rooftop|valet|outdoor|indoor)\s+(?:parking|lot|space|spaces)$/i,
    /\s+(?:parking\s+)?lot$/i,
  ];

  let previous = '';

  while (cleaned && cleaned !== previous) {
    previous = cleaned;

    for (const pattern of suffixPatterns) {
      cleaned = cleaned.replace(pattern, '').replace(/\s+/g, ' ').trim();
    }
  }

  return cleaned;
}

export function normalizeParkingLotName(name: string): string {
  return cleanText(cleanGoogleParkingSearchName(name));
}

export function deriveBusinessPhotoSearchName(name: string): string {
  let cleaned = cleanParkingProviderInventoryName(name)
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const suffixPatterns = [
    /\s+(?:airport\s+)?parking(?:\s+lot)?$/i,
    /\s+(?:parking\s+)?lot$/i,
    /\s+self\s*(?:-| )?park$/i,
    /\s+self\s+(?:uncovered|covered|parking)$/i,
  ];

  let previous = '';
  while (cleaned && cleaned !== previous) {
    previous = cleaned;
    for (const pattern of suffixPatterns) {
      cleaned = cleaned.replace(pattern, '').replace(/\s+/g, ' ').trim();
    }
  }

  return cleaned;
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

const MARKETPLACE_STABLE_ID_PROVIDERS = [
  'parkwhiz',
  'spothero',
  'waypark',
  'way',
  'airportparkingreservations',
  'apr',
];

const UUID_V4_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function isUnstableIdToken(token: string): boolean {
  // A bare UUID, or a long random hex/base blob, is request-specific and unstable.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return true;
  if (/^[0-9a-f]{16,}$/i.test(token)) return true;
  return false;
}

/**
 * Derive a stable lot identity token from a parking lot id, dropping
 * request-specific / UUID-like suffixes so the Google Places cache key is the
 * same for the same lot across requests.
 *
 * Examples:
 *  - "65141"                                            -> "65141" (numeric DB id)
 *  - "destination-parkwhiz-parkwhiz-65141-<optionId>"   -> "parkwhiz-65141"
 *  - "<uuid>"                                           -> "" (no stable identity)
 */
export function deriveStableParkingLotIdToken(
  parkingLotId: string | number | null | undefined,
): string {
  const raw = String(parkingLotId ?? '').trim();
  if (!raw) return '';

  // Clean numeric DB ids are already stable.
  if (/^\d+$/.test(raw)) return raw;

  const lower = raw.toLowerCase();

  // Marketplace synthetic ids embed a stable provider location id followed by a
  // request-specific option/quote id (e.g. destination-parkwhiz-parkwhiz-65141-<optionId>).
  // Keep "<provider>-<locationId>" and drop the request-specific suffix.
  const marketplaceMatch = lower.match(
    new RegExp(`(${MARKETPLACE_STABLE_ID_PROVIDERS.join('|')})-(\\d{2,})`),
  );
  if (marketplaceMatch) {
    return `${marketplaceMatch[1]}-${marketplaceMatch[2]}`;
  }

  // Strip embedded UUIDs / long random hex blobs that change per request.
  const stripped = lower
    .replace(UUID_V4_RE, '')
    .replace(/[-_:][0-9a-f]{16,}(?=$|[-_:])/g, '')
    .replace(/[-_:]{2,}/g, '-')
    .replace(/^[-_:]+|[-_:]+$/g, '');

  if (!stripped || isUnstableIdToken(stripped)) return '';

  // Only keep a lot-specific token when a stable numeric identifier remains, so
  // distinct lots are never collapsed onto a provider-only key.
  if (!/\d{2,}/.test(stripped)) return '';

  return stripped;
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
  // Prefer a stable provider/DB lot id; never include unstable UUID/request-specific
  // ids, which previously fragmented the cache key for the same lot every request.
  const stableLotId = deriveStableParkingLotIdToken(args.parkingLotId);
  const lotIdPart = stableLotId ? `id:${stableLotId}` : '';

  return [airportCode, namePart, addressPart, lotIdPart].filter(Boolean).join('|');
}
