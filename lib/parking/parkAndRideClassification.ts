const EXCLUDED_STATION_PATTERNS = ['gas station', 'petrol station', 'fuel stop'];

const PARK_AND_RIDE_TRANSIT_NAME_PATTERNS = [
  'park & ride',
  'park and ride',
  'park-and-ride',
  'park n ride',
  'transit center',
  'transit centre',
  'light rail',
  'link station',
  'station parking',
  'sound transit',
  'northgate transit',
  'narrows park',
];

export function looksLikeParkAndRideTransitName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (!lower) return false;

  if (EXCLUDED_STATION_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return false;
  }

  if (PARK_AND_RIDE_TRANSIT_NAME_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return true;
  }

  if (/\bstation\b/.test(lower)) {
    return true;
  }

  return false;
}
