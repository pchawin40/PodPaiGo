import {
  buildParkAndRideDetailsPanel,
  buildParkAndRideLotCards,
} from './parkAndRideDetails';
import { SOUND_TRANSIT_PARKING_URL, SOUND_TRANSIT_TRIP_PLANNER_URL } from './parkAndRideLinks';
import {
  getParkRideFacilityForOption,
  PARK_RIDE_COPY,
  resolveParkAndRideForTrip,
  VERIFY_SIGNS_WARNING,
} from './parkRideResolver';
import type {
  ParkAndRideSelectionInput,
  ParkAndRideSelectionResult,
  ParkRideAvailabilityTier,
  PointAbParkRidePresentation,
} from './parkAndRideTypes';

export { VERIFY_SIGNS_WARNING } from './parkRideResolver';

function confidenceScoreFromLot(confidence: 'high' | 'medium' | 'low'): number {
  if (confidence === 'high') return 72;
  if (confidence === 'medium') return 55;
  return 40;
}

function confidenceScoreFromOption(option: NonNullable<ParkAndRideSelectionResult['best']>): number {
  const baseScore = confidenceScoreFromLot(option.confidence);
  const scheduleCap = option.scheduleConfidence === 'scheduled' ? baseScore : Math.min(baseScore, 62);
  const rulesCap =
    option.ruleConfidence === 'confirmed' && option.parkingPriceConfidence === 'verified'
      ? scheduleCap
      : Math.min(scheduleCap, 58);

  return rulesCap;
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, list) => list.indexOf(value) === index);
}

function confidenceScoreForTier(tier: ParkRideAvailabilityTier): number {
  switch (tier) {
    case 'recommended':
      return 72;
    case 'backup_available':
      return 58;
    case 'not_recommended':
      return 42;
    case 'data_not_available':
      return 30;
  }
}

function isPresentationUnavailable(tier: ParkRideAvailabilityTier): boolean {
  return tier === 'data_not_available';
}

function isPresentationReliable(tier: ParkRideAvailabilityTier): boolean {
  return tier === 'recommended' || tier === 'backup_available';
}

function emptySelectionResult(): ParkAndRideSelectionResult {
  return {
    best: null,
    candidates: [],
    metroStatus: 'data_not_available',
    availabilityTier: 'data_not_available',
    cardHeadline: PARK_RIDE_COPY.dataNotAvailable,
    notUsefulReason: PARK_RIDE_COPY.dataNotAvailable,
  };
}

export function selectBestParkAndRideForPointAb(
  input: ParkAndRideSelectionInput,
): ParkAndRideSelectionResult {
  return resolveParkAndRideForTrip(input);
}

export function toPointAbParkRidePresentation(
  selection: ParkAndRideSelectionResult,
): PointAbParkRidePresentation | null {
  const resolvedSelection =
    selection.availabilityTier != null ? selection : emptySelectionResult();
  const { availabilityTier, cardHeadline } = resolvedSelection;
  const option = resolvedSelection.best;
  const hasCandidates = resolvedSelection.candidates.length > 0;

  if (!option) {
    const unavailableLabel =
      resolvedSelection.notUsefulReason ||
      cardHeadline ||
      PARK_RIDE_COPY.dataNotAvailable;
    const rulesUrl =
      availabilityTier === 'data_not_available'
        ? undefined
        : resolvedSelection.tripPlannerUrl || SOUND_TRANSIT_PARKING_URL;
    const transitPlannerUrl =
      resolvedSelection.tripPlannerUrl || SOUND_TRANSIT_TRIP_PLANNER_URL;

    return {
      lotName: cardHeadline,
      displayName: cardHeadline,
      costDisplay: 'Not estimated',
      cost: null,
      durationMinutes: null,
      reliable: false,
      confidenceScore: confidenceScoreForTier(availabilityTier),
      recommended: false,
      availabilityTier,
      cardHeadline,
      hasCandidates,
      unavailableReason: unavailableLabel,
      pros: [],
      cons: [unavailableLabel],
      warnings: [VERIFY_SIGNS_WARNING],
      rulesUrl,
      transitPlannerUrl,
      details: {
        lotName: cardHeadline,
        operator: resolvedSelection.metroName || '—',
        address: '—',
        rulesUrl: rulesUrl || '—',
        routesServed: [],
        parkingRuleSummary: 'Verify posted signs and lot rules.',
        verifySignsWarning: VERIFY_SIGNS_WARNING,
        timingBasisLabel: 'Schedule not confirmed — compare route.',
        scheduleConfidenceLabel: 'Schedule not confirmed — compare route.',
        routeBreakdown: {
          driveMinutes: null,
          transitMinutes: null,
          walkMinutes: null,
          waitMinutes: null,
          totalMinutes: null,
        },
        unavailableReason: unavailableLabel,
        warnings: [VERIFY_SIGNS_WARNING],
        lots: buildParkAndRideLotCards(resolvedSelection.candidates),
        sections: [
          {
            title:
              availabilityTier === 'data_not_available'
                ? 'Coverage'
                : 'Why not recommended',
            lines: [unavailableLabel],
          },
        ],
      },
    };
  }

  const facility = getParkRideFacilityForOption(option);
  const details = buildParkAndRideDetailsPanel(option, facility, resolvedSelection.candidates);
  const confidenceScore = confidenceScoreFromOption(option);

  return {
    lotName: option.lotName,
    displayName:
      availabilityTier === 'recommended' || availabilityTier === 'backup_available'
        ? option.lotName
        : cardHeadline,
    costDisplay: option.costEstimate?.transitFareDisplay || option.costEstimate?.display || 'Check transit fare',
    costNote: option.costEstimate?.parkingDisplay,
    cost:
      option.costEstimate != null
        ? option.costEstimate.transitFareMin
        : null,
    durationMinutes: option.totalTimeMinutes ?? null,
    reliable: isPresentationReliable(availabilityTier),
    confidenceScore,
    recommended: availabilityTier === 'recommended',
    availabilityTier,
    cardHeadline,
    timingBasisLabel: option.timingBasisLabel,
    scheduleConfidenceLabel: option.scheduleConfidenceLabel,
    timingIsEstimated: option.scheduleConfidence !== 'scheduled',
    hasCandidates,
    unavailableReason: option.unavailableReason,
    pros: [
      `Uses ${option.agencyName || option.operator} Park & Ride`,
      option.costEstimate?.parkingDisplay || 'Lower parking cost than downtown garages',
      'Useful when destination parking is expensive',
    ],
    cons: uniqueStrings([...option.warnings, option.scheduleConfidenceLabel]),
    warnings: uniqueStrings(option.warnings),
    rulesUrl: details.rulesUrl,
    directionsToLotUrl: option.directionsToLotUrl,
    transitRouteUrl: option.transitRouteUrl,
    transitPlannerUrl:
      option.tripPlannerUrl ||
      resolvedSelection.tripPlannerUrl ||
      SOUND_TRANSIT_TRIP_PLANNER_URL,
    details,
  };
}
