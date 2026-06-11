import { isEventVenueDestination } from '../parking/eventVenueDetection';

/**
 * Lightweight team/venue knowledge base used to infer a concrete event venue
 * from free text such as "the raiders stadium" when the trip city is Las Vegas.
 *
 * This never invents a game time or schedule — it only maps a team + city to a
 * well-known home venue so downstream event-parking rules can engage.
 */
type VenueRecord = {
  /** Lower-case team aliases. */
  aliases: string[];
  /** Canonical team label for copy, e.g. "Raiders". */
  label: string;
  venue: string;
  /** Lower-case home city used for away-game resolution. */
  city: string;
  /** Display city. */
  cityLabel: string;
};

const KNOWN_TEAMS: VenueRecord[] = [
  { aliases: ['seahawks'], label: 'Seahawks', venue: 'Lumen Field', city: 'seattle', cityLabel: 'Seattle' },
  { aliases: ['mariners'], label: 'Mariners', venue: 'T-Mobile Park', city: 'seattle', cityLabel: 'Seattle' },
  { aliases: ['kraken'], label: 'Kraken', venue: 'Climate Pledge Arena', city: 'seattle', cityLabel: 'Seattle' },
  { aliases: ['raiders', 'las vegas raiders'], label: 'Raiders', venue: 'Allegiant Stadium', city: 'las vegas', cityLabel: 'Las Vegas' },
  { aliases: ['golden knights', 'knights'], label: 'Golden Knights', venue: 'T-Mobile Arena', city: 'las vegas', cityLabel: 'Las Vegas' },
  { aliases: ['bears'], label: 'Bears', venue: 'Soldier Field', city: 'chicago', cityLabel: 'Chicago' },
  { aliases: ['giants', 'ny giants', 'new york giants'], label: 'Giants', venue: 'MetLife Stadium', city: 'east rutherford', cityLabel: 'East Rutherford' },
  { aliases: ['jets', 'ny jets'], label: 'Jets', venue: 'MetLife Stadium', city: 'east rutherford', cityLabel: 'East Rutherford' },
  { aliases: ['rams'], label: 'Rams', venue: 'SoFi Stadium', city: 'los angeles', cityLabel: 'Los Angeles' },
  { aliases: ['chargers'], label: 'Chargers', venue: 'SoFi Stadium', city: 'los angeles', cityLabel: 'Los Angeles' },
  { aliases: ['49ers', 'niners'], label: '49ers', venue: "Levi's Stadium", city: 'santa clara', cityLabel: 'Santa Clara' },
  { aliases: ['cowboys'], label: 'Cowboys', venue: 'AT&T Stadium', city: 'arlington', cityLabel: 'Arlington' },
  { aliases: ['broncos'], label: 'Broncos', venue: 'Empower Field', city: 'denver', cityLabel: 'Denver' },
  { aliases: ['cardinals'], label: 'Cardinals', venue: 'State Farm Stadium', city: 'glendale', cityLabel: 'Glendale' },
];

const CITY_ALIASES: Record<string, string> = {
  vegas: 'Las Vegas',
  'las vegas': 'Las Vegas',
  seattle: 'Seattle',
  chicago: 'Chicago',
  'los angeles': 'Los Angeles',
  denver: 'Denver',
  phoenix: 'Phoenix',
  glendale: 'Glendale',
  arlington: 'Arlington',
  dallas: 'Dallas',
};

const EVENT_SIGNAL_PATTERN =
  /\b(game|match|concert|tailgate|nfl|mlb|nba|nhl|mls|soccer|football|baseball|basketball|hockey|playoff|kickoff)\b/i;

