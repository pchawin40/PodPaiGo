export type AirlineCatalogEntry = {
  name: string;
  carrierCodes: string[];
  aliases: string[];
};

export const AIRLINE_CATALOG: AirlineCatalogEntry[] = [
  { name: 'Alaska Airlines', carrierCodes: ['AS'], aliases: ['alaska'] },
  { name: 'Delta Air Lines', carrierCodes: ['DL'], aliases: ['delta'] },
  { name: 'United Airlines', carrierCodes: ['UA'], aliases: ['united'] },
  { name: 'American Airlines', carrierCodes: ['AA'], aliases: ['american'] },
  { name: 'Southwest Airlines', carrierCodes: ['WN'], aliases: ['southwest'] },
  { name: 'JetBlue', carrierCodes: ['B6'], aliases: ['jetblue', 'jet blue'] },
  { name: 'Spirit', carrierCodes: ['NK'], aliases: ['spirit'] },
  { name: 'Frontier', carrierCodes: ['F9'], aliases: ['frontier'] },
  { name: 'Hawaiian Airlines', carrierCodes: ['HA'], aliases: ['hawaiian'] },
  { name: 'Air Canada', carrierCodes: ['AC'], aliases: ['air canada'] },
  { name: 'British Airways', carrierCodes: ['BA'], aliases: ['british airways', 'british'] },
  { name: 'Emirates', carrierCodes: ['EK'], aliases: ['emirates'] },
  { name: 'Qatar Airways', carrierCodes: ['QR'], aliases: ['qatar'] },
  { name: 'ANA', carrierCodes: ['NH'], aliases: ['ana', 'all nippon'] },
  { name: 'Japan Airlines', carrierCodes: ['JL'], aliases: ['japan airlines', 'jal'] },
];

const CARRIER_CODE_TO_AIRLINE = new Map<string, AirlineCatalogEntry>();

for (const entry of AIRLINE_CATALOG) {
  for (const code of entry.carrierCodes) {
    CARRIER_CODE_TO_AIRLINE.set(code.toUpperCase(), entry);
  }
}

export function searchAirlines(query: string, limit = 8): AirlineCatalogEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return AIRLINE_CATALOG.slice(0, limit);

  return AIRLINE_CATALOG.filter((entry) => {
    if (entry.name.toLowerCase().includes(trimmed)) return true;
    if (entry.aliases.some((alias) => alias.includes(trimmed) || trimmed.includes(alias))) {
      return true;
    }
    return entry.carrierCodes.some((code) => code.toLowerCase().startsWith(trimmed));
  }).slice(0, limit);
}

export type ResolvedAirlineInput = {
  rawInput: string;
  airlineName: string | null;
  carrierCode: string | null;
  flightNumber: string | null;
  matchedCatalogEntry: AirlineCatalogEntry | null;
};

export function resolveAirlineInput(inputRaw: string): ResolvedAirlineInput {
  const rawInput = inputRaw.trim();
  if (!rawInput) {
    return {
      rawInput: '',
      airlineName: null,
      carrierCode: null,
      flightNumber: null,
      matchedCatalogEntry: null,
    };
  }

  const compact = rawInput.replace(/\s+/g, ' ');
  const flightMatch = compact.match(/^([A-Za-z0-9]{2})(?:\s+)?(\d{1,4})$/i);
  if (flightMatch) {
    const carrierCode = flightMatch[1].toUpperCase();
    const flightNumber = flightMatch[2];
    const entry = CARRIER_CODE_TO_AIRLINE.get(carrierCode) ?? null;

    return {
      rawInput,
      airlineName: entry?.name ?? null,
      carrierCode,
      flightNumber,
      matchedCatalogEntry: entry,
    };
  }

  const lower = rawInput.toLowerCase();
  const directNameMatch = AIRLINE_CATALOG.find(
    (entry) =>
      entry.name.toLowerCase() === lower ||
      entry.aliases.some((alias) => alias === lower || lower.includes(alias)),
  );

  if (directNameMatch) {
    return {
      rawInput,
      airlineName: directNameMatch.name,
      carrierCode: directNameMatch.carrierCodes[0] ?? null,
      flightNumber: null,
      matchedCatalogEntry: directNameMatch,
    };
  }

  const fuzzyMatch = searchAirlines(rawInput, 1)[0] ?? null;
  if (fuzzyMatch && fuzzyMatch.name.toLowerCase().startsWith(lower.slice(0, 2))) {
    return {
      rawInput,
      airlineName: fuzzyMatch.name,
      carrierCode: fuzzyMatch.carrierCodes[0] ?? null,
      flightNumber: null,
      matchedCatalogEntry: fuzzyMatch,
    };
  }

  return {
    rawInput,
    airlineName: rawInput,
    carrierCode: null,
    flightNumber: null,
    matchedCatalogEntry: null,
  };
}
