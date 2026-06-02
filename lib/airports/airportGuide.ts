import { parseAirlineOrFlight } from './seatacCheckin';

export type AirlineTerminalMapping = {
  matchNames: string[];
  carrierCodes?: string[];
  terminal: string;
  concourse?: string;
  checkInNote: string;
};

export type AirportGuide = {
  airportCode: string;
  airportName: string;
  city: string;
  timezone: string;
  terminals: string[];
  tsaPreCheckAvailable: boolean;
  clearAvailable: boolean;
  generalSecurityNotes: string;
  ridesharePickupNotes: string;
  parkingNotes: string;
  officialAirportUrl: string;
  airlineTerminalMap: AirlineTerminalMapping[];
};

export const AIRPORT_TRIP_DISCLAIMER =
  'Confirm terminal, gate, and check-in details with your airline or airport before travel.';

const SEA_AIRLINE_TERMINAL_MAP: AirlineTerminalMapping[] = [
  {
    matchNames: ['alaska'],
    carrierCodes: ['AS'],
    terminal: 'North Satellite',
    concourse: 'N Gates',
    checkInNote: 'Alaska Airlines check-in is typically in the North Satellite (N Gates).',
  },
  {
    matchNames: ['delta'],
    carrierCodes: ['DL'],
    terminal: 'Central Terminal',
    concourse: 'A Gates',
    checkInNote: 'Delta check-in is typically in the Central Terminal (A Gates).',
  },
  {
    matchNames: ['southwest'],
    carrierCodes: ['WN'],
    terminal: 'Central Terminal',
    checkInNote: 'Southwest check-in is typically in the Central Terminal.',
  },
  {
    matchNames: ['united'],
    carrierCodes: ['UA'],
    terminal: 'Central Terminal',
    checkInNote: 'United check-in is typically in the Central Terminal.',
  },
  {
    matchNames: ['american'],
    carrierCodes: ['AA'],
    terminal: 'Central Terminal',
    checkInNote: 'American check-in is typically in the Central Terminal.',
  },
  {
    matchNames: ['international', 'british', 'lufthansa', 'emirates', 'air france'],
    carrierCodes: ['BA', 'AF', 'KL', 'KE', 'JL', 'NH', 'AC', 'SQ', 'EK', 'QR', 'TK'],
    terminal: 'South Satellite',
    concourse: 'S Gates',
    checkInNote: 'Many international carriers use the South Satellite (S Gates).',
  },
];

function majorHubMap(terminalNotes: Record<string, AirlineTerminalMapping>): AirlineTerminalMapping[] {
  return Object.values(terminalNotes);
}

