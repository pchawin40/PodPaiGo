import { googleMapsDirectionsLink } from '../maps';
import { formatFareDollars, resolveTransitFare } from '../transit/transitFareResolver';
import { PARK_AND_RIDE_UI_COPY } from '../access/parkAndRideAccess';
import {
  getParkRideFacilityById,
  PARK_RIDE_METRO_MARKETS,
  type ParkRideFacility,
  type ParkRideMetroMarket,
} from './parkRideFacilities';
import {
  estimateDriveMinutesFromStraightLineMiles,
  haversineMiles,
} from './routeMinutes';
import type {
  ParkAndRideLotConfidence,
  ParkAndRideLotStatusLabel,
  ParkAndRideOption,
  ParkAndRidePriceConfidence,
  ParkAndRideScheduleConfidence,
  ParkAndRideSelectionInput,
  ParkAndRideSelectionResult,
  ParkAndRideTimingBasis,
  ParkAndRideTransitFareConfidence,
  ParkRideAvailabilityTier,
  ParkRideMetroStatus,
} from './parkAndRideTypes';

export const VERIFY_SIGNS_WARNING =
  'Verify posted signs and lot rules before leaving your car.';

const OVERNIGHT_THRESHOLD_MINUTES = 18 * 60;
const MAX_DRIVE_TO_LOT_MINUTES = 45;
const MAX_TOTAL_TRIP_MINUTES = 120;
const MAX_CORRIDOR_DETOUR_RATIO = 2.2;
/**
 * Park & Ride only models a local transit corridor from the lot/station to the
 * destination. Beyond this straight-line distance there is no real local
 * transit leg, so the estimated transit minutes would be fabricated. This
 * matches the local metro service radius and keeps SEA/airport access (lots are
 * well within this range of the airport) working.
 */
const MAX_TRANSIT_CORRIDOR_MILES = 45;
/**
 * Reference drive time above which a trip is treated as long-distance/intercity
 * for the "suspiciously faster than driving" guard.
 */
const LONG_DISTANCE_REFERENCE_DRIVE_MINUTES = 150;
/**
 * On a long-distance trip, a Park & Ride total that is meaningfully shorter than
 * just driving directly is a sign the transit leg is fabricated/incomplete (no
 * real intercity transit), so it cannot be trusted to reach the destination.
 */
const SUSPICIOUS_PARK_RIDE_SPEEDUP_RATIO = 0.9;

/**
 * Reason used when the destination is outside the lot's local transit corridor,
 * so there is no believable Park & Ride transit leg to the final destination.
 */
export const PARK_RIDE_DESTINATION_UNREACHABLE_REASON =
  'Park & Ride transit does not reach this destination.';

type ResolvedCoords = { lat: number; lng: number } | null;

const KNOWN_DESTINATION_COORDS: Array<{ pattern: RegExp; lat: number; lng: number }> = [
  { pattern: /\b(downtown seattle|pike place|pioneer square|seattle downtown)\b/i, lat: 47.6062, lng: -122.3321 },
  { pattern: /\b(capitol hill)\b/i, lat: 47.6253, lng: -122.3222 },
  { pattern: /\b(university district|udistrict|uw campus)\b/i, lat: 47.6601, lng: -122.3035 },
  { pattern: /\b(seattle center|space needle)\b/i, lat: 47.6205, lng: -122.3493 },
  { pattern: /\b(south lake union|slu)\b/i, lat: 47.6237, lng: -122.3368 },
  { pattern: /\b(bellevue)\b/i, lat: 47.6101, lng: -122.2015 },
  { pattern: /\b(redmond)\b/i, lat: 47.674, lng: -122.1215 },
  { pattern: /\b(lynnwood)\b/i, lat: 47.8209, lng: -122.2931 },
  { pattern: /\b(northgate)\b/i, lat: 47.7025, lng: -122.3274 },
  { pattern: /\b(seatac|sea-tac|sea tac)\b/i, lat: 47.4502, lng: -122.3088 },
  { pattern: /\b(tacoma)\b/i, lat: 47.2529, lng: -122.4443 },
  { pattern: /\b(seattle)\b/i, lat: 47.6062, lng: -122.3321 },
  { pattern: /\b(la quinta.*austin airport|austin bergstrom|austin airport)\b/i, lat: 30.1944, lng: -97.6699 },
  { pattern: /\b(franklin barbecue|franklin bbq|east 11th)\b/i, lat: 30.2702, lng: -97.7314 },
  { pattern: /\b(austin)\b/i, lat: 30.2672, lng: -97.7431 },
  { pattern: /\b(houston)\b/i, lat: 29.7604, lng: -95.3698 },
  { pattern: /\b(downtown houston)\b/i, lat: 29.7604, lng: -95.3698 },
];

