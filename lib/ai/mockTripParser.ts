import { detectTripIntent } from './detectTripIntent';
import { inferDestinationCategory } from '../parking/destinationParkingClassifier';
import { computeMissingParsedFields } from './normalizeParsedTrip';
import type { ParsedTripAssistantResult, ParsedTripOriginSource, TripParseMode } from './tripParseTypes';
import type { DestinationKind, ParkingPreference, TransportAvailability } from '../types';

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const AIRPORT_ALIASES: Record<string, string> = {
  sea: 'SEA',
  seatac: 'SEA',
  'sea-tac': 'SEA',
  seattle: 'SEA',
  lax: 'LAX',
  las: 'LAS',
  sfo: 'SFO',
  ord: 'ORD',
  jfk: 'JFK',
  dfw: 'DFW',
  atl: 'ATL',
  den: 'DEN',
  phx: 'PHX',
  mco: 'MCO',
  pae: 'PAE',
  bli: 'BLI',
};

const CITY_ALIASES: Record<string, string> = {
  vegas: 'Las Vegas',
  'las vegas': 'Las Vegas',
  seattle: 'Seattle',
  seatac: 'SeaTac',
  'los angeles': 'Los Angeles',
  monroe: 'Monroe',
  bellevue: 'Bellevue',
  everett: 'Everett',
};

const KNOWN_AIRPORT_CODES = new Set(Object.values(AIRPORT_ALIASES));

const QUICK_GO_KNOWN_DESTINATIONS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfred meyer(?:\s+in\s+|\s+)(monroe)\b/i, label: 'Fred Meyer Monroe' },
  { pattern: /\bsafeway(?:\s+in\s+|\s+)(monroe)\b/i, label: 'Safeway Monroe' },
  { pattern: /\bcostco(?:\s+in\s+|\s+)(everett)\b/i, label: 'Costco Everett' },
  { pattern: /\bpse\b[^.;\n]*\bbellevue\b[^.;\n]*\boffice\b/i, label: 'PSE Bellevue office' },
  { pattern: /\blake serene\b[^.;\n]*\btrailhead\b/i, label: 'Lake Serene trailhead' },
];

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function formatDateFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextWeekdayDate(weekday: number, now = new Date(), after?: Date | null): string {
  const base = after ? addDays(after, 1) : now;
  let diff = (weekday - base.getDay() + 7) % 7;
  if (!after && diff === 0) diff = 7;
  return formatDateFromDate(addDays(base, diff));
}

function formatQuickGoNow(now: Date): { departureDate: string; departureTime: string } {
  return {
    departureDate: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
    departureTime: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
  };
}

function defaultYearForMonth(month: number, now = new Date()): number {
  const year = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return month < currentMonth ? year + 1 : year;
}

function parseMonthDay(
  monthToken: string,
  dayToken: string,
  yearToken?: string,
  now = new Date(),
): string | null {
  const month = MONTHS[monthToken.toLowerCase()];
  const day = Number(dayToken);
  if (!month || !Number.isFinite(day)) return null;

  const year = yearToken ? Number(yearToken) : defaultYearForMonth(month, now);
  if (!Number.isFinite(year)) return null;

  return formatDate(year, month, day);
}

