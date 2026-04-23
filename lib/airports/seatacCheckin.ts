export type SeatacCheckinZone = {
  /** Destination key used throughout the existing recommendation engine (maps to TSA + mock data keys). */
  destination: 'Central Terminal' | 'North Satellite' | 'South Satellite';
  /** Consumer-friendly short note to show under "SeaTac Airport". */
  note?: string;
  /** Parsed carrier/flight information used only for display. */
  carrierCode?: string;
  airlineName?: string;
  flightNumber?: string;
};

const AIRLINE_TO_ZONE: Array<{
  match: (input: string, carrierCode?: string) => boolean;
  zone: SeatacCheckinZone['destination'];
  note: string;
  airlineName: string;
  carrierCodes?: string[];
}> = [
  {
    match: (input, carrierCode) =>
      input.includes('alaska') || carrierCode === 'AS',
    zone: 'North Satellite',
    note: 'Alaska → N Gates',
    airlineName: 'Alaska',
    carrierCodes: ['AS'],
  },
  {
    match: (input, carrierCode) =>
      input.includes('delta') || carrierCode === 'DL',
    zone: 'Central Terminal',
    note: 'Delta → A Gates',
    airlineName: 'Delta',
    carrierCodes: ['DL'],
  },
  {
    match: (input, carrierCode) =>
      input.includes('southwest') || carrierCode === 'WN',
    zone: 'Central Terminal',
    note: 'Southwest → Central check-in',
    airlineName: 'Southwest',
    carrierCodes: ['WN'],
  },
  {
    match: (input, carrierCode) =>
      input.includes('united') || carrierCode === 'UA',
    zone: 'Central Terminal',
    note: 'United → Central check-in',
    airlineName: 'United',
    carrierCodes: ['UA'],
  },
  {
    match: (input, carrierCode) =>
      input.includes('american') || carrierCode === 'AA',
    zone: 'Central Terminal',
    note: 'American → Central check-in',
    airlineName: 'American',
    carrierCodes: ['AA'],
  },
  {
    match: (input, carrierCode) =>
      input.includes('international') ||
      ['BA', 'AF', 'KL', 'KE', 'JL', 'NH', 'AC', 'SQ', 'EK', 'QR', 'TK'].includes(carrierCode || ''),
    zone: 'South Satellite',
    note: 'International → S Gates (varies)',
    airlineName: 'International',
  },
];

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Best-effort parsing for inputs like:
 * - "Alaska"
 * - "AS123"
 * - "AS 123"
 * - "DL 42"
 */
export function parseAirlineOrFlight(inputRaw: string): {
  carrierCode?: string;
  flightNumber?: string;
  airlineName?: string;
} {
  const input = inputRaw.trim();
  if (!input) return {};

  const compact = input.replace(/\s+/g, '');
  const flightMatch = compact.match(/^([A-Za-z]{2,3})(\d{1,4})$/);
  if (flightMatch) {
    return {
      carrierCode: flightMatch[1].toUpperCase(),
      flightNumber: flightMatch[2],
    };
  }

  return { airlineName: input };
}

export function resolveSeatacCheckinZone(airlineOrFlight: string): SeatacCheckinZone {
  const normalized = normalize(airlineOrFlight);
  const parsed = parseAirlineOrFlight(airlineOrFlight);

  const hit = AIRLINE_TO_ZONE.find((rule) => rule.match(normalized, parsed.carrierCode));
  if (hit) {
    return {
      destination: hit.zone,
      note: hit.note,
      carrierCode: parsed.carrierCode,
      airlineName: parsed.airlineName || hit.airlineName,
      flightNumber: parsed.flightNumber,
    };
  }

  return {
    destination: 'Central Terminal',
    note: 'SeaTac main terminal check-in',
    carrierCode: parsed.carrierCode,
    airlineName: parsed.airlineName,
    flightNumber: parsed.flightNumber,
  };
}

export function getSeatacRideshareDropoffNote(): string {
  return 'Rideshare drop-off: Departures drive (upper level)';
}
