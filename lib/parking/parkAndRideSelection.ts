import { googleMapsDirectionsLink } from '../maps';
import { PARK_AND_RIDE_UI_COPY } from '../access/parkAndRideAccess';
import { buildParkAndRideDetailsPanel } from './parkAndRideDetails';
import {
  getSeattleRegionParkAndRideLots,
  VERIFY_SIGNS_WARNING,
  type CuratedParkAndRideLotSeed,
} from './parkAndRideProvider';
import type {
  ParkAndRideOption,
  ParkAndRideSelectionInput,
  ParkAndRideSelectionResult,
  PointAbParkRidePresentation,
} from './parkAndRideTypes';
import {
  estimateDriveMinutesFromStraightLineMiles,
  haversineMiles,
} from './routeMinutes';

const OVERNIGHT_THRESHOLD_MINUTES = 18 * 60;
const MAX_DRIVE_TO_LOT_MINUTES = 45;
const MAX_TOTAL_TRIP_MINUTES = 120;
const SOUND_TRANSIT_PLANNER_URL = 'https://www.soundtransit.org/';

type ResolvedCoords = { lat: number; lng: number } | null;

const KNOWN_DESTINATION_COORDS: Array<{ pattern: RegExp; lat: number; lng: number }> = [
  { pattern: /\b(downtown seattle|pike place|pioneer square|seattle downtown)\b/i, lat: 47.6062, lng: -122.3321 },
  { pattern: /\b(capitol hill)\b/i, lat: 47.6253, lng: -122.3222 },
  { pattern: /\b(university district|udistrict|uw campus)\b/i, lat: 47.6601, lng: -122.3035 },
  { pattern: /\b(seattle center|space needle)\b/i, lat: 47.6205, lng: -122.3493 },
  { pattern: /\b(south lake union|slu)\b/i, lat: 47.6237, lng: -122.3368 },
  { pattern: /\b(bellevue)\b/i, lat: 47.6101, lng: -122.2015 },
  { pattern: /\b(redmond)\b/i, lat: 47.6740, lng: -122.1215 },
  { pattern: /\b(lynnwood)\b/i, lat: 47.8209, lng: -122.2931 },
  { pattern: /\b(northgate)\b/i, lat: 47.7025, lng: -122.3274 },
  { pattern: /\b(seatac|sea-tac|airport)\b/i, lat: 47.4502, lng: -122.3088 },
  { pattern: /\b(tacoma)\b/i, lat: 47.2529, lng: -122.4443 },
  { pattern: /\b(seattle)\b/i, lat: 47.6062, lng: -122.3321 },
];

function resolveCoords(
  label: string,
  lat?: number,
  lng?: number,
): ResolvedCoords {
  if (typeof lat === 'number' && typeof lng === 'number') {
    return { lat, lng };
  }

  const match = KNOWN_DESTINATION_COORDS.find((entry) => entry.pattern.test(label));
  return match ? { lat: match.lat, lng: match.lng } : null;
}

function isOvernightParkingTrip(durationMinutes: number, isAirportTrip: boolean): boolean {
  if (isAirportTrip) {
    return durationMinutes >= OVERNIGHT_THRESHOLD_MINUTES;
  }

  return durationMinutes >= OVERNIGHT_THRESHOLD_MINUTES;
}

function formatMoneyRange(min: number, max: number): string {
  if (min === max) return `$${Math.round(min)}`;
  return `$${Math.round(min)}–$${Math.round(max)}`;
}

function confidenceScoreFromLot(confidence: ParkAndRideOption['confidence']): number {
  if (confidence === 'high') return 72;
  if (confidence === 'medium') return 55;
  return 40;
}

function routeServesDestination(seed: CuratedParkAndRideLotSeed, destination: string): boolean {
  return seed.servesDestinations.some((pattern) => pattern.test(destination));
}

function estimateDirectDriveMinutes(
  origin: ResolvedCoords,
  destination: ResolvedCoords,
): number | null {
  if (!origin || !destination) return null;
  const miles = haversineMiles(origin.lat, origin.lng, destination.lat, destination.lng);
  return estimateDriveMinutesFromStraightLineMiles(miles);
}

function durationFitPenalty(
  seed: CuratedParkAndRideLotSeed,
  parkingDurationMinutes: number,
  isOvernight: boolean,
): { penalty: number; unavailableReason?: string } {
  if (isOvernight && !seed.overnightAllowed) {
    return {
      penalty: 120,
      unavailableReason: PARK_AND_RIDE_UI_COPY.notRecommendedOvernight,
    };
  }

  if (seed.maxParkingHours && parkingDurationMinutes > seed.maxParkingHours * 60) {
    return {
      penalty: 80,
      unavailableReason: `Trip parking duration exceeds typical ${seed.maxParkingHours}h limit for this lot.`,
    };
  }

  if (seed.ruleConfidence === 'unknown') {
    return { penalty: 35 };
  }

  return { penalty: 0 };
}