function extractDates(text: string, now = new Date()): {
  departureDate: string | null;
  returnDate: string | null;
} {
  let departureDate: string | null = null;
  let returnDate: string | null = null;

  if (/\btomorrow\b/i.test(text)) {
    departureDate = formatDateFromDate(addDays(now, 1));
  } else if (/\btoday\b/i.test(text)) {
    departureDate = formatDateFromDate(now);
  }

  const weekdayMatches = [...text.matchAll(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
  )];

  if (!departureDate && weekdayMatches[0]) {
    const weekday = WEEKDAYS[weekdayMatches[0][1].toLowerCase()];
    departureDate = nextWeekdayDate(weekday, now);
  }

  if (weekdayMatches[1]) {
    const weekday = WEEKDAYS[weekdayMatches[1][1].toLowerCase()];
    const departureBase = departureDate ? new Date(`${departureDate}T12:00:00`) : null;
    returnDate = nextWeekdayDate(weekday, now, departureBase);
  }

  const rangeMatch = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|-)\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/i,
  );

  if (rangeMatch) {
    departureDate = parseMonthDay(rangeMatch[1], rangeMatch[2], rangeMatch[5], now);
    returnDate = parseMonthDay(rangeMatch[3], rangeMatch[4], rangeMatch[5], now);
    return { departureDate, returnDate };
  }

  const singleMatches = [...text.matchAll(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/gi,
  )];

  if (!departureDate && singleMatches[0]) {
    departureDate = parseMonthDay(
      singleMatches[0][1],
      singleMatches[0][2],
      singleMatches[0][3],
      now,
    );
  }

  if (!returnDate && singleMatches[1]) {
    returnDate = parseMonthDay(
      singleMatches[1][1],
      singleMatches[1][2],
      singleMatches[1][3],
      now,
    );
  }

  if (!returnDate && /\bweekend\b/i.test(text) && departureDate) {
    const start = new Date(`${departureDate}T12:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    returnDate = formatDate(end.getFullYear(), end.getMonth() + 1, end.getDate());
  }

  return { departureDate, returnDate };
}

function parseTimeToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const match = token.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 11) {
    hour = hour;
  }
  if (hour < 0 || hour > 23) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function extractParkingWindow(text: string, now = new Date()): {
  parkingCheckInDate: string | null;
  parkingCheckInTime: string | null;
  parkingCheckOutDate: string | null;
  parkingCheckOutTime: string | null;
} {
  const pattern =
    /\bfrom\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?\s+(?:to|until|-)\s+(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i;
  const match = text.match(pattern);

  if (!match) {
    return {
      parkingCheckInDate: null,
      parkingCheckInTime: null,
      parkingCheckOutDate: null,
      parkingCheckOutTime: null,
    };
  }

  const parkingCheckInDate = parseMonthDay(match[1], match[2], undefined, now);
  const outMonth = match[4] || match[1];
  const parkingCheckOutDate = parseMonthDay(outMonth, match[5], undefined, now);

  return {
    parkingCheckInDate,
    parkingCheckInTime: parseTimeToken(match[3]) || null,
    parkingCheckOutDate,
    parkingCheckOutTime: parseTimeToken(match[6]) || null,
  };
}

function extractAirportCode(text: string): string | null {
  const upper = text.toUpperCase();

  for (const match of upper.matchAll(/\b([A-Z]{3})\b/g)) {
    const code = match[1];
    if (KNOWN_AIRPORT_CODES.has(code)) {
      return code;
    }
  }

  const lower = text.toLowerCase();
  for (const [alias, code] of Object.entries(AIRPORT_ALIASES)) {
    const pattern = new RegExp(`\\b${alias.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lower)) {
      return code;
    }
  }

  return null;
}

function extractDestinationCity(text: string, airportCode: string | null): string | null {
  const lower = text.toLowerCase();

  const toCityMatch = lower.match(/\bto\s+([a-z][a-z\s-]{1,40})/i);
  if (toCityMatch) {
    const candidate = toCityMatch[1]
      .replace(/\b(from|leaving|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|weekend|trip|parking)\b.*$/i, '')
      .trim();

    if (candidate) {
      for (const [alias, label] of Object.entries(CITY_ALIASES)) {
        if (candidate.includes(alias)) return label;
      }

      if (!/^[a-z]{3}$/i.test(candidate)) {
        return candidate
          .split(/\s+/)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
      }
    }
  }

  for (const [alias, label] of Object.entries(CITY_ALIASES)) {
    if (lower.includes(alias) && label !== airportCode) {
      if (alias === 'vegas' || alias === 'las vegas') return label;
      if (alias === 'los angeles' && airportCode !== 'LAX') return label;
    }
  }

  return null;
}

function extractQuickGoDestination(text: string): string | null {
  for (const { pattern, label } of QUICK_GO_KNOWN_DESTINATIONS) {
    if (pattern.test(text)) return label;
  }

  const phrasePatterns = [
    /\b(?:heading|going|commute|drive|directions|take me|get me|navigate|uber|lyft|rideshare|taxi)\s+to\s+([^,.;\n]+?)(?:\s*[,.\n]|$|\s+please\b)/i,
    /\bcompare\b[^,.;\n]*?\bto\s+([^,.;\n]+?)(?:\s*[,.\n]|$|\s+please\b)/i,
    /\bcommute\s+for\s+me\s+to\s+([^,.;\n]+)/i,
  ];

  for (const pattern of phrasePatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let destination = match[1]
      .replace(/\b(?:in|at)\s+the\s+/gi, 'in ')
      .replace(/\bplease\b.*$/i, '')
      .replace(/\b(?:today|tomorrow|tonight|this\s+\w+|next\s+\w+)\b.*$/i, '')
      .replace(/\b(?:arrive|arrival|depart|leave|leaving|at|by|around|compare|plan)\b.*$/i, '')
      .replace(/\bfrom\s+[^,.;\n]+$/i, '')
      .trim();

    destination = destination.replace(/\s+/g, ' ');
    if (destination.length >= 3) {
      return destination
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }
  }

  return null;
}

