import type { CuratedParkAndRideLotSeed } from './parkAndRideProvider';
import {
  getSeattleRegionParkAndRideLots,
  VERIFY_SIGNS_WARNING,
} from './parkAndRideProvider';
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

function buildParkingRuleSummary(seed: CuratedParkAndRideLotSeed): string {
  const parts = [
    seed.maxParkingDuration,
    seed.permitInfo,
    seed.operator === 'WSDOT' ? 'WSDOT lots often have 48-hour max.' : null,
    seed.operator === 'King County Metro' ? 'Metro permit suspended; FCFS parking.' : null,
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

function statusLabel(
  option: ParkAndRideOption,
  recommendedId?: string,
): string {
  if (option.unavailableReason) return 'Not useful';
  if (recommendedId && option.id === recommendedId) return 'Best pick';
  if (option.isRecommended) return 'Good backup';
  return 'Check rules';
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
  const seedById = new Map(
    getSeattleRegionParkAndRideLots().map((seed) => [seed.id, seed]),
  );

  return uniqueOptions(options)
    .slice(0, 4)
    .map((option) => {
      const seed = seedById.get(option.id);
      const rulesUrl = resolveParkAndRideRulesUrl({
        id: option.id,
        lotName: option.lotName,
        operator: option.operator,
        rulesUrl: option.rulesUrl,
      });

      return {
        id: option.id,
        lotName: option.lotName,
        provider: option.operator,
        address: option.address,
        parkingRuleSummary: seed
          ? buildParkingRuleSummary(seed)
          : 'Verify posted signs and lot rules.',
        costDisplay: option.costEstimate?.display || 'Cost not estimated',
        transitTimeDisplay: formatMinutesLabel(option.transitMinutes),
        totalTimeDisplay: formatMinutesLabel(option.totalTimeMinutes),
        confidence: option.confidence,
        confidenceLabel: confidenceLabel(option.confidence),
        statusLabel: statusLabel(option, recommendedId),
        rulesUrl,
        rulesLinkLabel: parkAndRideRulesLinkLabel({
          id: option.id,
          operator: option.operator,
          rulesUrl: option.rulesUrl,
        }),
        directionsToLotUrl: option.directionsToLotUrl,
        transitRouteUrl: option.transitRouteUrl,
        unavailableReason: option.unavailableReason,
        warnings: option.warnings,
      };
    });
}

export function buildParkAndRideDetailsPanel(
  option: ParkAndRideOption,
  seed?: CuratedParkAndRideLotSeed,
  candidates: ParkAndRideOption[] = [option],
): ParkAndRideDetailsPanel {
  const parkingRuleSummary = seed ? buildParkingRuleSummary(seed) : 'Verify posted signs and lot rules.';
  const rulesUrl = resolveParkAndRideRulesUrl({
    id: option.id,
    lotName: option.lotName,
    operator: option.operator,
    rulesUrl: option.rulesUrl,
  });
  const lots = buildParkAndRideLotCards([option, ...candidates], option.id);

  return {
    lotName: option.lotName,
    operator: option.operator,
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
        ],
      },
      {
        title: option.isRecommended ? 'Why this lot' : 'Why not recommended',
        lines: [
          option.selectionReason || option.unavailableReason || 'No strong Park & Ride fit for this trip.',
        ],
      },
      ...(option.warnings.length > 0
        ? [{ title: 'Warnings', lines: option.warnings }]
        : []),
    ],
  };
}
