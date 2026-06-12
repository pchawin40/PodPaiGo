import type { ParkRideFacility } from './parkRideFacilities';
import { getParkRideFacilityById } from './parkRideFacilities';
import { resolveLotStatusLabel, VERIFY_SIGNS_WARNING } from './parkRideResolver';
import {
  parkAndRideRulesLinkLabel,
  resolveParkAndRideRulesUrl,
} from './parkAndRideLinks';
import type {
  ParkAndRideDetailsPanel,
  ParkAndRideLotCard,
  ParkAndRideOption,
} from './parkAndRideTypes';

function formatMinutesLabel(minutes: number | null | undefined, estimated = false): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  const suffix = estimated ? ' est.' : '';
  if (minutes < 60) return `${Math.round(minutes)} min${suffix}`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  const label = remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
  return `${label}${suffix}`;
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, list) => list.indexOf(value) === index);
}

function isGenericOvernightRule(value: string | undefined): boolean {
  return Boolean(value && /overnight rules vary by lot/i.test(value));
}

function shouldVerifyOvernightRules(facility?: ParkRideFacility, option?: ParkAndRideOption): boolean {
  if (facility) return facility.overnightAllowed !== true;
  if (option) return option.overnightAllowed !== true;
  return true;
}

function buildParkingRuleSummary(facility?: ParkRideFacility, option?: ParkAndRideOption): string {
  const parts = uniqueStrings([
    facility?.timeLimit && !isGenericOvernightRule(facility.timeLimit)
      ? facility.timeLimit
      : null,
    facility?.parkingCostExpectation === 'free'
      ? 'Usually free during service hours; verify lot signs.'
      : null,
    facility?.parkingCostExpectation === 'permit' ? 'Permit or validation may apply.' : null,
    facility?.agencyName === 'WSDOT' ? 'WSDOT lots often have 48-hour max.' : null,
    facility?.agencyName === 'King County Metro' ? 'Metro permit suspended; FCFS parking.' : null,
    facility?.agencyName === 'CapMetro' ? 'Park only in designated CapMetro spaces.' : null,
    option?.maxParkingDuration &&
    option.maxParkingDuration !== facility?.timeLimit &&
    !isGenericOvernightRule(option.maxParkingDuration)
      ? option.maxParkingDuration
      : null,
    shouldVerifyOvernightRules(facility, option) ? 'Verify overnight rules.' : null,
  ].filter(Boolean) as string[]);

  return parts.join(' ') || 'Same-day commuter parking is typical. Verify posted signs.';
}

function confidenceLabel(option: ParkAndRideOption): string {
  if (option.confidence === 'low') return 'Low confidence';

  const genericRules =
    option.ruleConfidence !== 'confirmed' ||
    option.parkingPriceConfidence !== 'verified' ||
    option.scheduleConfidence !== 'scheduled';

  if (genericRules) return 'Medium confidence';
  return option.confidence === 'high' ? 'High confidence' : 'Medium confidence';
}

function confidenceDescription(option: ParkAndRideOption): string {
  const hasTimingEstimate = option.scheduleConfidence !== 'scheduled';
  const verifyRules =
    option.ruleConfidence !== 'confirmed' || option.parkingPriceConfidence !== 'verified';

  if (hasTimingEstimate && verifyRules) return 'Timing estimate; verify lot rules';
  if (hasTimingEstimate) return 'Timing estimate; compare route';
  if (verifyRules) return 'Verify lot rules';
  return 'Lot and schedule data verified';
}

function maxDurationDisplay(value: string | undefined): string | undefined {
  if (!value || isGenericOvernightRule(value)) return undefined;
  return value;
}

function routeTimingLines(option: ParkAndRideOption): string[] {
  return uniqueStrings(
    [
      option.timingBasisLabel ? `Timing basis: ${option.timingBasisLabel}` : null,
      option.scheduleConfidenceLabel &&
      option.scheduleConfidenceLabel !== option.timingBasisLabel
        ? `Schedule: ${option.scheduleConfidenceLabel}`
        : null,
    ].filter(Boolean) as string[],
  );
}

function timingIsEstimated(option: ParkAndRideOption): boolean {
  return option.scheduleConfidence !== 'scheduled';
}

function formatOptionMinutes(option: ParkAndRideOption, minutes: number | null | undefined): string {
  return formatMinutesLabel(minutes, timingIsEstimated(option));
}

function uniqueWarnings(option: ParkAndRideOption): string[] {
  return uniqueStrings(option.warnings);
}

function buildLotCardConfidence(option: ParkAndRideOption): {
  label: string;
  description: string;
} {
  return {
    label: confidenceLabel(option),
    description: confidenceDescription(option),
  };
}

function buildTimingCardLabels(option: ParkAndRideOption): {
  transitTimeDisplay: string;
  totalTimeDisplay: string;
} {
  return {
    transitTimeDisplay: formatOptionMinutes(option, option.transitMinutes),
    totalTimeDisplay: formatOptionMinutes(option, option.totalTimeMinutes),
  };
}

function formatBreakdownLine(
  option: ParkAndRideOption,
  label: string,
  minutes: number | null | undefined,
): string {
  return `${label}: ${formatOptionMinutes(option, minutes)}`;
}

function buildRouteBreakdownLines(option: ParkAndRideOption): string[] {
  return [
    formatBreakdownLine(option, 'Drive to lot', option.driveToLotMinutes),
    formatBreakdownLine(option, 'Estimated wait', option.waitMinutes),
    formatBreakdownLine(option, 'Transit to destination', option.transitMinutes),
    formatBreakdownLine(option, 'Walk', option.walkMinutes),
    formatBreakdownLine(option, 'Estimated total', option.totalTimeMinutes),
    option.timeDeltaLabel ? `Compared to driving: ${option.timeDeltaLabel}` : null,
    ...routeTimingLines(option),
  ].filter(Boolean) as string[];
}

