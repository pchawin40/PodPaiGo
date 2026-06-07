import { evaluateLocalStreetParkingRules } from './localParkingRules';

export type MeterPricingEstimate = {
  total: number | null;
  costDisplay: string;
  costNote?: string;
  sourceLabel: string;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  /** Separate from garage pricing — meter/stall only. */
  pricingKind: 'street_meter';
};

/** Conservative Seattle downtown meter bands until SDOT open data is wired in. */
const SEATTLE_DOWNTOWN_METER_RATE_PER_HOUR = 2.5;
const SEATTLE_NEIGHBORHOOD_METER_RATE_PER_HOUR = 1.5;

function isSeattleDestination(destination: string): boolean {
  return /\bseattle\b/i.test(destination);
}

function isDowntownSeattle(destination: string): boolean {
  return /\b(downtown|pike place|belltown|1st(?:\s|-)?(?:ave|avenue)|2nd(?:\s|-)?(?:ave|avenue)|3rd(?:\s|-)?(?:ave|avenue))\b/i.test(
    destination,
  );
}

function formatMoney(value: number): string {
  return `$${Math.round(value)}`;
}

/**
 * Estimate on-street meter cost for Seattle trips.
 * Structured for future SDOT rate-table ingestion; garage rules stay separate.
 */
export function estimateSeattleStreetMeterPricing(input: {
  destination: string;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  durationMinutes: number;
}): MeterPricingEstimate | null {
  if (!isSeattleDestination(input.destination)) return null;

  const localRules = evaluateLocalStreetParkingRules({
    destination: input.destination,
    arrivalDate: input.arrivalDate,
    arrivalTime: input.arrivalTime,
    durationMinutes: input.durationMinutes,
    isAirportTrip: false,
  });

  if (
    !localRules.freeLikely &&
    !localRules.paidLikely &&
    localRules.paymentExpectation !== 'check_signs'
  ) {
    return null;
  }

  const warnings = [
    'Confirm posted signs, time limits, and payment hours before parking.',
  ];

  if (localRules.ruleDetails?.maxDuration) {
    warnings.push(`${localRules.ruleDetails.maxDuration}-hour limit may apply on this block.`);
  }

  if (localRules.freeLikely && localRules.appliesToday) {
    return {
      total: 0,
      costDisplay: 'Free',
      costNote: localRules.detail,
      sourceLabel: 'Seattle street rule (conservative)',
      confidence: 'medium',
      warnings,
      pricingKind: 'street_meter',
    };
  }

  if (localRules.paidLikely) {
    const hourlyRate = isDowntownSeattle(input.destination)
      ? SEATTLE_DOWNTOWN_METER_RATE_PER_HOUR
      : SEATTLE_NEIGHBORHOOD_METER_RATE_PER_HOUR;
    const durationHours = Math.max(0.5, Math.min(input.durationMinutes / 60, 3));
    const estimated = Math.round(hourlyRate * durationHours);

    return {
      total: estimated,
      costDisplay: `~${formatMoney(estimated)} est.`,
      costNote: 'Meter estimate — check pay station or app.',
      sourceLabel: 'Seattle meter estimate (conservative)',
      confidence: 'low',
      warnings: [...warnings, 'Actual meter rate varies by block and zone.'],
      pricingKind: 'street_meter',
    };
  }

  return {
    total: null,
    costDisplay: 'Check meter',
    costNote: localRules.detail,
    sourceLabel: 'Seattle street rule (conservative)',
    confidence: 'low',
    warnings,
    pricingKind: 'street_meter',
  };
}