export const PARK_RIDE_COPY = {
  dataNotAvailable: 'Park & Ride data not available yet for this metro.',
  foundNotRecommended: 'Park & Ride found, but not recommended for this trip.',
  destinationNotConfirmed: 'Park & Ride not confirmed for this destination.',
  backupAvailable: 'Park & Ride backup available.',
  recommended: 'Park & Ride option.',
  /** @deprecated Use foundNotRecommended */
  noUsefulConnection: 'Park & Ride found, but not recommended for this trip.',
} as const;

function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveCoords(label: string, lat?: number, lng?: number): ResolvedCoords {
  if (typeof lat === 'number' && typeof lng === 'number') {
    return { lat, lng };
  }

  const match = KNOWN_DESTINATION_COORDS.find((entry) => entry.pattern.test(label));
  return match ? { lat: match.lat, lng: match.lng } : null;
}

function isOvernightParkingTrip(durationMinutes: number): boolean {
  return durationMinutes >= OVERNIGHT_THRESHOLD_MINUTES;
}

function formatMoneyRange(min: number, max: number): string {
  if (min === max) return `$${Math.round(min)}`;
  return `$${Math.round(min)}–$${Math.round(max)}`;
}

function mapAgencyToOperator(agencyName: string): ParkAndRideOption['operator'] {
  if (/sound transit/i.test(agencyName)) return 'Sound Transit';
  if (/king county metro/i.test(agencyName)) return 'King County Metro';
  if (/wsdot/i.test(agencyName)) return 'WSDOT';
  if (/capmetro/i.test(agencyName)) return 'CapMetro';
  return 'Other';
}

function facilityTransitServiceModes(facility: ParkRideFacility): string[] {
  return facility.modes.filter((mode) =>
    ['light_rail', 'commuter_rail', 'rail', 'brt'].includes(mode),
  );
}

function resolveLotStatusLabel(args: {
  option: Pick<
    ParkAndRideOption,
    'id' | 'unavailableReason' | 'isRecommended' | 'lotStatusLabel'
  >;
  recommendedId?: string;
}): ParkAndRideLotStatusLabel {
  if (args.option.lotStatusLabel) return args.option.lotStatusLabel;
  if (args.recommendedId && args.option.id === args.recommendedId) return 'Best pick';

  const reason = args.option.unavailableReason || '';
  if (/too far from your origin/i.test(reason)) return 'Too far from origin';
  if (/does not reach this destination/i.test(reason)) return 'No transit to destination';
  if (/too slow for this trip/i.test(reason)) return 'Slow transit connection';
  if (/much longer than driving/i.test(reason)) return 'Long detour';
  if (reason) return 'Not recommended';
  if (args.option.isRecommended) return 'Useful backup';
  return 'Check rules';
}

function unavailableReasonToStatusLabel(reason: string | undefined): ParkAndRideLotStatusLabel {
  if (!reason) return 'Not recommended';
  if (/too far from your origin/i.test(reason)) return 'Too far from origin';
  if (/does not reach this destination/i.test(reason)) return 'No transit to destination';
  if (/too slow for this trip/i.test(reason)) return 'Slow transit connection';
  if (/much longer than driving/i.test(reason)) return 'Long detour';
  return 'Not recommended';
}

function buildTimeDeltaLabel(
  totalTimeMinutes: number,
  directDriveMinutes: number | null,
): string | undefined {
  if (directDriveMinutes == null) return undefined;
  const delta = Math.round(totalTimeMinutes - directDriveMinutes);
  if (delta <= 0) return `${Math.round(totalTimeMinutes)} min total (similar to direct drive)`;
  return `${Math.round(totalTimeMinutes)} min total · +${delta} min vs direct drive`;
}

