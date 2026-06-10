/**
 * Travel-context awareness: when a user says they are "staying at the Bellagio"
 * or "when I'm in Vegas", that local lodging — not their home or current
 * location — should be the origin for the destination-city trip.
 */

const CITY_ALIASES: Record<string, string> = {
  vegas: 'Las Vegas',
  'las vegas': 'Las Vegas',
  seattle: 'Seattle',
  bellevue: 'Bellevue',
  everett: 'Everett',
  monroe: 'Monroe',
  tacoma: 'Tacoma',
  portland: 'Portland',
  chicago: 'Chicago',
  'los angeles': 'Los Angeles',
  'san francisco': 'San Francisco',
  denver: 'Denver',
  phoenix: 'Phoenix',
  'new york': 'New York',
};

const KNOWN_HOTELS: Array<{ match: RegExp; name: string; city?: string }> = [
  { match: /\bbellagio\b/i, name: 'Bellagio Hotel & Casino', city: 'Las Vegas' },
  { match: /\bcaesars palace\b/i, name: 'Caesars Palace', city: 'Las Vegas' },
  { match: /\bmgm grand\b/i, name: 'MGM Grand', city: 'Las Vegas' },
  { match: /\bwynn\b/i, name: 'Wynn Las Vegas', city: 'Las Vegas' },
  { match: /\bvenetian\b/i, name: 'The Venetian', city: 'Las Vegas' },
  { match: /\baria\b/i, name: 'ARIA Resort & Casino', city: 'Las Vegas' },
  { match: /\bluxor\b/i, name: 'Luxor Hotel & Casino', city: 'Las Vegas' },
  { match: /\bmandalay bay\b/i, name: 'Mandalay Bay', city: 'Las Vegas' },
  { match: /\bcosmopolitan\b/i, name: 'The Cosmopolitan of Las Vegas', city: 'Las Vegas' },
];

const STOP_WORDS =
  /\b(in|near|around|by|and|when|while|for|to|on|then|but|so|because|since|hotel|casino|resort)\b/i;

// Team words that follow a city name (e.g. "seattle seahawks") — that city is a
// team's home city, not the trip city, so it should not win.
const TEAM_WORD_AFTER_CITY =
  /^\s+(seahawks|raiders|mariners|kraken|bears|giants|jets|rams|chargers|49ers|niners|cowboys|broncos|cardinals|knights)\b/i;

function escapeAlias(alias: string): string {
  return alias.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Detect the trip's city. Prefers a city in lodging/destination context
 * ("in Vegas", "to Vegas") and skips a city immediately followed by a team name
 * ("seattle seahawks") so the destination city wins over a team's home city.
 */
export function detectTripCity(text: string): string | null {
  const lower = text.toLowerCase();
  const candidates: Array<{ label: string; index: number; lodging: boolean }> = [];

  for (const [alias, label] of Object.entries(CITY_ALIASES)) {
    const pattern = new RegExp(`\\b${escapeAlias(alias)}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lower)) !== null) {
      const after = lower.slice(match.index + alias.length);
      if (TEAM_WORD_AFTER_CITY.test(after)) continue;
      const before = lower.slice(0, match.index);
      const lodging = /\b(in|at|near|staying|to)\s*$/i.test(before);
      candidates.push({ label, index: match.index, lodging });
    }
  }

  if (candidates.length === 0) return null;

  const lodgingMatch = candidates.find((candidate) => candidate.lodging);
  if (lodgingMatch) return lodgingMatch.label;

  candidates.sort((a, b) => a.index - b.index);
  return candidates[candidates.length - 1].label;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cleanLodgingPhrase(raw: string): string {
  return raw
    .replace(/[,.;]+$/g, '')
    .replace(/\b(the)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type LodgingContext = {
  /** Canonical lodging origin text, ready to use as an origin. */
  lodgingText: string;
  city: string | null;
};

/**
 * Extract a lodging-based origin from text. Returns null when the user did not
 * mention staying somewhere. The returned lodgingText is suitable to use as the
 * trip origin (origin source: manual).
 */
export function extractLodgingContext(text: string): LodgingContext | null {
  const city = detectTripCity(text);

  // Known hotels first — gives a clean, geocodable canonical name.
  for (const hotel of KNOWN_HOTELS) {
    if (hotel.match.test(text)) {
      const resolvedCity = city || hotel.city || null;
      return {
        lodgingText: resolvedCity ? `${hotel.name}, ${resolvedCity}` : hotel.name,
        city: resolvedCity,
      };
    }
  }

  const phrasePatterns: RegExp[] = [
    /\bstaying\s+(?:at|in|near)\s+(?:the\s+)?([a-z0-9'&. -]+?)(?=\s+(?:in|near|and|when|while|for)\b|[,.;]|$)/i,
    /\bstay(?:ing)?\s+(?:at|in)\s+(?:the\s+)?([a-z0-9'&. -]+?\b(?:hotel|casino|resort|inn|suites|lodge|motel))\b/i,
    /\bmy hotel(?:\s+is)?\s+(?:the\s+)?([a-z0-9'&. -]+?)(?=[,.;]|$)/i,
    /\b(?:lodging|booked)\s+(?:at|in)\s+(?:the\s+)?([a-z0-9'&. -]+?)(?=\s+(?:in|near)\b|[,.;]|$)/i,
  ];

  for (const pattern of phrasePatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let phrase = cleanLodgingPhrase(match[1]);
    // Drop a leading stop word fragment if the capture started oddly.
    if (!phrase || STOP_WORDS.test(phrase) === false) {
      phrase = phrase.replace(/^(at|in|near)\s+/i, '').trim();
    }
    if (phrase.length < 2) continue;

    const lodgingText = titleCase(phrase);
    return {
      lodgingText: city ? `${lodgingText}, ${city}` : lodgingText,
      city,
    };
  }

  return null;
}
