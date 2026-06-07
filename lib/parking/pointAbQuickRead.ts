import type { PointAbModeKey } from './pointAbRanking';

export const POINT_AB_PARKING_COMPARISON_KEYS = new Set<PointAbModeKey>([
  'destination-customer',
  'parking',
  'street-meter',
  'park-ride',
]);

export function isPointAbParkingComparisonKey(key: string): boolean {
  return POINT_AB_PARKING_COMPARISON_KEYS.has(key as PointAbModeKey);
}

export function shouldExcludeFromPointAbQuickRead(
  key: PointAbModeKey,
  noParkingPreferred: boolean,
): boolean {
  return noParkingPreferred && POINT_AB_PARKING_COMPARISON_KEYS.has(key);
}

export type PointAbQuickReadMode = {
  key: string;
  label: string;
  cost?: number;
  minutes?: number;
};

export type BuildPointAbQuickReadInput = {
  parkingHidden: boolean;
  sort?: 'easiest' | 'cheapest' | 'fastest';
  selected?: PointAbQuickReadMode | null;
  cheapest: PointAbQuickReadMode | null;
  fastest: PointAbQuickReadMode | null;
  transitCostDisplay?: { primary: string; secondary?: string | null } | null;
  formatMinutes: (minutes: number) => string;
};

export function buildPointAbQuickReadMessage(input: BuildPointAbQuickReadInput): string {
  const { parkingHidden, sort, selected, cheapest, fastest, transitCostDisplay, formatMinutes } = input;
  const prefix = parkingHidden ? 'Parking is hidden. ' : '';

  if (selected && sort === 'fastest' && typeof selected.minutes === 'number') {
    const cheapestContext =
      cheapest && cheapest.key !== selected.key
        ? ` ${cheapest.label} is cheapest${formatQuickReadCost(cheapest, transitCostDisplay) ? ` ${formatQuickReadCost(cheapest, transitCostDisplay)}` : ''}.`
        : '';
    return `${prefix}${selected.label} is fastest around ${formatMinutes(selected.minutes)}.${cheapestContext}`;
  }

  if (selected && sort === 'cheapest') {
    const selectedCost = formatQuickReadCost(selected, transitCostDisplay);
    const fastestContext =
      fastest && fastest.key !== selected.key && typeof fastest.minutes === 'number'
        ? ` ${fastest.label} is fastest around ${formatMinutes(fastest.minutes)}.`
        : '';
    return `${prefix}${selected.label} is cheapest${selectedCost ? ` ${selectedCost}` : ''}.${fastestContext}`;
  }

  if (selected && sort === 'easiest') {
    const fastestContext =
      fastest && fastest.key !== selected.key && typeof fastest.minutes === 'number'
        ? ` ${fastest.label} is fastest around ${formatMinutes(fastest.minutes)}.`
        : '';
    const cheapestContext =
      cheapest && cheapest.key !== selected.key
        ? ` ${cheapest.label} is cheapest${formatQuickReadCost(cheapest, transitCostDisplay) ? ` ${formatQuickReadCost(cheapest, transitCostDisplay)}` : ''}.`
        : '';
    return `${prefix}${selected.label} is easiest overall.${cheapestContext}${fastestContext}`;
  }

  if (parkingHidden && (!cheapest || !fastest)) {
    if (cheapest && !fastest) {
      const cheapestCost = formatQuickReadCost(cheapest, transitCostDisplay);
      return `Parking is hidden. ${cheapest.label} is cheapest${cheapestCost ? ` ${cheapestCost}` : ''}.`;
    }
    if (!cheapest && fastest) {
      return `Parking is hidden. ${fastest.label} is fastest among visible options around ${formatMinutes(fastest.minutes ?? 0)}.`;
    }
    return 'Parking is hidden. Compare rideshare, transit, or directions for this trip.';
  }

  if (cheapest && fastest) {
    const cheapestCost = formatQuickReadCost(cheapest, transitCostDisplay);
    return `${prefix}${cheapest.label} is cheapest${cheapestCost ? ` ${cheapestCost}` : ''}. ${fastest.label} is fastest around ${formatMinutes(fastest.minutes ?? 0)}.`;
  }

  if (parkingHidden) {
    return 'Parking is hidden. Compare rideshare, transit, or directions for this trip.';
  }

  return 'Some live route or price data is missing, so confirm final pricing before booking.';
}

function formatQuickReadCost(
  mode: PointAbQuickReadMode,
  transitCostDisplay?: { primary: string; secondary?: string | null } | null,
): string {
  if (mode.key === 'transit' && transitCostDisplay) {
    return `at ${transitCostDisplay.primary}${transitCostDisplay.secondary ? ` (${transitCostDisplay.secondary})` : ''}`;
  }
  if (typeof mode.cost === 'number' && Number.isFinite(mode.cost)) {
    return `around $${Math.round(mode.cost)}`;
  }
  return '';
}
