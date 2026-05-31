import { calculateParkingDuration } from '../domain';
import type { TripData } from '../types';
import { confidenceToScore } from './pricingLadder';
import type { AccessRankingResult, AccessStrategyOption } from './types';

function isOvernightTrip(tripData: TripData): boolean {
  const parkingDurationMinutes = calculateParkingDuration(tripData);
  return (
    (tripData.type === 'one-way-departure' || tripData.type === 'round-trip') &&
    parkingDurationMinutes >= 18 * 60
  );
}

function normalizeInverse(value: number, cap: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, 100 - (value / cap) * 100);
}

export function rankAccessOptions(
  options: AccessStrategyOption[],
  tripData: TripData,
): AccessRankingResult {
  const overnight = isOvernightTrip(tripData);

  const scored = options.map((option) => {
    const costMidpoint = (option.pricing.total.min + option.pricing.total.max) / 2;
    const costScore = normalizeInverse(costMidpoint, 120);
    const timeScore = normalizeInverse(option.timing.terminalReadyMinutes, 150);
    const easeScore = option.easeScore;
    const confScore = confidenceToScore(option.pricing.confidence);

    let penalty = 0;
    if (overnight && option.overnightCaveat) penalty += 25;
    if (option.pricing.confidence === 'estimated') penalty += 5;
    if (option.pricing.confidence === 'final_on_provider') penalty += 8;

    const rankScore =
      costScore * 0.4 +
      timeScore * 0.3 +
      easeScore * 0.2 +
      confScore * 0.1 -
      penalty;

    return {
      ...option,
      rankScore,
    };
  });

  const sorted = [...scored].sort(
    (a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0),
  );

  return {
    options: sorted,
    topPickId: sorted[0]?.id,
    rankedBy: ['cost', 'time', 'ease', 'confidence'],
  };
}