function buildParkingCostDisplay(facility: ParkRideFacility, parkingRange: { min: number; max: number }): string {
  if (facility.parkingCostExpectation === 'unknown') {
    return 'Usually free/low-cost; verify lot signs.';
  }

  if (facility.parkingCostExpectation === 'free' || (parkingRange.min === 0 && parkingRange.max === 0)) {
    return 'Usually free; verify lot signs.';
  }

  if (parkingRange.min === parkingRange.max) {
    return `$${formatFareDollars(parkingRange.min)} est.`;
  }

  return `$${formatFareDollars(parkingRange.min)}–$${formatFareDollars(parkingRange.max)} est.`;
}

function buildTransitFareDisplay(transitRange: TransitFareRange): string {
  if (transitRange.confidence === 'pass') {
    return '$0 with pass';
  }

  if (transitRange.confidence === 'unknown') {
    return 'Transit fare est.';
  }

  if (transitRange.min === transitRange.max) {
    return `$${formatFareDollars(transitRange.min)} one-way adult est.`;
  }

  return `$${formatFareDollars(transitRange.min)}–$${formatFareDollars(transitRange.max)} one-way adult est.`;
}

function resolveAvailabilityTier(args: {
  metroStatus: ParkRideMetroStatus;
  best: ParkAndRideOption | null;
  candidates: ParkAndRideOption[];
}): ParkRideAvailabilityTier {
  if (args.metroStatus === 'data_not_available') return 'data_not_available';
  if (!args.best) {
    return args.candidates.length > 0 ? 'not_recommended' : 'data_not_available';
  }
  if (args.best.isRecommended) return 'recommended';
  return 'backup_available';
}

function cardHeadlineForTier(tier: ParkRideAvailabilityTier): string {
  switch (tier) {
    case 'data_not_available':
      return PARK_RIDE_COPY.dataNotAvailable;
    case 'not_recommended':
      return PARK_RIDE_COPY.foundNotRecommended;
    case 'backup_available':
      return PARK_RIDE_COPY.backupAvailable;
    case 'recommended':
      return PARK_RIDE_COPY.recommended;
  }
}

function finalizeSelectionResult(
  partial: Omit<ParkAndRideSelectionResult, 'availabilityTier' | 'cardHeadline'>,
): ParkAndRideSelectionResult {
  const availabilityTier = resolveAvailabilityTier({
    metroStatus: partial.metroStatus,
    best: partial.best,
    candidates: partial.candidates,
  });

  const cardHeadline =
    availabilityTier === 'not_recommended' &&
    partial.notUsefulReason === PARK_RIDE_COPY.destinationNotConfirmed
      ? PARK_RIDE_COPY.destinationNotConfirmed
      : cardHeadlineForTier(availabilityTier);

  return {
    ...partial,
    availabilityTier,
    cardHeadline,
  };
}

export { resolveLotStatusLabel };

function parkingCostRange(expectation: ParkRideFacility['parkingCostExpectation']): {
  min: number;
  max: number;
} {
  switch (expectation) {
    case 'free':
      return { min: 0, max: 0 };
    case 'permit':
      return { min: 0, max: 3 };
    case 'paid':
      return { min: 0, max: 5 };
    default:
      return { min: 0, max: 8 };
  }
}

function estimateTransitMinutes(
  facility: ParkRideFacility,
  destinationCoords: ResolvedCoords,
): number {
  if (!destinationCoords) {
    return facility.modes.includes('light_rail') || facility.modes.includes('commuter_rail')
      ? 28
      : 22;
  }

  const miles = haversineMiles(
    facility.lat,
    facility.lng,
    destinationCoords.lat,
    destinationCoords.lng,
  );
  const modeFactor =
    facility.modes.includes('light_rail') || facility.modes.includes('commuter_rail') ? 2.2 : 2.6;

  return Math.max(12, Math.min(55, Math.round(miles * modeFactor + 8)));
}

function estimateWalkMinutes(facility: ParkRideFacility): number {
  if (facility.modes.includes('light_rail') || facility.modes.includes('commuter_rail')) return 5;
  return 4;
}

function estimateWaitMinutes(facility: ParkRideFacility): number {
  if (facility.modes.includes('light_rail')) return 6;
  if (facility.modes.includes('commuter_rail')) return 8;
  return 10;
}

function overnightAllowedValue(value: ParkRideFacility['overnightAllowed']): boolean {
  return value === true;
}