function destinationKindFromCategory(
  destinationText: string | null,
): { category: ParsedTripAssistantResult['destinationCategory']; kind: DestinationKind } {
  const category = destinationText
    ? inferDestinationCategory({ destination: destinationText })
    : null;
  const lower = String(destinationText || '').toLowerCase();

  if (/\b(pike place|downtown|waterfront|market district)\b/.test(lower)) {
    return { category, kind: 'downtown' };
  }

  if (category === 'restaurant') return { category, kind: 'restaurant' };
  if (category === 'hotel') return { category, kind: 'hotel' };
  if (category === 'office_or_workplace') return { category, kind: 'office' };
  return { category, kind: 'general' };
}

function extractOrigin(text: string, mode: TripParseMode): string | null {
  const patterns =
    mode === 'quick_go'
      ? [
          /\bfrom\s+([^,.;\n]+?)\s+to\b/i,
          /\bstarting from\s+([^,.;\n]+?)(?=[,.;\n]|$)/i,
          /\bleaving from\s+([^,.;\n]+?)(?=\s+(?:to|for)\b|[,.;\n]|$)/i,
          /\bfrom\s+([^,.;\n]+?)(?=\s+(?:arrive|arrival|depart|leave|leaving|at|by|around|compare|park)\b|[,.;\n]|$)/i,
        ]
      : [
          /\bleaving from\s+([^,.;\n]+?)(?=\s+(?:nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|find|and|for|to)\b|[,.;\n]|$)/i,
          /\bfrom\s+([^,.;\n]+?)\s+to\b/i,
          /\bfrom\s+([^,.;\n]+?)(?=\s+(?:nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|on|at|for)\b|[,.;\n]|$)/i,
        ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let origin = match[1].trim();
    origin = origin.replace(/\b(the|my|home)\b/gi, '').trim();

    const airportFromOrigin = extractAirportCode(origin);
    if (airportFromOrigin && origin.toUpperCase() === airportFromOrigin) {
      continue;
    }

    if (/^(sea|seatac|sea-tac|lax|las)$/i.test(origin)) {
      continue;
    }

    if (origin.length >= 2) {
      return origin
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }
  }

  return null;
}

function inferOriginSource(originText: string | null): ParsedTripOriginSource {
  if (!originText?.trim()) return 'unknown';
  return 'manual';
}

function extractDepartureTime(text: string): string | null {
  if (/\b(friday|saturday|weekend)\s+night\b/i.test(text)) return '20:00';
  if (/\bnight\b/i.test(text)) return '20:00';
  if (/\bmorning\b/i.test(text)) return '08:00';
  if (/\bevening\b/i.test(text)) return '18:00';
  if (/\bafternoon\b/i.test(text)) return '14:00';

  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
    const meridiem = timeMatch[3].toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return `${pad2(hour)}:${pad2(minute)}`;
  }

  const bareArrivalMatch = text.match(/\b(?:arrive|arrival|by|at|around)\s+(\d{1,2})(?::(\d{2}))?\b/i);
  if (bareArrivalMatch) {
    const hour = Number(bareArrivalMatch[1]);
    const minute = bareArrivalMatch[2] ? Number(bareArrivalMatch[2]) : 0;
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      return `${pad2(hour)}:${pad2(minute)}`;
    }
  }

  return null;
}

function extractTimeAnchor(text: string): ParsedTripAssistantResult['timeAnchor'] {
  if (/\b(now|asap|right away)\b/i.test(text)) return 'now';
  if (/\b(arrive|arrival|get there|be there)\b/i.test(text)) return 'arrive_by';
  if (/\b(leave|depart|leaving)\b/i.test(text)) return 'depart_at';
  return 'unknown';
}