function scoreLotCandidate(args: {
  seed: CuratedParkAndRideLotSeed;
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
}): ParkAndRideOption | null {
  const {
    seed,
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
  } = args;

  if (!routeServesDestination(seed, destination)) {
    return null;
  }

  const driveMiles =
    originCoords != null
      ? haversineMiles(originCoords.lat, originCoords.lng, seed.lat, seed.lng)
      : null;
  const driveToLotMinutes =
    driveMiles != null ? estimateDriveMinutesFromStraightLineMiles(driveMiles) : 30;

  const destinationMiles =
    destinationCoords != null
      ? haversineMiles(seed.lat, seed.lng, destinationCoords.lat, destinationCoords.lng)
      : null;
  const destinationTransitMinutes =
    destinationMiles != null
      ? Math.max(seed.baseTransitMinutes, estimateDriveMinutesFromStraightLineMiles(destinationMiles) * 1.4)
      : seed.baseTransitMinutes;

  const walkMinutes = seed.baseWalkMinutes;
  const waitMinutes = seed.baseWaitMinutes;
  const totalTimeMinutes = driveToLotMinutes + destinationTransitMinutes + walkMinutes + waitMinutes;

  const durationFit = durationFitPenalty(seed, parkingDurationMinutes, isOvernight);
  const directDriveMinutes = estimateDirectDriveMinutes(originCoords, destinationCoords);

  let unavailableReason = durationFit.unavailableReason;
  let viable = true;

  if (driveToLotMinutes > MAX_DRIVE_TO_LOT_MINUTES) {
    viable = false;
    unavailableReason = 'Park & Ride lot is too far from your origin.';
  } else if (totalTimeMinutes > MAX_TOTAL_TRIP_MINUTES) {
    viable = false;
    unavailableReason = 'Park & Ride route is too slow for this trip.';
  } else if (directDriveMinutes != null && totalTimeMinutes > directDriveMinutes * 2.2) {
    viable = false;
    unavailableReason = 'Transit connection would take much longer than driving.';
  } else if (isAirportTrip && isOvernight && !seed.overnightAllowed) {
    viable = false;
    unavailableReason = PARK_AND_RIDE_UI_COPY.notRecommendedOvernight;
  }

  const costMin = seed.parkingCostMin + seed.transitFareMin;
  const costMax = seed.parkingCostMax + seed.transitFareMax;

  let score = totalTimeMinutes;

  if (driveMiles != null) {
    score += driveMiles * 4;
  }

  score += durationFit.penalty;
  if (seed.ruleConfidence === 'unknown') score += 25;
  if (seed.ruleConfidence === 'estimated') score += 8;
  if (weatherRisk === 'high') score += 18;
  else if (weatherRisk === 'medium') score += 8;

  if (sort === 'cheapest') {
    score += (costMin + costMax) / 2 * 2.5;
    if (parkingTotal != null && costMin < parkingTotal) score -= 12;
  } else if (sort === 'fastest') {
    score += totalTimeMinutes * 0.35;
  }

  if (!viable) {
    score += 500;
  }

  const directionsToLotUrl = googleMapsDirectionsLink(origin, seed.address, 'driving');
  const transitRouteUrl = googleMapsDirectionsLink(seed.address, destination, 'transit');

  const warnings = [...seed.warnings, VERIFY_SIGNS_WARNING];
  const selectionReason = viable
    ? `Reasonable drive (${driveToLotMinutes} min) plus transit (${destinationTransitMinutes} min) toward ${destination}.`
    : undefined;

  return {
    id: seed.id,
    lotName: seed.lotName,
    address: seed.address,
    lat: seed.lat,
    lng: seed.lng,
    operator: seed.operator,
    capacity: seed.capacity,
    routesServed: seed.routesServed,
    maxParkingDuration: seed.maxParkingDuration,
    permitInfo: seed.permitInfo,
    rulesUrl: seed.rulesUrl,
    sourceUrl: seed.sourceUrl,
    directionsToLotUrl,
    transitRouteUrl,
    totalTimeMinutes,
    driveToLotMinutes,
    transitMinutes: destinationTransitMinutes,
    walkMinutes,
    waitMinutes,
    costEstimate: {
      min: costMin,
      max: costMax,
      display: `Estimated ${formatMoneyRange(costMin, costMax)} total`,
    },
    confidence: seed.confidence,
    ruleConfidence: seed.ruleConfidence,
    overnightAllowed: seed.overnightAllowed,
    warnings,
    isRecommended: viable && durationFit.penalty < 40,
    unavailableReason: viable ? undefined : unavailableReason,
    selectionReason,
    selectionScore: score,
  };
}