function durationFitPenalty(
  facility: ParkRideFacility,
  parkingDurationMinutes: number,
  isOvernight: boolean,
): { penalty: number; unavailableReason?: string } {
  if (isOvernight && !overnightAllowedValue(facility.overnightAllowed)) {
    return {
      penalty: 120,
      unavailableReason: PARK_AND_RIDE_UI_COPY.notRecommendedOvernight,
    };
  }

  if (facility.parkingCostExpectation === 'unknown') {
    return { penalty: 20 };
  }

  return { penalty: 0 };
}

function estimateDirectDriveMinutes(
  origin: ResolvedCoords,
  destination: ResolvedCoords,
): number | null {
  if (!origin || !destination) return null;
  const miles = haversineMiles(origin.lat, origin.lng, destination.lat, destination.lng);
  return estimateDriveMinutesFromStraightLineMiles(miles);
}

type TransitFareRange = {
  min: number;
  max: number;
  confidence: ParkAndRideTransitFareConfidence;
};

function transitFareRange(
  facility: ParkRideFacility,
  transitPayment: ParkAndRideSelectionInput['transitPayment'],
): TransitFareRange {
  if (transitPayment === 'orca-pass') {
    return { min: 0, max: 0, confidence: 'pass' };
  }

  const serviceModes = facilityTransitServiceModes(facility);
  const fare = resolveTransitFare({
    destination: `${facility.city}, ${facility.state}`,
    agencyName: facility.agencyName,
    serviceModes: serviceModes.length > 0 ? serviceModes : ['bus'],
  });

  if (fare.oneWayDollars == null) {
    return { min: 3, max: 6, confidence: 'unknown' };
  }

  const oneWay = fare.oneWayDollars;
  return {
    min: oneWay,
    max: oneWay,
    confidence: fare.confidence === 'low' ? 'estimated' : 'known',
  };
}

function parkingPriceConfidence(facility: ParkRideFacility): ParkAndRidePriceConfidence {
  return facility.parkingCostExpectation === 'unknown' ? 'unknown' : 'estimated';
}

function formatArrivalTimeLabel(time: string | undefined): string | null {
  const match = String(time || '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;

  const hour24 = Number(match[1]);
  const minute = match[2];
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function resolveTimingBasis(input: {
  arrivalDate?: string;
  arrivalTime?: string;
}): {
  timingBasis: ParkAndRideTimingBasis;
  timingBasisLabel: string;
  scheduleConfidence: ParkAndRideScheduleConfidence;
  scheduleConfidenceLabel: string;
} {
  const timeLabel = formatArrivalTimeLabel(input.arrivalTime);

  if (timeLabel) {
    return {
      timingBasis: 'selected_arrival_estimate',
      timingBasisLabel: `Timed for arrival around ${timeLabel}`,
      scheduleConfidence: 'unconfirmed',
      scheduleConfidenceLabel: 'Schedule not confirmed — compare route.',
    };
  }

  if (input.arrivalDate) {
    return {
      timingBasis: 'selected_trip_estimate',
      timingBasisLabel: 'Estimated for your selected trip time',
      scheduleConfidence: 'unconfirmed',
      scheduleConfidenceLabel: 'Schedule not confirmed — compare route.',
    };
  }

  return {
    timingBasis: 'schedule_unconfirmed',
    timingBasisLabel: 'Schedule not confirmed — compare route.',
    scheduleConfidence: 'unconfirmed',
    scheduleConfidenceLabel: 'Schedule not confirmed — compare route.',
  };
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, list) => list.indexOf(value) === index);
}

function ensureSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function shouldShowFacilityTimeLimit(timeLimit: string | undefined): boolean {
  return Boolean(timeLimit && !/overnight rules vary by lot/i.test(timeLimit));
}

function buildWarnings(facility: ParkRideFacility): string[] {
  return uniqueStrings(
    [
      shouldShowFacilityTimeLimit(facility.timeLimit) ? ensureSentence(facility.timeLimit!) : null,
      facility.parkingCostExpectation === 'permit' ? 'Permit or validation may apply.' : null,
      facility.overnightAllowed === true ? null : 'Verify overnight rules.',
      VERIFY_SIGNS_WARNING,
    ].filter(Boolean) as string[],
  );
}