function extractTransportAvailability(text: string): TransportAvailability | null {
  if (/\b(compare all|all options|parking and transit|transit and parking)\b/i.test(text)) {
    return 'all';
  }
  if (/\b(uber|lyft|rideshare|ride share|taxi|cab|no parking|without parking)\b/i.test(text)) {
    return 'rideshare';
  }
  if (/\b(transit|bus|train|light rail|link)\b/i.test(text)) return 'transit';
  if (/\b(drive|driving|parking|park)\b/i.test(text)) return 'car';
  return null;
}

function extractParkingPreference(
  text: string,
  transportAvailability: TransportAvailability | null,
  destinationText: string | null,
): ParkingPreference | null {
  if (/\b(no parking|without parking|don'?t need parking|uber|lyft|rideshare|taxi)\b/i.test(text)) {
    return 'none';
  }
  if (/\b(find parking nearby|nearby parking|paid parking|parking garage|garage)\b/i.test(text)) {
    return 'nearby';
  }
  if (/\b(parking at destination|destination parking|customer parking|store lot|on-?site parking)\b/i.test(text)) {
    return 'destination';
  }
  if (/\bpark(?:ing)?\b/i.test(text)) {
    const { kind } = destinationKindFromCategory(destinationText);
    return kind === 'downtown' ? 'nearby' : 'destination';
  }
  if (transportAvailability === 'rideshare' || transportAvailability === 'transit') return 'none';
  return null;
}

function extractParkingDurationMinutes(text: string): number | null {
  const hourMatch = text.match(/\b(?:park(?:ing)?\s*(?:for)?|for)\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr)\b/i);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : null;
  }

  const minuteMatch = text.match(/\b(?:park(?:ing)?\s*(?:for)?|for)\s+(\d+)\s*(?:minutes?|mins?|min)\b/i);
  if (minuteMatch) {
    const minutes = Number(minuteMatch[1]);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
  }

  return null;
}

const AIRLINE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\balaska(?:\s+airlines?)?\b/i, label: 'Alaska' },
  { pattern: /\bdelta(?:\s+air\s*lines?)?\b/i, label: 'Delta' },
  { pattern: /\bsouthwest(?:\s+airlines?)?\b/i, label: 'Southwest' },
  { pattern: /\bunited(?:\s+airlines?)?\b/i, label: 'United' },
  { pattern: /\bamerican(?:\s+airlines?)?\b/i, label: 'American' },
  { pattern: /\bjetblue\b/i, label: 'JetBlue' },
  { pattern: /\bfrontier\b/i, label: 'Frontier' },
  { pattern: /\bspirit\b/i, label: 'Spirit' },
];

function extractAirline(text: string): string | null {
  const flightMatch = text.match(/\b([A-Za-z]{2})\s*(\d{1,4})\b/);
  if (flightMatch) {
    return `${flightMatch[1].toUpperCase()} ${flightMatch[2]}`;
  }

  for (const { pattern, label } of AIRLINE_PATTERNS) {
    if (pattern.test(text)) return label;
  }

  const onMatch = text.match(
    /\bon\s+([A-Za-z][A-Za-z\s]{1,24}?)(?:\s+flight|\s+to|\s+from|,|\.|$)/i,
  );
  if (onMatch) {
    return onMatch[1].trim();
  }

  return null;
}

function extractParkingDays(text: string): number | null {
  const match = text.match(/\bfor\s+(\d+)\s+days?\b/i);
  if (match) return Number(match[1]);

  const match2 = text.match(/\b(\d+)\s+days?\s+of\s+parking\b/i);
  if (match2) return Number(match2[1]);

  return null;
}

function computeAirportMissingFields(
  result: Omit<ParsedTripAssistantResult, 'missingFields' | 'confidence' | 'parser'>,
): string[] {
  const missing: string[] = [];

  if (!result.originText) missing.push('originText');
  if (!result.airportCode) missing.push('airportCode');
  if (!result.departureDate) missing.push('departureDate');

  return missing;
}

function computeQuickGoMissingFields(
  result: Omit<ParsedTripAssistantResult, 'missingFields' | 'confidence' | 'parser'>,
): string[] {
  const missing: string[] = [];
  if (!result.destinationText?.trim()) missing.push('destinationText');
  return missing;
}