export const AIRPORT_GUIDES: Record<string, AirportGuide> = {
  SEA: {
    airportCode: 'SEA',
    airportName: 'Seattle-Tacoma International Airport',
    city: 'SeaTac, WA',
    timezone: 'America/Los_Angeles',
    terminals: ['Central Terminal', 'North Satellite', 'South Satellite'],
    tsaPreCheckAvailable: true,
    clearAvailable: true,
    generalSecurityNotes:
      'Arrive early for TSA screening. PreCheck and CLEAR can reduce wait time when available.',
    ridesharePickupNotes:
      'Use the designated app-ride pickup zones on the parking garage third floor or follow airport signage.',
    parkingNotes:
      'Off-airport and garage parking are common. Confirm shuttle or walk time to your terminal.',
    officialAirportUrl: 'https://www.portseattle.org/sea-tac',
    airlineTerminalMap: SEA_AIRLINE_TERMINAL_MAP,
  },
  LAX: {
    airportCode: 'LAX',
    airportName: 'Los Angeles International Airport',
    city: 'Los Angeles, CA',
    timezone: 'America/Los_Angeles',
    terminals: ['Terminal 1', 'Terminal 2', 'Terminal 3', 'Terminal 4', 'Terminal 5', 'Terminal 6', 'Terminal 7', 'Terminal 8', 'Tom Bradley International Terminal'],
    tsaPreCheckAvailable: true,
    clearAvailable: true,
    generalSecurityNotes:
      'LAX has multiple terminals connected by shuttle or walk paths. Allow extra time between terminals.',
    ridesharePickupNotes:
      'Follow LAX signage for app-ride pickup by terminal level and color-coded zones.',
    parkingNotes:
      'Central Terminal Area parking and off-airport lots are both common. Shuttle time varies by terminal.',
    officialAirportUrl: 'https://www.flylax.com',
    airlineTerminalMap: majorHubMap({
      delta: {
        matchNames: ['delta'],
        carrierCodes: ['DL'],
        terminal: 'Terminal 3',
        checkInNote: 'Delta often uses Terminal 3 at LAX. Confirm before travel.',
      },
      american: {
        matchNames: ['american'],
        carrierCodes: ['AA'],
        terminal: 'Terminal 4 / 5',
        checkInNote: 'American often uses Terminals 4 and 5 at LAX. Confirm before travel.',
      },
      united: {
        matchNames: ['united'],
        carrierCodes: ['UA'],
        terminal: 'Terminal 7 / 8',
        checkInNote: 'United often uses Terminals 7 and 8 at LAX. Confirm before travel.',
      },
      southwest: {
        matchNames: ['southwest'],
        carrierCodes: ['WN'],
        terminal: 'Terminal 1',
        checkInNote: 'Southwest often uses Terminal 1 at LAX. Confirm before travel.',
      },
    }),
  },
  JFK: {
    airportCode: 'JFK',
    airportName: 'John F. Kennedy International Airport',
    city: 'New York, NY',
    timezone: 'America/New_York',
    terminals: ['Terminal 1', 'Terminal 4', 'Terminal 5', 'Terminal 7', 'Terminal 8'],
    tsaPreCheckAvailable: true,
    clearAvailable: true,
    generalSecurityNotes:
      'JFK terminals are spread out. AirTrain connections add time between terminals.',
    ridesharePickupNotes:
      'App-ride pickup locations vary by terminal. Follow on-site signage or your driver app.',
    parkingNotes:
      'On-airport and off-airport parking are available. Confirm shuttle service to your terminal.',
    officialAirportUrl: 'https://www.jfkairport.com',
    airlineTerminalMap: [
      {
        matchNames: ['delta'],
        carrierCodes: ['DL'],
        terminal: 'Terminal 4',
        checkInNote: 'Delta primarily uses Terminal 4 at JFK. Confirm before travel.',
      },
      {
        matchNames: ['american', 'jetblue'],
        carrierCodes: ['AA', 'B6'],
        terminal: 'Terminal 8 / 5',
        checkInNote: 'American and JetBlue often use Terminals 8 and 5. Confirm before travel.',
      },
      // TODO: Expand JFK airline terminal seed list from official airport directory.
    ],
  },
  ORD: {
    airportCode: 'ORD',
    airportName: "O'Hare International Airport",
    city: 'Chicago, IL',
    timezone: 'America/Chicago',
    terminals: ['Terminal 1', 'Terminal 2', 'Terminal 3', 'Terminal 5'],
    tsaPreCheckAvailable: true,
    clearAvailable: true,
    generalSecurityNotes:
      'ORD uses separate domestic and international terminal complexes. Allow time for connections.',
    ridesharePickupNotes:
      'Use the designated app-ride pickup areas by terminal on the arrivals level.',
    parkingNotes:
      'Hourly and daily garages exist by terminal. Off-airport parking often includes shuttle service.',
    officialAirportUrl: 'https://www.flychicago.com/ohare',
    airlineTerminalMap: [
      {
        matchNames: ['united'],
        carrierCodes: ['UA'],
        terminal: 'Terminal 1',
        checkInNote: 'United primarily uses Terminal 1 at ORD. Confirm before travel.',
      },
      {
        matchNames: ['american'],
        carrierCodes: ['AA'],
        terminal: 'Terminal 3',
        checkInNote: 'American primarily uses Terminal 3 at ORD. Confirm before travel.',
      },
      // TODO: Expand ORD airline terminal seed list.
    ],
  },
  ATL: {
    airportCode: 'ATL',
    airportName: 'Hartsfield-Jackson Atlanta International Airport',
    city: 'Atlanta, GA',
    timezone: 'America/New_York',
    terminals: ['Domestic Terminal', 'Concourses T, A, B, C, D, E, F'],
    tsaPreCheckAvailable: true,
    clearAvailable: true,
    generalSecurityNotes:
      'ATL is a large hub with concourse trains. Allow extra time for gate changes.',
    ridesharePickupNotes:
      'App-ride pickup is at the North or South economy parking areas depending on signage.',
    parkingNotes:
      'Hourly, daily, and economy parking options are available with shuttle or walk connections.',
    officialAirportUrl: 'https://www.atl.com',
    airlineTerminalMap: [
      {
        matchNames: ['delta'],
        carrierCodes: ['DL'],
        terminal: 'Domestic Terminal / Concourse T',
        checkInNote: 'Delta uses the Domestic Terminal and Concourses T, A, and B at ATL.',
      },
      {
        matchNames: ['southwest'],
        carrierCodes: ['WN'],
        terminal: 'Concourse C',
        checkInNote: 'Southwest often uses Concourse C at ATL. Confirm before travel.',
      },
    ],
  },
  DFW: {
    airportCode: 'DFW',
    airportName: 'Dallas/Fort Worth International Airport',
    city: 'Dallas-Fort Worth, TX',
    timezone: 'America/Chicago',
    terminals: ['Terminal A', 'Terminal B', 'Terminal C', 'Terminal D', 'Terminal E'],
    tsaPreCheckAvailable: true,
    clearAvailable: true,
    generalSecurityNotes:
      'DFW uses separate terminals connected by Skylink. Connections can take 15–30 minutes.',
    ridesharePickupNotes:
      'App-ride pickup zones are marked by terminal on the arrivals level.',
    parkingNotes:
      'Terminal garages and express parking are available. Off-airport lots use shuttles.',
    officialAirportUrl: 'https://www.dfwairport.com',
    airlineTerminalMap: [
      {
        matchNames: ['american'],
        carrierCodes: ['AA'],
        terminal: 'Terminals A, B, C, D',
        checkInNote: 'American uses multiple DFW terminals. Confirm your departure terminal.',
      },
      {
        matchNames: ['united'],
        carrierCodes: ['UA'],
        terminal: 'Terminal E',
        checkInNote: 'United often uses Terminal E at DFW. Confirm before travel.',
      },
    ],
  },
  LAS: {
    airportCode: 'LAS',
    airportName: 'Harry Reid International Airport',
    city: 'Las Vegas, NV',
    timezone: 'America/Los_Angeles',
    terminals: ['Terminal 1', 'Terminal 3'],
    tsaPreCheckAvailable: true,
    clearAvailable: true,
    generalSecurityNotes:
      'LAS has two terminal complexes. Verify your airline terminal before parking or rideshare pickup.',
    ridesharePickupNotes:
      'App-ride pickup is on Level 2 at Terminal 1 or Level 1 at Terminal 3.',
    parkingNotes:
      'Short-term, long-term, and economy parking are available by terminal.',
    officialAirportUrl: 'https://www.harryreidairport.com',
    airlineTerminalMap: [
      {
        matchNames: ['southwest'],
        carrierCodes: ['WN'],
        terminal: 'Terminal 1',
        checkInNote: 'Southwest primarily uses Terminal 1 at LAS. Confirm before travel.',
      },
      {
        matchNames: ['delta'],
        carrierCodes: ['DL'],
        terminal: 'Terminal 3',
        checkInNote: 'Delta often uses Terminal 3 at LAS. Confirm before travel.',
      },
    ],
  },
  MCO: {
    airportCode: 'MCO',
    airportName: 'Orlando International Airport',
    city: 'Orlando, FL',
    timezone: 'America/New_York',
    terminals: ['Terminal A', 'Terminal B', 'Terminal C'],
    tsaPreCheckAvailable: true,
    clearAvailable: true,
    generalSecurityNotes:
      'MCO can be busy during peak vacation travel. Arrive early for security.',
    ridesharePickupNotes:
      'App-ride pickup is on Level 2 across from the A-Side and B-Side garages.',
    parkingNotes:
      'Garage and economy parking are available. Off-airport lots often include shuttle service.',
    officialAirportUrl: 'https://orlandoairports.net',
    airlineTerminalMap: [
      {
        matchNames: ['southwest'],
        carrierCodes: ['WN'],
        terminal: 'Terminal A',
        checkInNote: 'Southwest often uses Terminal A at MCO. Confirm before travel.',
      },
      {
        matchNames: ['delta'],
        carrierCodes: ['DL'],
        terminal: 'Terminal B',
        checkInNote: 'Delta often uses Terminal B at MCO. Confirm before travel.',
      },
      // TODO: Expand MCO airline terminal seed list.
    ],
  },
  PAE: {
    airportCode: 'PAE',
    airportName: 'Paine Field Passenger Terminal',
    city: 'Everett, WA',
    timezone: 'America/Los_Angeles',
    terminals: ['Main Terminal'],
    tsaPreCheckAvailable: true,
    clearAvailable: false,
    generalSecurityNotes:
      'PAE is a smaller passenger terminal. Security lines are usually shorter but still arrive early.',
    ridesharePickupNotes:
      'Use the marked pickup area in front of the passenger terminal.',
    parkingNotes:
      'On-site parking is close to the terminal. Confirm lot availability during peak travel.',
    officialAirportUrl: 'https://flypainefield.com',
    airlineTerminalMap: [
      {
        matchNames: ['alaska'],
        carrierCodes: ['AS'],
        terminal: 'Main Terminal',
        checkInNote: 'Alaska uses the Paine Field main terminal.',
      },
      {
        matchNames: ['southwest'],
        carrierCodes: ['WN'],
        terminal: 'Main Terminal',
        checkInNote: 'Southwest uses the Paine Field main terminal.',
      },
    ],
  },
};