function scoreFacilityCandidate(args: {
  facility: ParkRideFacility;
  market: ParkRideMetroMarket;
  origin: string;
  destination: string;
  originCoords: ResolvedCoords;
  destinationCoords: ResolvedCoords;
  parkingDurationMinutes: number;
  isAirportTrip: boolean;
  isOvernight: boolean;
  sort: ParkAndRideSelectionInput['sort'];
  parkingTotal?: number | null;
  weatherRisk?: 'low' | 'medium' | 'high';
  arrivalDate?: string;
  arrivalTime?: string;
  transitPayment?: ParkAndRideSelectionInput['transitPayment'];
}): ParkAndRideOption {
  const {
    facility,
    origin,
    destination,
    originCoords,
    destinationCoords,
    parkingDurationMinutes,
    isAirportTrip,
    isOvernight,
    sort,
    parkingTotal,
    weatherRisk,
    arrivalDate,
    arrivalTime,
    transitPayment,
  } = args;

  const driveMiles =
    originCoords != null
      ? haversineMiles(originCoords.lat, originCoords.lng, facility.lat, facility.lng)
      : null;
  const driveToLotMinutes =
    driveMiles != null ? estimateDriveMinutesFromStraightLineMiles(driveMiles) : 30;

  const transitMinutes = estimateTransitMinutes(facility, destinationCoords);
  const walkMinutes = estimateWalkMinutes(facility);
  const waitMinutes = estimateWaitMinutes(facility);
  const totalTimeMinutes = driveToLotMinutes + transitMinutes + walkMinutes + waitMinutes;

  const durationFit = durationFitPenalty(facility, parkingDurationMinutes, isOvernight);
  const directDriveMinutes = estimateDirectDriveMinutes(originCoords, destinationCoords);

  // Validate that the lot's transit leg can actually reach the destination.
  // Park & Ride only models a local transit corridor; if the destination is far
  // outside that corridor (e.g. an intercity WA -> Bend, OR trip), the estimated
  // transit minutes are fabricated and the lot cannot reach the destination.
  const transitCorridorMiles =
    destinationCoords != null
      ? haversineMiles(facility.lat, facility.lng, destinationCoords.lat, destinationCoords.lng)
      : null;
  const destinationOutsideTransitCorridor =
    transitCorridorMiles != null && transitCorridorMiles > MAX_TRANSIT_CORRIDOR_MILES;
  // On a long-distance trip, a Park & Ride total shorter than driving directly
  // is impossible without a real intercity transit schedule, so treat the legs
  // as fabricated/unreachable.
  const suspiciouslyFasterThanDrive =
    directDriveMinutes != null &&
    directDriveMinutes >= LONG_DISTANCE_REFERENCE_DRIVE_MINUTES &&
    totalTimeMinutes < directDriveMinutes * SUSPICIOUS_PARK_RIDE_SPEEDUP_RATIO;

  let unavailableReason = durationFit.unavailableReason;
  let isRecommended = true;
  let lotStatusLabel: ParkAndRideLotStatusLabel = 'Useful backup';

  if (destinationOutsideTransitCorridor || suspiciouslyFasterThanDrive) {
    // Destination reachability is checked first: if no local transit leg can
    // reach the destination, the lot is invalid regardless of how close it is
    // to the origin. This keeps every candidate's reason consistent so an
    // intercity trip reports a single "not confirmed for this destination".
    isRecommended = false;
    unavailableReason = PARK_RIDE_DESTINATION_UNREACHABLE_REASON;
    lotStatusLabel = 'No transit to destination';
  } else if (driveToLotMinutes > MAX_DRIVE_TO_LOT_MINUTES) {
    isRecommended = false;
    unavailableReason = 'Park & Ride lot is too far from your origin.';
    lotStatusLabel = 'Too far from origin';
  } else if (isAirportTrip && isOvernight && !overnightAllowedValue(facility.overnightAllowed)) {
    isRecommended = false;
    unavailableReason = PARK_AND_RIDE_UI_COPY.notRecommendedOvernight;
    lotStatusLabel = 'Not recommended';
  } else {
    if (totalTimeMinutes > MAX_TOTAL_TRIP_MINUTES) {
      isRecommended = false;
      lotStatusLabel = 'Slow transit connection';
    } else if (
      directDriveMinutes != null &&
      totalTimeMinutes > directDriveMinutes * MAX_CORRIDOR_DETOUR_RATIO
    ) {
      isRecommended = false;
      lotStatusLabel = 'Long detour';
    } else if (durationFit.penalty >= 40) {
      isRecommended = false;
      lotStatusLabel = 'Not recommended';
    }
  }

  const hardBlocked = Boolean(unavailableReason);

  const parkingRange = parkingCostRange(facility.parkingCostExpectation);
  const transitRange = transitFareRange(facility, transitPayment);
  const costMin = parkingRange.min + transitRange.min;
  const costMax = parkingRange.max + transitRange.max;
  const parkingDisplay = buildParkingCostDisplay(facility, parkingRange);
  const transitFareDisplay = buildTransitFareDisplay(transitRange);
  const timeDeltaLabel = buildTimeDeltaLabel(totalTimeMinutes, directDriveMinutes);
  const timingBasis = resolveTimingBasis({ arrivalDate, arrivalTime });
  const priceConfidence = parkingPriceConfidence(facility);

  let score = totalTimeMinutes;
  if (driveMiles != null) score += driveMiles * 4;
  score += durationFit.penalty;
  if (facility.confidence === 'low') score += 20;
  if (facility.confidence === 'medium') score += 8;
  if (weatherRisk === 'high') score += 18;
  else if (weatherRisk === 'medium') score += 8;

  if (sort === 'cheapest') {
    score += ((costMin + costMax) / 2) * 2.5;
    if (parkingTotal != null && costMin < parkingTotal) score -= 12;
  } else if (sort === 'fastest') {
    score += totalTimeMinutes * 0.35;
  }

  if (hardBlocked) score += 500;
  else if (!isRecommended) score += 80;

  const address = facility.address || `${facility.name}, ${facility.city}, ${facility.state}`;
  const directionsToLotUrl = googleMapsDirectionsLink(origin, address, 'driving');
  const transitRouteUrl = googleMapsDirectionsLink(address, destination, 'transit');
  const rulesUrl = facility.sourceUrl || directionsToLotUrl;

  const warnings = buildWarnings(facility);

  const selectionReason = !hardBlocked
    ? `Drive ${driveToLotMinutes} min · transit ${transitMinutes} min · ${timeDeltaLabel || `total ${totalTimeMinutes} min`}.`
    : unavailableReason;

  return {
    id: facility.id,
    lotName: facility.name,
    address,
    lat: facility.lat,
    lng: facility.lng,
    operator: mapAgencyToOperator(facility.agencyName),
    agencyName: facility.agencyName,
    capacity: undefined,
    routesServed: facility.servedRoutes ?? [],
    maxParkingDuration: facility.timeLimit,
    rulesUrl,
    sourceUrl: facility.sourceUrl,
    directionsToLotUrl,
    transitRouteUrl,
    totalTimeMinutes,
    driveToLotMinutes,
    transitMinutes,
    walkMinutes,
    waitMinutes,
    costEstimate: {
      min: costMin,
      max: costMax,
      display: transitFareDisplay,
      parkingDisplay,
      transitFareDisplay,
      parkingMin: parkingRange.min,
      parkingMax: parkingRange.max,
      transitFareMin: transitRange.min,
      transitFareMax: transitRange.max,
      parkingPriceConfidence: priceConfidence,
      transitFareConfidence: transitRange.confidence,
    },
    confidence: facility.confidence as ParkAndRideLotConfidence,
    ruleConfidence: facility.parkingCostExpectation === 'unknown' ? 'unknown' : 'estimated',
    overnightAllowed: overnightAllowedValue(facility.overnightAllowed),
    parkingPriceConfidence: priceConfidence,
    transitFareConfidence: transitRange.confidence,
    ...timingBasis,
    warnings,
    isRecommended: isRecommended && !hardBlocked,
    unavailableReason: hardBlocked ? unavailableReason : undefined,
    selectionReason,
    selectionScore: score,
    lotStatusLabel,
    timeDeltaLabel,
    metroId: args.market.id,
    metroName: args.market.name,
    tripPlannerUrl: args.market.tripPlannerUrl,
  };
}