function buildFallbackDetailsPanel(
  option: ParkAndRideOption,
): Pick<ParkAndRideDetailsPanel, 'maxDuration' | 'timingBasisLabel' | 'scheduleConfidenceLabel' | 'warnings'> {
  return {
    maxDuration: maxDurationDisplay(option.maxParkingDuration),
    timingBasisLabel: option.timingBasisLabel,
    scheduleConfidenceLabel: option.scheduleConfidenceLabel,
    warnings: uniqueWarnings(option),
  };
}

function buildLotCardOption(option: ParkAndRideOption): Pick<
  ParkAndRideLotCard,
  'transitTimeDisplay' | 'totalTimeDisplay' | 'confidenceLabel' | 'confidenceDescription' | 'warnings'
> {
  const timing = buildTimingCardLabels(option);
  const confidence = buildLotCardConfidence(option);

  return {
    ...timing,
    confidenceLabel: confidence.label,
    confidenceDescription: confidence.description,
    warnings: uniqueWarnings(option),
  };
}

function uniqueOptions(options: ParkAndRideOption[]): ParkAndRideOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

export function buildParkAndRideLotCards(
  options: ParkAndRideOption[],
  recommendedId?: string,
): ParkAndRideLotCard[] {
  return uniqueOptions(options)
    .slice(0, 4)
    .map((option) => {
      const facility = getParkRideFacilityById(option.id);
      const rulesUrl = resolveParkAndRideRulesUrl({
        id: option.id,
        lotName: option.lotName,
        operator: option.operator,
        rulesUrl: option.rulesUrl,
      });
      const statusLabel = resolveLotStatusLabel({ option, recommendedId });
      const reasonLine =
        option.timeDeltaLabel ||
        option.selectionReason ||
        option.unavailableReason ||
        'Verify signs before parking.';
      const lotCard = buildLotCardOption(option);

      return {
        id: option.id,
        lotName: option.lotName,
        provider: option.agencyName || option.operator,
        address: option.address,
        parkingRuleSummary: buildParkingRuleSummary(facility, option),
        costDisplay: option.costEstimate?.parkingDisplay || 'Parking cost not estimated',
        parkingCostDisplay: option.costEstimate?.parkingDisplay || 'Parking cost not estimated',
        transitFareDisplay: option.costEstimate?.transitFareDisplay || 'Transit fare not estimated',
        transitTimeDisplay: lotCard.transitTimeDisplay,
        totalTimeDisplay: lotCard.totalTimeDisplay,
        confidence: option.confidence,
        confidenceLabel: lotCard.confidenceLabel,
        confidenceDescription: lotCard.confidenceDescription,
        statusLabel,
        timeDeltaLabel: option.timeDeltaLabel,
        timingBasisLabel: option.timingBasisLabel,
        scheduleConfidenceLabel: option.scheduleConfidenceLabel,
        rulesUrl,
        rulesLinkLabel: parkAndRideRulesLinkLabel({
          id: option.id,
          operator: option.operator,
          rulesUrl: option.rulesUrl,
        }),
        directionsToLotUrl: option.directionsToLotUrl,
        transitRouteUrl: option.transitRouteUrl,
        unavailableReason: reasonLine,
        warnings: lotCard.warnings,
      };
    });
}

export function buildParkAndRideDetailsPanel(
  option: ParkAndRideOption,
  facility?: ParkRideFacility,
  candidates: ParkAndRideOption[] = [option],
): ParkAndRideDetailsPanel {
  const parkingRuleSummary = buildParkingRuleSummary(facility, option);
  const fallbackDetails = buildFallbackDetailsPanel(option);
  const rulesUrl = resolveParkAndRideRulesUrl({
    id: option.id,
    lotName: option.lotName,
    operator: option.operator,
    rulesUrl: option.rulesUrl,
  });
  const lots = buildParkAndRideLotCards([option, ...candidates], option.id);
  const whyLine =
    option.timeDeltaLabel ||
    option.selectionReason ||
    option.unavailableReason ||
    'No strong Park & Ride fit for this trip.';

  return {
    lotName: option.lotName,
    operator: option.agencyName || option.operator,
    address: option.address,
    rulesUrl,
    routesServed: option.routesServed,
    parkingRuleSummary,
    maxDuration: fallbackDetails.maxDuration,
    verifySignsWarning: VERIFY_SIGNS_WARNING,
    timingBasisLabel: fallbackDetails.timingBasisLabel,
    scheduleConfidenceLabel: fallbackDetails.scheduleConfidenceLabel,
    routeBreakdown: {
      driveMinutes: option.driveToLotMinutes ?? null,
      transitMinutes: option.transitMinutes ?? null,
      walkMinutes: option.walkMinutes ?? null,
      waitMinutes: option.waitMinutes ?? null,
      totalMinutes: option.totalTimeMinutes ?? null,
    },
    selectionReason: option.selectionReason,
    unavailableReason: option.unavailableReason,
    warnings: fallbackDetails.warnings,
    lots,
    sections: [
      {
        title: 'Route breakdown',
        lines: buildRouteBreakdownLines(option),
      },
      {
        title: option.isRecommended ? 'Why this lot' : 'Why not recommended',
        lines: [whyLine],
      },
      ...(option.warnings.length > 0
        ? [{ title: 'Warnings', lines: fallbackDetails.warnings }]
        : []),
    ],
  };
}