export function selectBestParkAndRideForPointAb(
  input: ParkAndRideSelectionInput,
): ParkAndRideSelectionResult {
  const originCoords = resolveCoords(input.origin, input.originLat, input.originLng);
  const destinationCoords = resolveCoords(
    input.destination,
    input.destinationLat,
    input.destinationLng,
  );
  const isOvernight = isOvernightParkingTrip(input.parkingDurationMinutes, input.isAirportTrip);

  if (input.isAirportTrip && isOvernight) {
    return {
      best: null,
      candidates: [],
      notUsefulReason: PARK_AND_RIDE_UI_COPY.notRecommendedOvernight,
    };
  }

  const seeds = getSeattleRegionParkAndRideLots();
  const candidates = seeds
    .map((seed) =>
      scoreLotCandidate({
        seed,
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
      }),
    )
    .filter((candidate): candidate is ParkAndRideOption => candidate != null)
    .sort((a, b) => (a.selectionScore ?? 9999) - (b.selectionScore ?? 9999));

  const viableCandidates = candidates.filter((candidate) => candidate.isRecommended);
  const best = viableCandidates[0] ?? candidates.find((candidate) => !candidate.unavailableReason) ?? null;

  if (!best) {
    return {
      best: null,
      candidates,
      notUsefulReason:
        candidates[0]?.unavailableReason ||
        'Not useful for this trip — no Park & Ride lot with a useful transit connection was found.',
    };
  }

  return { best, candidates };
}

export function toPointAbParkRidePresentation(
  selection: ParkAndRideSelectionResult,
): PointAbParkRidePresentation | null {
  const option = selection.best;
  if (!option) {
    return {
      lotName: 'Not useful for this trip',
      displayName: selection.notUsefulReason || 'Not useful for this trip',
      costDisplay: 'Not estimated',
      cost: null,
      durationMinutes: null,
      reliable: false,
      confidenceScore: 30,
      recommended: false,
      unavailableReason: selection.notUsefulReason,
      pros: [],
      cons: [selection.notUsefulReason || 'No viable Park & Ride route for this trip.'],
      warnings: [VERIFY_SIGNS_WARNING],
      rulesUrl: 'https://www.soundtransit.org/ride-with-us/how-to-ride/park-and-ride',
      details: {
        lotName: 'Park & Ride unavailable',
        operator: '—',
        address: '—',
        rulesUrl: 'https://www.soundtransit.org/ride-with-us/how-to-ride/park-and-ride',
        routesServed: [],
        parkingRuleSummary: 'Verify posted signs and lot rules.',
        verifySignsWarning: VERIFY_SIGNS_WARNING,
        routeBreakdown: {
          driveMinutes: null,
          transitMinutes: null,
          walkMinutes: null,
          waitMinutes: null,
          totalMinutes: null,
        },
        unavailableReason: selection.notUsefulReason,
        warnings: [VERIFY_SIGNS_WARNING],
        sections: [
          {
            title: 'Why unavailable',
            lines: [selection.notUsefulReason || 'No viable Park & Ride route for this trip.'],
          },
        ],
      },
    };
  }

  const seed = getSeattleRegionParkAndRideLots().find((lot) => lot.id === option.id);
  const details = buildParkAndRideDetailsPanel(option, seed);

  return {
    lotName: option.lotName,
    displayName: option.lotName,
    costDisplay: option.costEstimate?.display || 'Estimated total',
    cost:
      option.costEstimate != null
        ? (option.costEstimate.min + option.costEstimate.max) / 2
        : null,
    durationMinutes: option.totalTimeMinutes ?? null,
    reliable: option.isRecommended,
    confidenceScore: confidenceScoreFromLot(option.confidence),
    recommended: option.isRecommended,
    unavailableReason: option.unavailableReason,
    pros: ['Lower parking cost than downtown garages', 'Useful when destination parking is expensive'],
    cons: [...option.warnings, VERIFY_SIGNS_WARNING],
    warnings: option.warnings,
    rulesUrl: option.rulesUrl,
    directionsToLotUrl: option.directionsToLotUrl,
    transitRouteUrl: option.transitRouteUrl,
    transitPlannerUrl: SOUND_TRANSIT_PLANNER_URL,
    details,
  };
}