export function detectParkRideMetro(input: {
  origin?: string | null;
  destination?: string | null;
  originLat?: number;
  originLng?: number;
  destinationLat?: number;
  destinationLng?: number;
}): ParkRideMetroMarket | null {
  const originText = normalizeText(input.origin);
  const destinationText = normalizeText(input.destination);
  const combinedText = `${originText} ${destinationText}`.trim();

  const textMatches = PARK_RIDE_METRO_MARKETS.map((market) => {
    const keyHits = market.regionKeys.filter((key) => combinedText.includes(normalizeText(key))).length;
    return { market, keyHits };
  })
    .filter((entry) => entry.keyHits > 0)
    .sort((a, b) => b.keyHits - a.keyHits);

  if (textMatches[0]) {
    return textMatches[0].market;
  }

  const originCoords = resolveCoords(input.origin || '', input.originLat, input.originLng);
  const destinationCoords = resolveCoords(
    input.destination || '',
    input.destinationLat,
    input.destinationLng,
  );

  const coordMatches = PARK_RIDE_METRO_MARKETS.map((market) => {
    const originMiles =
      originCoords != null
        ? haversineMiles(originCoords.lat, originCoords.lng, market.centerLat, market.centerLng)
        : null;
    const destinationMiles =
      destinationCoords != null
        ? haversineMiles(
            destinationCoords.lat,
            destinationCoords.lng,
            market.centerLat,
            market.centerLng,
          )
        : null;

    const nearest =
      originMiles != null && destinationMiles != null
        ? Math.min(originMiles, destinationMiles)
        : originMiles ?? destinationMiles;

    return { market, nearest };
  })
    .filter((entry) => entry.nearest != null && entry.nearest <= entry.market.radiusMiles)
    .sort((a, b) => (a.nearest ?? 999) - (b.nearest ?? 999));

  return coordMatches[0]?.market ?? null;
}