function computeConfidence(
  mode: TripParseMode,
  missingFields: string[],
  result: Omit<ParsedTripAssistantResult, 'confidence' | 'parser' | 'missingFields'>,
): 'high' | 'medium' | 'low' {
  if (mode === 'quick_go' || mode === 'general_trip') {
    if (missingFields.length === 0 && result.destinationText && result.originText) return 'high';
    if (result.destinationText) return 'medium';
    return 'low';
  }

  if (mode === 'parking_only') {
    if (missingFields.length === 0) return 'high';
    if (result.airportCode || result.destinationText) return 'medium';
    return 'low';
  }

  if (missingFields.length === 0 && result.originText && result.airportCode && result.departureDate) {
    return 'high';
  }

  if (missingFields.length <= 1 && (result.airportCode || result.departureDate)) {
    return 'medium';
  }

  return 'low';
}

function parseQuickGoTrip(text: string, now: Date): ParsedTripAssistantResult {
  const destinationText = extractQuickGoDestination(text);
  const originText = extractOrigin(text, 'quick_go');
  const originSource = inferOriginSource(originText);
  const parsedDates = extractDates(text, now);
  const anchor = extractTimeAnchor(text);
  const timing = anchor === 'now'
    ? formatQuickGoNow(now)
    : {
        departureDate: parsedDates.departureDate,
        departureTime: extractDepartureTime(text),
      };
  const { category: destinationCategory, kind: destinationKind } =
    destinationKindFromCategory(destinationText);
  const transportAvailability = extractTransportAvailability(text);
  const parkingPreference = extractParkingPreference(text, transportAvailability, destinationText);
  const parkingDurationMinutes = extractParkingDurationMinutes(text);

  const needsParking =
    parkingPreference === 'nearby' ||
    parkingPreference === 'destination' ||
    /\bpark(?:ing)?\b/i.test(text);

  const base: Omit<ParsedTripAssistantResult, 'missingFields' | 'confidence' | 'parser'> = {
    mode: 'quick_go',
    status: 'needs_clarification',
    destinationText,
    originSource,
    destinationCategory,
    destinationKind,
    originText,
    airportCode: null,
    destinationCity: null,
    airlineText: null,
    departureDate: timing.departureDate,
    departureTime: timing.departureTime,
    timeAnchor: anchor,
    returnDate: null,
    returnTime: null,
    parkingCheckInDate: timing.departureDate,
    parkingCheckInTime: timing.departureTime,
    parkingCheckOutDate: null,
    parkingCheckOutTime: null,
    parkingDurationMinutes,
    transportAvailability,
    parkingPreference,
    tripType: 'quick-go',
    needsParking,
    needsLeaveTime: false,
    clarificationQuestions: [],
  };

  const missingFields = computeQuickGoMissingFields(base);
  const computed = computeMissingParsedFields({
    ...base,
    missingFields,
    confidence: computeConfidence('quick_go', missingFields, base),
    parser: 'mock',
  });

  return {
    ...computed,
    confidence: computeConfidence('quick_go', computed.missingFields, base),
  };
}

function parseParkingOnlyTrip(text: string, now: Date): ParsedTripAssistantResult {
  const airportCode = extractAirportCode(text);
  const destinationText = airportCode ? null : extractQuickGoDestination(text);
  const window = extractParkingWindow(text, now);
  const parkingDurationMinutes =
    window.parkingCheckInDate &&
    window.parkingCheckInTime &&
    window.parkingCheckOutDate &&
    window.parkingCheckOutTime
      ? (() => {
          const start = new Date(`${window.parkingCheckInDate}T${window.parkingCheckInTime}:00`);
          const end = new Date(`${window.parkingCheckOutDate}T${window.parkingCheckOutTime}:00`);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
          const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
          return minutes > 0 ? minutes : null;
        })()
      : extractParkingDurationMinutes(text);

  const base: Omit<ParsedTripAssistantResult, 'missingFields' | 'confidence' | 'parser'> = {
    mode: 'parking_only',
    status: 'needs_clarification',
    destinationText,
    originSource: 'unknown',
    destinationCategory: airportCode ? 'airport' : null,
    destinationKind: airportCode ? 'airport' : 'general',
    originText: extractOrigin(text, 'airport_trip'),
    airportCode,
    destinationCity: null,
    airlineText: null,
    departureDate: window.parkingCheckInDate,
    departureTime: window.parkingCheckInTime,
    timeAnchor: 'depart_at',
    returnDate: window.parkingCheckOutDate,
    returnTime: window.parkingCheckOutTime,
    parkingCheckInDate: window.parkingCheckInDate,
    parkingCheckInTime: window.parkingCheckInTime,
    parkingCheckOutDate: window.parkingCheckOutDate,
    parkingCheckOutTime: window.parkingCheckOutTime,
    parkingDurationMinutes,
    transportAvailability: 'car',
    parkingPreference: 'nearby',
    tripType: 'parking-only',
    needsParking: true,
    needsLeaveTime: false,
    clarificationQuestions: [],
  };

  const computed = computeMissingParsedFields({
    ...base,
    missingFields: [],
    confidence: 'medium',
    parser: 'mock',
  });

  return {
    ...computed,
    confidence: computeConfidence('parking_only', computed.missingFields, base),
  };
}

