import type { ParsedTripAssistantResult } from './tripParseTypes';

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
};

const KNOWN_AIRPORT_CODES = new Set(Object.values(AIRPORT_ALIASES));

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
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

  if (singleMatches[0]) {
    departureDate = parseMonthDay(
      singleMatches[0][1],
      singleMatches[0][2],
      singleMatches[0][3],
      now,
    );
  }

  if (singleMatches[1]) {
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

function extractOrigin(text: string): string | null {
  const patterns = [
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

function computeMissingFields(
  result: Omit<ParsedTripAssistantResult, 'missingFields' | 'confidence' | 'parser'>,
): string[] {
  const missing: string[] = [];

  if (!result.originText) missing.push('originText');
  if (!result.airportCode) missing.push('airportCode');
  if (!result.departureDate) missing.push('departureDate');

  return missing;
}

function computeConfidence(
  missingFields: string[],
  result: Omit<ParsedTripAssistantResult, 'confidence' | 'parser' | 'missingFields'>,
): 'high' | 'medium' | 'low' {
  if (missingFields.length === 0 && result.originText && result.airportCode && result.departureDate) {
    return 'high';
  }

  if (missingFields.length <= 1 && (result.airportCode || result.departureDate)) {
    return 'medium';
  }

  return 'low';
}

export function parseTripTextMock(userText: string, now = new Date()): ParsedTripAssistantResult {
  const text = userText.trim();
  const lower = text.toLowerCase();

  const airportCode = extractAirportCode(text);
  const destinationCity = extractDestinationCity(text, airportCode);
  const originText = extractOrigin(text);
  const airlineText = extractAirline(text);
  const { departureDate, returnDate: parsedReturnDate } = extractDates(text, now);
  let returnDate = parsedReturnDate;
  const departureTime = extractDepartureTime(text) || '12:00';
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

  const base = {
    originText,
    airportCode,
    destinationCity,
    airlineText,
    departureDate,
    departureTime,
    returnDate,
    returnTime: returnDate ? '12:00' : null,
    tripType,
    needsParking,
    needsLeaveTime,
  };

  const missingFields = computeMissingFields(base);

  return {
    ...base,
    missingFields,
    confidence: computeConfidence(missingFields, base),
    parser: 'mock',
  };
}
