import type { PointAbModeKey } from './pointAbRanking';

export const POINT_AB_PARKING_COMPARISON_KEYS = new Set<PointAbModeKey>([
  'drive',
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
  /**
   * True when the cheapest option is street/meter parking but its price is not
   * trustworthy (medium/low confidence, signs uncertain, or possible paid-hour
   * rules). Used to avoid presenting it as a confident "cheapest around $0" winner.
   */
  cheapestUncertainStreetMeter?: boolean;
  /** Cheapest reliable non-street alternative used to hedge uncertain street/meter copy. */
  reliableAlternative?: PointAbQuickReadMode | null;
  formatMinutes: (minutes: number) => string;
};

const UNCERTAIN_STREET_METER_QUICK_READ =
  'Street / meter may be cheapest, but signs and paid-hour rules need verification.';

/**
 * Builds the cheapest clause for the quick-read summary.
 * Street/meter parking with uncertain pricing is never presented as a confident
 * "cheapest around $0" winner; instead it is hedged toward a reliable option.
 */
function cheapestClause(
  cheapest: PointAbQuickReadMode,
  transitCostDisplay: BuildPointAbQuickReadInput['transitCostDisplay'],
  uncertainStreetMeter: boolean,
  reliableAlternative: PointAbQuickReadMode | null | undefined,
): string {
  if (cheapest.key === 'street-meter' && uncertainStreetMeter) {
    if (reliableAlternative && reliableAlternative.key !== 'street-meter') {
      const altCost = formatQuickReadCost(reliableAlternative, transitCostDisplay);
      return `Cheapest reliable option appears to be ${reliableAlternative.label}${
        altCost ? ` ${altCost}` : ''
      }. Street / meter parking may be cheaper if legal and available.`;
    }
    return UNCERTAIN_STREET_METER_QUICK_READ;
  }

  const cost = formatQuickReadCost(cheapest, transitCostDisplay);
  return `${cheapest.label} is cheapest${cost ? ` ${cost}` : ''}.`;
}

export function buildPointAbQuickReadMessage(input: BuildPointAbQuickReadInput): string {
  const {
    parkingHidden,
    sort,
    selected,
    cheapest,
    fastest,
    transitCostDisplay,
    cheapestUncertainStreetMeter = false,
    reliableAlternative = null,
    formatMinutes,
  } = input;
  const prefix = parkingHidden ? 'Parking is hidden. ' : '';
  const cheapestText = cheapest
    ? cheapestClause(cheapest, transitCostDisplay, cheapestUncertainStreetMeter, reliableAlternative)
    : '';

  if (selected && sort === 'fastest' && typeof selected.minutes === 'number') {
    const cheapestContext =
      cheapest && cheapest.key !== selected.key ? ` ${cheapestText}` : '';
    return `${prefix}${selected.label} is fastest around ${formatMinutes(selected.minutes)}.${cheapestContext}`;
  }

  if (selected && sort === 'cheapest') {
    const selectedCheapestText = cheapestClause(
      selected,
      transitCostDisplay,
      cheapestUncertainStreetMeter,
      reliableAlternative,
    );
    const fastestContext =
      fastest && fastest.key !== selected.key && typeof fastest.minutes === 'number'
        ? ` ${fastest.label} is fastest around ${formatMinutes(fastest.minutes)}.`
        : '';
    return `${prefix}${selectedCheapestText}${fastestContext}`;
  }

  if (selected && sort === 'easiest') {
    const fastestContext =
      fastest && fastest.key !== selected.key && typeof fastest.minutes === 'number'
        ? ` ${fastest.label} is fastest around ${formatMinutes(fastest.minutes)}.`
        : '';
    const cheapestContext =
      cheapest && cheapest.key !== selected.key ? ` ${cheapestText}` : '';
    return `${prefix}${selected.label} is easiest overall.${cheapestContext}${fastestContext}`;
  }

  if (parkingHidden && (!cheapest || !fastest)) {
    if (cheapest && !fastest) {
      return `Parking is hidden. ${cheapestText}`;
    }
    if (!cheapest && fastest) {
      return `Parking is hidden. ${fastest.label} is fastest among visible options around ${formatMinutes(fastest.minutes ?? 0)}.`;
    }
    return 'Parking is hidden. Compare rideshare, transit, or directions for this trip.';
  }

  if (cheapest && fastest) {
    return `${prefix}${cheapestText} ${fastest.label} is fastest around ${formatMinutes(fastest.minutes ?? 0)}.`;
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
