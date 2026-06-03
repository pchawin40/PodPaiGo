import type { TripParseMode } from './tripParseTypes';

const AIRPORT_WORD_PATTERN =
  /\b(airport|flight|flying|terminal|airline|departure|arrival|tsa|check-?in|baggage|boarding)\b/i;

const AIRPORT_PARKING_PATTERN = /\bparking\s+at\s+(?:the\s+)?[a-z]{3}\b/i;

const FLIGHT_NUMBER_PATTERN = /\b[A-Z]{2}\s*\d{1,4}\b/;

const QUICK_GO_PHRASE_PATTERN =
  /\b(heading to|going to|take me to|commute to|drive to|directions to|get me to|navigate to)\b/i;

const QUICK_GO_DESTINATION_HINT_PATTERN =
  /\b(fred meyer|safeway|costco|walmart|target|pike place|trailhead|restaurant|hotel|grocery|coffee shop|office)\b/i;

const KNOWN_AIRPORT_CODES = new Set([
  'SEA',
  'LAX',
  'LAS',
  'SFO',
  'ORD',
  'JFK',
  'DFW',
  'ATL',
  'DEN',
  'PHX',
  'MCO',
  'PAE',
  'BLI',
]);

const AIRPORT_ALIASES = [
  'sea',
  'seatac',
  'sea-tac',
  'lax',
  'las',
  'sfo',
  'ord',
  'jfk',
  'dfw',
  'atl',
  'den',
  'phx',
  'mco',
  'pae',
  'bli',
];

function containsKnownAirportCode(text: string): boolean {
  const upper = text.toUpperCase();
  for (const match of upper.matchAll(/\b([A-Z]{3})\b/g)) {
    if (KNOWN_AIRPORT_CODES.has(match[1])) return true;
  }
  return false;
}

function containsAirportAlias(text: string): boolean {
  const lower = text.toLowerCase();
  return AIRPORT_ALIASES.some((alias) => {
    const pattern = new RegExp(`\\b${alias.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    return pattern.test(lower);
  });
}

function hasAirportTravelContext(text: string): boolean {
  if (AIRPORT_WORD_PATTERN.test(text)) return true;
  if (AIRPORT_PARKING_PATTERN.test(text)) return true;
  if (FLIGHT_NUMBER_PATTERN.test(text)) return true;
  if (/\b(?:alaska|delta|southwest|united|american|jetblue)\b/i.test(text)) return true;
  if (/\b(?:weekend|round)\s+trip\b/i.test(text) && containsAirportAlias(text)) return true;
  if (/\bto\s+seatac\b/i.test(text) || /\bto\s+sea-?tac\b/i.test(text)) return true;
  if (/\bflying\s+from\b/i.test(text)) return true;
  if (/\bfrom\s+[a-z]{3}\s+to\b/i.test(text) && containsKnownAirportCode(text)) return true;

  const hasCode = containsKnownAirportCode(text) || containsAirportAlias(text);
  if (!hasCode) return false;

  if (/\bto\s+(vegas|las vegas|los angeles)\b/i.test(text)) return true;
  if (/\bparking\b/i.test(text) && hasCode) return true;
  if (/\bnov\b/i.test(text) || /\bdec\b/i.test(text) || /\bweekend\b/i.test(text)) {
    return true;
  }

  return /\b(?:trip|flight|fly|flying)\b/i.test(text);
}

function hasQuickGoContext(text: string): boolean {
  if (QUICK_GO_PHRASE_PATTERN.test(text)) return true;
  if (/\bcommute\b/i.test(text) && !hasAirportTravelContext(text)) return true;
  if (QUICK_GO_DESTINATION_HINT_PATTERN.test(text) && !hasAirportTravelContext(text)) {
    return true;
  }
  if (/\bpse\b/i.test(text) && /\boffice\b/i.test(text)) return true;
  if (/\blake serene\b/i.test(text)) return true;
  return false;
}

export function detectTripIntent(userText: string): TripParseMode {
  const text = userText.trim();
  if (!text) return 'unknown';

  const airport = hasAirportTravelContext(text);
  const quickGo = hasQuickGoContext(text);

  if (airport && quickGo) {
    if (/\b(?:flying|flight|parking at|terminal|airline)\b/i.test(text)) {
      return 'airport_trip';
    }
    if (QUICK_GO_PHRASE_PATTERN.test(text) && !/\bflying\b/i.test(text)) {
      return 'quick_go';
    }
    return 'airport_trip';
  }

  if (quickGo) return 'quick_go';
  if (airport) return 'airport_trip';
  return 'unknown';
}
