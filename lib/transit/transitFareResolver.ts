import { TRANSIT_FARE_RULES, type TransitFareRule } from './transitFareRules';

export type TransitFareMatchKind = 'agency' | 'city' | 'unknown';

export type TransitFareResolution = {
  matchKind: TransitFareMatchKind;
  confidence: 'low' | 'medium' | 'high';
  oneWayDollars: number | null;
  agencyName?: string;
  city?: string;
  state?: string;
  fareLabel: string;
  sourceLabel: string;
  sourceUrl?: string;
  ruleId?: string;
};

const WASHINGTON_AIRPORT_CODES = new Set(['SEA', 'PAE']);

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function combineLocationText(parts: Array<string | null | undefined>): string {
  return normalizeText(parts.filter(Boolean).join(' '));
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

function formatFareDollars(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export { formatFareDollars };

function ruleMatchesAgency(rule: TransitFareRule, agencyName: string): boolean {
  const needle = normalizeText(agencyName);
  if (!needle) return false;

  const agency = normalizeText(rule.agencyName);
  if (needle.includes(agency) || agency.includes(needle)) {
    return true;
  }

  return rule.regionKeys.some((key) => needle.includes(normalizeText(key)));
}

function ruleMatchesServiceModes(
  rule: TransitFareRule,
  serviceModes: string[] | undefined,
): boolean {
  if (!serviceModes || serviceModes.length === 0) return true;
  return rule.modes.some((mode) => serviceModes.includes(mode));
}

function ruleMatchesRegion(rule: TransitFareRule, locationText: string): boolean {
  if (!locationText) return false;
  return rule.regionKeys.some((key) => locationText.includes(normalizeText(key)));
}

function buildAgencyFareLabel(rule: TransitFareRule, oneWayDollars: number): string {
  return `${rule.agencyName} local fare: $${formatFareDollars(oneWayDollars)} one-way`;
}

function buildCityFareLabel(rule: TransitFareRule, oneWayDollars: number): string {
  return `${rule.city} transit fare estimate: ~$${formatFareDollars(oneWayDollars)} one-way`;
}

function buildResolutionFromRule(
  rule: TransitFareRule,
  matchKind: Exclude<TransitFareMatchKind, 'unknown'>,
): TransitFareResolution {
  const oneWayDollars = centsToDollars(rule.adultOneWayCents);
  const fareLabel =
    matchKind === 'agency'
      ? buildAgencyFareLabel(rule, oneWayDollars)
      : buildCityFareLabel(rule, oneWayDollars);

  return {
    matchKind,
    confidence: rule.confidence,
    oneWayDollars,
    agencyName: rule.agencyName,
    city: rule.city,
    state: rule.state,
    fareLabel,
    sourceLabel: rule.sourceLabel,
    sourceUrl: rule.sourceUrl,
    ruleId: rule.id,
  };
}

function unknownResolution(): TransitFareResolution {
  return {
    matchKind: 'unknown',
    confidence: 'low',
    oneWayDollars: null,
    fareLabel: 'Check transit fare',
    sourceLabel: 'Fare varies by agency',
  };
}

function resolveWashingtonAirportFare(airportCode: string | null | undefined): TransitFareResolution | null {
  const code = String(airportCode || '').trim().toUpperCase();
  if (!WASHINGTON_AIRPORT_CODES.has(code)) return null;

  const rule =
    TRANSIT_FARE_RULES.find((entry) => entry.id === 'sound-transit-seattle') ||
    TRANSIT_FARE_RULES.find((entry) => entry.id === 'king-county-metro-seattle');

  return rule ? buildResolutionFromRule(rule, 'agency') : null;
}

function resolveByAgencyName(
  agencyName: string | null | undefined,
  serviceModes?: string[],
): TransitFareResolution | null {
  const normalizedAgency = normalizeText(agencyName);
  if (!normalizedAgency) return null;

  const matches = TRANSIT_FARE_RULES.filter((entry) => ruleMatchesAgency(entry, normalizedAgency));
  if (matches.length === 0) return null;

  const rule =
    matches.find((entry) => ruleMatchesServiceModes(entry, serviceModes)) ??
    matches.sort((a, b) => b.adultOneWayCents - a.adultOneWayCents)[0]!;

  return buildResolutionFromRule(rule, 'agency');
}

function resolveByLocationText(
  locationText: string,
  matchKind: 'agency' | 'city',
): TransitFareResolution | null {
  if (!locationText) return null;

  const matches = TRANSIT_FARE_RULES.filter((rule) => ruleMatchesRegion(rule, locationText));
  if (matches.length === 0) return null;

  const rule = matches.sort((a, b) => {
    const aKeyLength = Math.max(...a.regionKeys.map((key) => normalizeText(key).length));
    const bKeyLength = Math.max(...b.regionKeys.map((key) => normalizeText(key).length));
    if (matchKind === 'city') {
      return bKeyLength - aKeyLength || a.adultOneWayCents - b.adultOneWayCents;
    }
    return bKeyLength - aKeyLength || b.adultOneWayCents - a.adultOneWayCents;
  })[0]!;

  return buildResolutionFromRule(rule, matchKind);
}

export function resolveTransitFare(input: {
  destination?: string | null;
  origin?: string | null;
  agencyName?: string | null;
  airportCode?: string | null;
  serviceModes?: string[];
}): TransitFareResolution {
  const agencyMatch = resolveByAgencyName(input.agencyName, input.serviceModes);
  if (agencyMatch) return agencyMatch;

  const airportMatch = resolveWashingtonAirportFare(input.airportCode);
  if (airportMatch) return airportMatch;

  const destinationText = normalizeText(input.destination);
  const originText = normalizeText(input.origin);
  const combinedText = combineLocationText([input.destination, input.origin]);

  const destinationMatch = resolveByLocationText(destinationText, 'city');
  if (destinationMatch) return destinationMatch;

  const combinedMatch = resolveByLocationText(combinedText, 'city');
  if (combinedMatch) return combinedMatch;

  const originMatch = resolveByLocationText(originText, 'city');
  if (originMatch) return originMatch;

  return unknownResolution();
}

export function isKnownTransitFare(resolution: TransitFareResolution | null | undefined): boolean {
  return Boolean(resolution && resolution.matchKind !== 'unknown' && resolution.oneWayDollars != null);
}

export function formatResolvedTransitFarePrimary(
  resolution: TransitFareResolution,
  tripTotal: number | null,
  includesReturnLeg: boolean,
): string {
  if (!isKnownTransitFare(resolution)) {
    return resolution.fareLabel;
  }

  if (includesReturnLeg && tripTotal != null) {
    return `${resolution.fareLabel.replace(/ one-way$/, '')} · $${formatFareDollars(tripTotal)} round-trip est.`;
  }

  return resolution.fareLabel;
}