export function resolveParkAndRideForTrip(
  input: ParkAndRideSelectionInput,
): ParkAndRideSelectionResult {
  const originCoords = resolveCoords(input.origin, input.originLat, input.originLng);
  const destinationCoords = resolveCoords(
    input.destination,
    input.destinationLat,
    input.destinationLng,
  );
  const isOvernight = isOvernightParkingTrip(input.parkingDurationMinutes);

  if (input.isAirportTrip && isOvernight) {
    return finalizeSelectionResult({
      best: null,
      candidates: [],
      metroStatus: 'no_useful_connection',
      notUsefulReason: PARK_AND_RIDE_UI_COPY.notRecommendedOvernight,
    });
  }

  const metro = detectParkRideMetro(input);
  if (!metro || metro.facilities.length === 0) {
    return finalizeSelectionResult({
      best: null,
      candidates: [],
      metroStatus: 'data_not_available',
      notUsefulReason: PARK_RIDE_COPY.dataNotAvailable,
    });
  }

  const candidates = metro.facilities
    .map((facility) =>
      scoreFacilityCandidate({
        facility,
        market: metro,
        origin: input.origin,
        destination: input.destination,
        originCoords,
        destinationCoords,
        parkingDurationMinutes: input.parkingDurationMinutes,
        isAirportTrip: input.isAirportTrip,
        isOvernight,
        sort: input.sort,
        parkingTotal: input.parkingTotal,
        weatherRisk: input.weatherRisk,
        arrivalDate: input.arrivalDate,
        arrivalTime: input.arrivalTime,
        transitPayment: input.transitPayment,
      }),
    )
    .sort((a, b) => (a.selectionScore ?? 9999) - (b.selectionScore ?? 9999));

  const viableCandidates = candidates.filter((candidate) => candidate.isRecommended);
  const best =
    viableCandidates[0] ?? candidates.find((candidate) => !candidate.unavailableReason) ?? null;

  if (!best) {
    // When no lot can reach the destination by transit (e.g. an intercity trip
    // where local stations cannot serve the final destination), use the
    // destination-not-confirmed copy instead of the generic not-recommended copy.
    const allCandidatesUnreachable =
      candidates.length > 0 &&
      candidates.every(
        (candidate) =>
          candidate.unavailableReason === PARK_RIDE_DESTINATION_UNREACHABLE_REASON,
      );

    return finalizeSelectionResult({
      best: null,
      candidates,
      metroStatus: 'no_useful_connection',
      metroId: metro.id,
      metroName: metro.name,
      tripPlannerUrl: metro.tripPlannerUrl,
      notUsefulReason: allCandidatesUnreachable
        ? PARK_RIDE_COPY.destinationNotConfirmed
        : PARK_RIDE_COPY.foundNotRecommended,
    });
  }

  return finalizeSelectionResult({
    best,
    candidates,
    metroStatus: 'connected',
    metroId: metro.id,
    metroName: metro.name,
    tripPlannerUrl: metro.tripPlannerUrl,
  });
}

export function getParkRideFacilityForOption(option: ParkAndRideOption | null | undefined) {
  return option?.id ? getParkRideFacilityById(option.id) : undefined;
}