const TEAM_VENUE_PHRASE = /\b([a-z' ]+?)['’]?s?\s+(stadium|arena|field|ballpark)\b/i;

export type EventVenueInference = {
  isEvent: boolean;
  venueName: string | null;
  city: string | null;
  eventLabel: string | null;
  teams: string[];
};

function findCity(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [alias, label] of Object.entries(CITY_ALIASES)) {
    const pattern = new RegExp(`\\b${alias.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lower)) return label;
  }
  return null;
}

function findMentionedTeams(text: string): Array<{ record: VenueRecord; index: number }> {
  const lower = text.toLowerCase();
  const found: Array<{ record: VenueRecord; index: number }> = [];
  const seen = new Set<string>();

  for (const record of KNOWN_TEAMS) {
    for (const alias of record.aliases) {
      const index = lower.indexOf(alias);
      if (index >= 0 && !seen.has(record.label)) {
        seen.add(record.label);
        found.push({ record, index });
        break;
      }
    }
  }

  return found.sort((a, b) => a.index - b.index);
}

function buildEventLabel(teamLabels: string[]): string | null {
  if (teamLabels.length >= 2) return `${teamLabels[0]}/${teamLabels[1]} game`;
  if (teamLabels.length === 1) return `${teamLabels[0]} game`;
  return null;
}

/**
 * Infer an event venue from free text. Returns isEvent=false when there is no
 * event signal at all. When an event signal exists but no concrete venue can be
 * resolved, venueName stays null and the caller keeps the user's destination
 * text while still treating the trip as event-sensitive.
 */
export function inferEventVenue(input: {
  text: string;
  tripCity?: string | null;
  destinationText?: string | null;
}): EventVenueInference {
  const text = String(input.text || '');
  const destinationText = String(input.destinationText || '').trim();
  const mentioned = findMentionedTeams(text);
  const teamLabels = mentioned.map((entry) => entry.record.label);
  const city = (input.tripCity && input.tripCity.trim()) || findCity(text);
  const cityLower = city ? city.toLowerCase() : null;

  const destinationIsVenue = destinationText
    ? isEventVenueDestination({ destination: destinationText })
    : false;

  const hasEventSignal =
    teamLabels.length > 0 ||
    EVENT_SIGNAL_PATTERN.test(text) ||
    destinationIsVenue ||
    TEAM_VENUE_PHRASE.test(text);

  if (!hasEventSignal) {
    return { isEvent: false, venueName: null, city: city || null, eventLabel: null, teams: [] };
  }

  // If the destination text is already a recognizable venue name, prefer it.
  let venueName: string | null = destinationIsVenue ? destinationText : null;

  if (!venueName) {
    // Away-game resolution: when the trip city has a known home venue, the game
    // is played there (e.g. Seahawks @ Las Vegas → Allegiant Stadium), even if
    // the home team isn't explicitly named.
    const homeRecordForCity = cityLower
      ? KNOWN_TEAMS.find((record) => record.city === cityLower)
      : undefined;

    if (mentioned.length > 0 && homeRecordForCity) {
      venueName = homeRecordForCity.venue;
      if (!teamLabels.includes(homeRecordForCity.label)) {
        teamLabels.push(homeRecordForCity.label);
      }
    }

    // Explicit "raiders stadium" style phrasing points to that team's venue.
    if (!venueName) {
      const phraseMatch = text.match(TEAM_VENUE_PHRASE);
      if (phraseMatch) {
        const phraseTeam = mentioned.find((entry) =>
          entry.record.aliases.some((alias) => phraseMatch[1].toLowerCase().includes(alias)),
        );
        if (phraseTeam) venueName = phraseTeam.record.venue;
      }
    }

    // Single team mentioned at its home city → its home venue.
    if (!venueName && mentioned.length === 1) {
      venueName = mentioned[0].record.venue;
    }

    // No team named, but the city itself has a single famous home venue.
    if (!venueName && homeRecordForCity) {
      venueName = homeRecordForCity.venue;
    }
  }

  return {
    isEvent: true,
    venueName,
    city: city || null,
    eventLabel: buildEventLabel(teamLabels),
    teams: teamLabels,
  };
}
