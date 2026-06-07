export type CuratedLocalParkingZone = {
  id: string;
  matchPattern: RegExp;
  headline: string;
  detail: string;
  streetParkingAllowed: boolean;
  maxStreetHours?: number;
};

export const CURATED_LOCAL_PARKING_ZONES: CuratedLocalParkingZone[] = [
  {
    id: 'monroe-downtown',
    matchPattern: /\bmonroe\b.*\b(downtown|main st|main street)\b|\bdowntown monroe\b/i,
    headline: 'Monroe downtown street parking',
    detail: '4-hour limit may apply downtown. Check posted signs for time limits and overnight rules.',
    streetParkingAllowed: true,
    maxStreetHours: 4,
  },
  {
    id: 'monroe-general',
    matchPattern: /\bmonroe\b/i,
    headline: 'Monroe parking',
    detail: 'Downtown Monroe often has timed street parking. Verify signs before leaving your car.',
    streetParkingAllowed: true,
    maxStreetHours: 4,
  },
];

export function matchCuratedLocalParkingZone(
  destination: string | null | undefined,
): CuratedLocalParkingZone | null {
  const text = String(destination || '').trim();
  if (!text) return null;

  return CURATED_LOCAL_PARKING_ZONES.find((zone) => zone.matchPattern.test(text)) ?? null;
}
