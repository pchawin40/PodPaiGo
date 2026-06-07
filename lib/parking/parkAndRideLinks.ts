export const SOUND_TRANSIT_PARKING_URL =
  'https://www.soundtransit.org/ride-with-us/parking';

export const SOUND_TRANSIT_PARKING_LOCATIONS_URL =
  'https://www.soundtransit.org/ride-with-us/parking/parking-locations';

export const SOUND_TRANSIT_TRIP_PLANNER_URL =
  'https://www.soundtransit.org/tripplanner';

export const SOUND_TRANSIT_MERCER_ISLAND_PARK_RIDE_URL =
  'https://www.soundtransit.org/ride-with-us/parking/parking-locations/mercer-island-park-ride';

const STALE_SOUND_TRANSIT_PARK_AND_RIDE_URL =
  'soundtransit.org/ride-with-us/how-to-ride/park-and-ride';

const LOT_SPECIFIC_RULE_URLS: Record<string, string> = {
  'mercer-island-park-and-ride': SOUND_TRANSIT_MERCER_ISLAND_PARK_RIDE_URL,
};

export function parkAndRideRulesSearchUrl(lotName: string, operator: string): string {
  const query = `${lotName} ${operator} parking rules`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function resolveParkAndRideRulesUrl(input: {
  id?: string | null;
  lotName: string;
  operator: string;
  rulesUrl?: string | null;
}): string {
  const lotSpecific = input.id ? LOT_SPECIFIC_RULE_URLS[input.id] : undefined;
  if (lotSpecific) return lotSpecific;

  const rawUrl = String(input.rulesUrl || '').trim();
  if (rawUrl && !rawUrl.toLowerCase().includes(STALE_SOUND_TRANSIT_PARK_AND_RIDE_URL)) {
    return rawUrl;
  }

  if (/sound transit/i.test(input.operator)) {
    return SOUND_TRANSIT_PARKING_URL;
  }

  return parkAndRideRulesSearchUrl(input.lotName, input.operator);
}

export function parkAndRideRulesLinkLabel(input: {
  id?: string | null;
  operator: string;
  rulesUrl?: string | null;
}): 'Open lot rules' | 'Search lot rules' {
  if (input.id && LOT_SPECIFIC_RULE_URLS[input.id]) return 'Open lot rules';

  const rawUrl = String(input.rulesUrl || '').trim();
  if (rawUrl && !rawUrl.toLowerCase().includes(STALE_SOUND_TRANSIT_PARK_AND_RIDE_URL)) {
    return 'Open lot rules';
  }

  return /sound transit/i.test(input.operator) ? 'Open lot rules' : 'Search lot rules';
}
