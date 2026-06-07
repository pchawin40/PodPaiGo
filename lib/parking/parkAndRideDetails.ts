import type { CuratedParkAndRideLotSeed } from './parkAndRideProvider';
import { VERIFY_SIGNS_WARNING } from './parkAndRideProvider';
import type { ParkAndRideDetailsPanel, ParkAndRideOption } from './parkAndRideTypes';

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

export function buildParkAndRideDetailsPanel(
  option: ParkAndRideOption,
  seed?: CuratedParkAndRideLotSeed,
): ParkAndRideDetailsPanel {
  const parkingRuleSummary = seed ? buildParkingRuleSummary(seed) : 'Verify posted signs and lot rules.';

  return {
    lotName: option.lotName,
    operator: option.operator,
    address: option.address,
    rulesUrl: option.rulesUrl,
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
