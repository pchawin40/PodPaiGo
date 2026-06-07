import { evaluateLocalStreetParkingRules } from './localParkingRules';
import { estimateSeattleStreetMeterPricing } from './meterPricing';

export type StreetMeterParkingPresentation = {
  applicable: boolean;
  label: string;
  name: string;
  costDisplay: string;
  cost: number | null;
  costNote?: string;
  durationMinutes: number | null;
  timeDisplay: string;
  confidence: 'High' | 'Medium' | 'Low';
  pros: string[];
  cons: string[];
  warnings: string[];
  verifyRequired: boolean;
  sourceLabel: string;
};

const STREET_SEARCH_MINUTES = 10;
const STREET_WALK_MINUTES = 5;

function isSeattleLocalTrip(destination: string, isAirportTrip?: boolean): boolean {
  if (isAirportTrip) return false;
  return /\bseattle\b/i.test(destination);
}

function formatMinutesLabel(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function buildStreetMeterParkingOption(input: {
  destination: string;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  durationMinutes: number;
  driveMinutes?: number | null;
  isAirportTrip?: boolean;
}): StreetMeterParkingPresentation | null {
  if (!isSeattleLocalTrip(input.destination, input.isAirportTrip)) return null;

  const localRules = evaluateLocalStreetParkingRules({
    destination: input.destination,
    arrivalDate: input.arrivalDate,
    arrivalTime: input.arrivalTime,
    durationMinutes: input.durationMinutes,
    isAirportTrip: false,
  });

  if (!localRules.freeLikely && !localRules.paidLikely && !localRules.detail) {
    return null;
  }

  const pricing = estimateSeattleStreetMeterPricing({
    destination: input.destination,
    arrivalDate: input.arrivalDate,
    arrivalTime: input.arrivalTime,
    durationMinutes: input.durationMinutes,
  });

  if (!pricing) return null;

  const driveMinutes =
    typeof input.driveMinutes === 'number' && Number.isFinite(input.driveMinutes)
      ? Math.max(0, input.driveMinutes)
      : null;
  const totalMinutes =
    driveMinutes != null
      ? driveMinutes + STREET_SEARCH_MINUTES + STREET_WALK_MINUTES
      : null;

  const pros: string[] = [];
  if (localRules.freeLikely && localRules.appliesToday) {
    pros.push('Sunday/holiday or off-hours payment may not be required');
  } else if (localRules.paidLikely) {
    pros.push('Often cheaper than nearby garages for short stays');
  } else {
    pros.push('May avoid garage fees when a legal stall is open');
  }
  pros.push('You keep your car nearby');

  const cons = [
    'Street availability is not guaranteed',
    localRules.verifyRequired ? 'Verify posted signs before leaving your car' : 'Check time limits',
  ];

  return {
    applicable: true,
    label: 'Street / meter parking',
    name: localRules.headline || 'On-street parking near destination',
    costDisplay: pricing.costDisplay,
    cost: pricing.total,
    costNote: pricing.costNote,
    durationMinutes: totalMinutes,
    timeDisplay:
      totalMinutes != null
        ? formatMinutesLabel(totalMinutes)
        : 'Drive + search + walk',
    confidence:
      pricing.confidence === 'high'
        ? 'High'
        : pricing.confidence === 'medium'
          ? 'Medium'
          : 'Low',
    pros,
    cons,
    warnings: pricing.warnings,
    verifyRequired: localRules.verifyRequired,
    sourceLabel: pricing.sourceLabel,
  };
}
