export type EventVenueDetectionInput = {
  destination?: string | null;
  destinationKind?: string | null;
  origin?: string | null;
  airportCode?: string | null;
};

export const EVENT_PARKING_OUTLOOK_COPY =
  'Event parking likely. Street parking may be restricted, full, time-limited, or tow-enforced during games and events. Use official/prepaid parking, transit, or verified lots.';

export const EVENT_STREET_METER_FALLBACK_CON =
  'Risky during events. Check posted signs, event-zone rules, time limits, and towing restrictions.';

const KNOWN_EVENT_VENUE_PATTERN =
  /\b(lumen field|t[- ]?mobile park|climate pledge arena|allegiant stadium|soldier field|metlife stadium|sofi stadium|at&t stadium|centurylink field|oracle park|fenway park|wrigley field|yankee stadium|dodger stadium|minute maid park|petco park|nationals park|progressive field|coors field|busch stadium|target field|truist park|loandepot park|great american ball park|pnc park|citizens bank park|rogers centre|angel stadium|kauffman stadium|gillette stadium|lambeau field|ford field|mercedes-benz stadium|nrg stadium|arrowhead stadium|empower field|hard rock stadium|raymond james stadium|bank of america stadium|lucas oil stadium|fedex field|nissan stadium|acrisure stadium|caesars superdome|madison square garden|barclays center|chase center|crypto\.com arena|chase field|ball arena|toyota stadium|allianz field|providence park|keyarena|key arena|centurylink field|t mobile center)\b/i;

const EVENT_VENUE_NAME_PATTERN =
  /\b(stadium|arena|ballpark|coliseum|amphitheater|amphitheatre|convention center|convention centre|fairgrounds|racetrack|speedway|concert hall|expo center|expo centre)\b/i;

const NAMED_SPORTS_FIELD_PATTERN =
  /\b(lumen|soldier|lambeau|ford|heinz|empower|wrigley|fenway|coors|progressive|target|kauffman|angel|guaranteed rate|great american)\s+field\b/i;

const NAMED_BALLPARK_PATTERN =
  /\b(t[- ]?mobile|oracle|petco|minute maid|busch|truist|loandepot|nationals|citizens bank|pnc|progressive|fenway|rogers)\s+park\b/i;

const EVENT_TRIP_SIGNAL_PATTERN =
  /\b(game|match|concert|event|tailgate|seahawks|mariners|kraken|raiders|bears|giants|nfl|mlb|nba|nhl|mls|soccer|football|baseball|basketball|hockey)\b/i;

function normalize(value: string | null | undefined): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function destinationHasEventVenueSignal(destination: string): boolean {
  const lower = destination.toLowerCase();
  return (
    KNOWN_EVENT_VENUE_PATTERN.test(lower) ||
    EVENT_VENUE_NAME_PATTERN.test(lower) ||
    NAMED_SPORTS_FIELD_PATTERN.test(lower) ||
    NAMED_BALLPARK_PATTERN.test(lower)
  );
}

export function isEventVenueDestination(input: EventVenueDetectionInput): boolean {
  const destinationKind = String(input.destinationKind || '').trim().toLowerCase();
  if (destinationKind === 'airport' || input.airportCode) return false;
  if (destinationKind === 'stadium' || destinationKind === 'event' || destinationKind === 'arena') {
    return true;
  }

  const destination = normalize(input.destination);
  if (!destination) return false;

  if (destinationHasEventVenueSignal(destination)) return true;

  const combined = `${normalize(input.origin)} ${destination}`.toLowerCase();
  if (!EVENT_TRIP_SIGNAL_PATTERN.test(combined)) return false;

  return (
    destinationHasEventVenueSignal(destination) ||
    KNOWN_EVENT_VENUE_PATTERN.test(combined) ||
    EVENT_VENUE_NAME_PATTERN.test(combined) ||
    NAMED_SPORTS_FIELD_PATTERN.test(combined) ||
    NAMED_BALLPARK_PATTERN.test(combined)
  );
}