function parseAirportTrip(text: string, now: Date): ParsedTripAssistantResult {
  const airportCode = extractAirportCode(text);
  const destinationCity = extractDestinationCity(text, airportCode);
  const originText = extractOrigin(text, 'airport_trip');
  const airlineText = extractAirline(text);
  const { departureDate, returnDate: parsedReturnDate } = extractDates(text, now);
  let returnDate = parsedReturnDate;
  const departureTime = extractDepartureTime(text);
  const transportAvailability = extractTransportAvailability(text);
  const parkingDays = extractParkingDays(text);

  const needsParking =
    /\bparking\b/i.test(text) ||
    /\bpark\b/i.test(text) ||
    parkingDays != null ||
    Boolean(returnDate);

  const needsLeaveTime =
    /\bleave(?:\s+by|\s+time)?\b/i.test(text) ||
    /\bflying\b/i.test(text) ||
    /\bflight\b/i.test(text) ||
    needsParking;

  let tripType = 'one-way-departure';
  if (returnDate || /\bweekend\b/i.test(text) || /\bcoming back\b/i.test(text)) {
    tripType = 'round-trip';
  }
  if (needsParking && !/\bflying\b/i.test(text) && !/\bflight\b/i.test(text)) {
    tripType = parkingDays ? 'one-way-departure' : tripType;
  }

  if (parkingDays && departureDate && !returnDate) {
    const checkout = new Date(`${departureDate}T12:00:00`);
    checkout.setDate(checkout.getDate() + parkingDays);
    returnDate = formatDate(checkout.getFullYear(), checkout.getMonth() + 1, checkout.getDate());
  }

  const base: Omit<ParsedTripAssistantResult, 'missingFields' | 'confidence' | 'parser'> = {
    mode: 'airport_trip',
    status: 'needs_clarification',
    destinationText: null,
    originSource: inferOriginSource(originText),
    destinationCategory: null,
    destinationKind: 'airport',
    originText,
    airportCode,
    destinationCity,
    airlineText,
    departureDate,
    departureTime,
    timeAnchor: 'depart_at',
    returnDate,
    returnTime: returnDate ? '12:00' : null,
    parkingCheckInDate: departureDate,
    parkingCheckInTime: departureTime,
    parkingCheckOutDate: returnDate,
    parkingCheckOutTime: returnDate ? '12:00' : null,
    parkingDurationMinutes: null,
    transportAvailability,
    parkingPreference: needsParking ? 'nearby' : null,
    tripType,
    needsParking,
    needsLeaveTime,
    clarificationQuestions: [],
  };

  const missingFields = computeAirportMissingFields(base);
  const computed = computeMissingParsedFields({
    ...base,
    missingFields,
    confidence: computeConfidence('airport_trip', missingFields, base),
    parser: 'mock',
  });

  return {
    ...computed,
    confidence: computeConfidence('airport_trip', computed.missingFields, base),
  };
}

export function parseTripTextMock(userText: string, now = new Date()): ParsedTripAssistantResult {
  const text = userText.trim();
  if (!text) {
    return parseAirportTrip(text, now);
  }

  const detected = detectTripIntent(text);
  const mode: TripParseMode =
    detected === 'unknown'
      ? extractAirportCode(text) || /\b(?:flight|flying|parking at|weekend trip)\b/i.test(text)
        ? 'airport_trip'
        : extractQuickGoDestination(text)
          ? 'quick_go'
          : 'airport_trip'
      : detected;

  if (mode === 'quick_go' || mode === 'general_trip') {
    return parseQuickGoTrip(text, now);
  }

  if (mode === 'parking_only') {
    return parseParkingOnlyTrip(text, now);
  }

  return parseAirportTrip(text, now);
}