export function getAirportGuide(airportCode: string | null | undefined): AirportGuide | null {
  if (!airportCode) return null;
  return AIRPORT_GUIDES[airportCode.trim().toUpperCase()] ?? null;
}

export function normalizeAirlineInput(input: string): string {
  return input.trim().toLowerCase();
}

function mappingMatches(mapping: AirlineTerminalMapping, normalized: string, carrierCode?: string): boolean {
  if (carrierCode && mapping.carrierCodes?.includes(carrierCode)) {
    return true;
  }

  return mapping.matchNames.some((name) => normalized.includes(name));
}

export type AirlineLookupResult = {
  airportCode: string;
  airlineInput: string;
  airlineName: string | null;
  terminal: string | null;
  concourse: string | null;
  checkInNote: string;
  confidence: 'known' | 'unknown';
  tsaPreCheckAvailable: boolean;
  clearAvailable: boolean;
  disclaimer: string;
  guide: AirportGuide;
};

export function lookupAirlineGuide(
  airportCode: string,
  airlineInput: string,
): AirlineLookupResult | null {
  const guide = getAirportGuide(airportCode);
  const trimmed = airlineInput.trim();
  if (!guide || !trimmed) return null;

  const parsed = parseAirlineOrFlight(trimmed);
  const normalized = normalizeAirlineInput(trimmed);
  const hit = guide.airlineTerminalMap.find((mapping) =>
    mappingMatches(mapping, normalized, parsed.carrierCode),
  );

  if (hit) {
    return {
      airportCode: guide.airportCode,
      airlineInput: trimmed,
      airlineName: parsed.airlineName || hit.matchNames[0] || null,
      terminal: hit.terminal,
      concourse: hit.concourse ?? null,
      checkInNote: hit.checkInNote,
      confidence: 'known',
      tsaPreCheckAvailable: guide.tsaPreCheckAvailable,
      clearAvailable: guide.clearAvailable,
      disclaimer: AIRPORT_TRIP_DISCLAIMER,
      guide,
    };
  }

  return {
    airportCode: guide.airportCode,
    airlineInput: trimmed,
    airlineName: parsed.airlineName || trimmed,
    terminal: null,
    concourse: null,
    checkInNote: `We could not match ${trimmed} to a published ${guide.airportCode} terminal map. ${AIRPORT_TRIP_DISCLAIMER}`,
    confidence: 'unknown',
    tsaPreCheckAvailable: guide.tsaPreCheckAvailable,
    clearAvailable: guide.clearAvailable,
    disclaimer: AIRPORT_TRIP_DISCLAIMER,
    guide,
  };
}

