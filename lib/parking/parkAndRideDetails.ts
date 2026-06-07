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

function formatMinutesLabel(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function buildParkingRuleSummary(facility?: ParkRideFacility, option?: ParkAndRideOption): string {
  const parts = [
    facility?.timeLimit,
    facility?.parkingCostExpectation === 'free'
      ? 'Free during service hours; no overnight parking.'
      : null,
    facility?.parkingCostExpectation === 'permit' ? 'Permit or validation may apply.' : null,
    facility?.agencyName === 'WSDOT' ? 'WSDOT lots often have 48-hour max.' : null,
    facility?.agencyName === 'King County Metro' ? 'Metro permit suspended; FCFS parking.' : null,
    facility?.agencyName === 'CapMetro' ? 'Park only in designated CapMetro spaces.' : null,
    option?.maxParkingDuration,
  ].filter(Boolean);

  return parts.join(' ') || 'Same-day commuter parking is typical. Verify posted signs.';
}

function confidenceLabel(confidence: ParkAndRideOption['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'High confidence';
    case 'medium':
      return 'Medium confidence';
    case 'low':
      return 'Low confidence';
  }
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

      return {
        id: option.id,
        lotName: option.lotName,
        provider: option.agencyName || option.operator,
        address: option.address,
        parkingRuleSummary: buildParkingRuleSummary(facility, option),
        costDisplay: option.costEstimate?.parkingDisplay || 'Parking cost not estimated',
        parkingCostDisplay: option.costEstimate?.parkingDisplay || 'Parking cost not estimated',
        transitFareDisplay: option.costEstimate?.transitFareDisplay || 'Transit fare not estimated',
        transitTimeDisplay: formatMinutesLabel(option.transitMinutes),
        totalTimeDisplay: formatMinutesLabel(option.totalTimeMinutes),
        confidence: option.confidence,
        confidenceLabel: confidenceLabel(option.confidence),
        statusLabel,
        timeDeltaLabel: option.timeDeltaLabel,
        rulesUrl,
        rulesLinkLabel: parkAndRideRulesLinkLabel({
          id: option.id,
          operator: option.operator,
          rulesUrl: option.rulesUrl,
        }),
        directionsToLotUrl: option.directionsToLotUrl,
        transitRouteUrl: option.transitRouteUrl,
        unavailableReason: reasonLine,
        warnings: option.warnings,
      };
    });
}

export function buildParkAndRideDetailsPanel(
  option: ParkAndRideOption,
  facility?: ParkRideFacility,
  candidates: ParkAndRideOption[] = [option],
): ParkAndRideDetailsPanel {
  const parkingRuleSummary = buildParkingRuleSummary(facility, option);
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
    maxDuration: option.maxParkingDuration,
    verifySignsWarning: VERIFY_SIGNS_WARNING,
    routeBreakdown: {
      driveMinutes: option.driveToLotMinutes ?? null,
      transitMinutes: option.transitMinutes ?? null,
      walkMinutes: option.walkMinutes ?? null,
      waitMinutes: option.waitMinutes ?? null,
      totalMinutes: option.totalTimeMinutes ?? null,
    },
    selectionReason: option.selectionReason,
    unavailableReason: option.unavailableReason,
    warnings: option.warnings,
    lots,
    sections: [
      {
        title: 'Route breakdown',
        lines: [
          `Drive to lot: ${formatMinutesLabel(option.driveToLotMinutes)}`,
          `Transit to destination: ${formatMinutesLabel(option.transitMinutes)}`,
          `Walk: ${formatMinutesLabel(option.walkMinutes)}`,
          `Wait/transfer buffer: ${formatMinutesLabel(option.waitMinutes)}`,
          `Estimated total: ${formatMinutesLabel(option.totalTimeMinutes)}`,
          option.timeDeltaLabel ? `Compared to driving: ${option.timeDeltaLabel}` : null,
        ].filter(Boolean) as string[],
      },
      {
        title: option.isRecommended ? 'Why this lot' : 'Why not recommended',
        lines: [whyLine],
      },
      ...(option.warnings.length > 0
        ? [{ title: 'Warnings', lines: option.warnings }]
        : []),
    ],
  };
}