export type AirportTripChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

export type AirportTripCardModel = {
  airportCode: string;
  airportName: string;
  city: string;
  airlineLabel: string | null;
  terminalLabel: string | null;
  leaveByTime: string | null;
  parkingPickName: string | null;
  tsaPreCheckAvailable: boolean;
  clearAvailable: boolean;
  checklist: AirportTripChecklistItem[];
  disclaimer: string;
};

export function buildAirportTripCardModel(args: {
  airportCode: string;
  airlineOrFlight?: string | null;
  leaveByTime?: string | null;
  parkingPickName?: string | null;
  checkingBags?: boolean;
}): AirportTripCardModel | null {
  const guide = getAirportGuide(args.airportCode);
  if (!guide) return null;

  const lookup = args.airlineOrFlight?.trim()
    ? lookupAirlineGuide(guide.airportCode, args.airlineOrFlight)
    : null;

  const terminalLabel = lookup?.terminal
    ? lookup.concourse
      ? `${lookup.terminal} · ${lookup.concourse}`
      : lookup.terminal
    : null;

  return {
    airportCode: guide.airportCode,
    airportName: guide.airportName,
    city: guide.city,
    airlineLabel: lookup?.airlineName || args.airlineOrFlight?.trim() || null,
    terminalLabel,
    leaveByTime: args.leaveByTime ?? null,
    parkingPickName: args.parkingPickName ?? null,
    tsaPreCheckAvailable: guide.tsaPreCheckAvailable,
    clearAvailable: guide.clearAvailable,
    checklist: [
      { id: 'id', label: 'Government ID / passport', done: false },
      { id: 'boarding-pass', label: 'Boarding pass ready', done: false },
      { id: 'parking', label: 'Parking reservation confirmed', done: Boolean(args.parkingPickName) },
      { id: 'buffer', label: 'Arrive with airport buffer time', done: Boolean(args.leaveByTime) },
      {
        id: 'bags',
        label: args.checkingBags ? 'Checked bags ready for drop-off' : 'Carry-on bags only',
        done: !args.checkingBags,
      },
    ],
    disclaimer: AIRPORT_TRIP_DISCLAIMER,
  };
}
