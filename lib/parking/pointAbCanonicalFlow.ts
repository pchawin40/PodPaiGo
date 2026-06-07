import type { ParkingPreference } from '../types';
import type { BusinessTravelMode } from '../trip/travelPreferences';
import { debugLog } from '../utils/debug';
import { shouldExcludeFromPointAbQuickRead } from './pointAbQuickRead';
import {
  preferenceBoostIsCapped,
  scorePointAbMode,
  type PointAbModeCandidate,
  type PointAbModeKey,
  type PointAbSortMode,
} from './pointAbRanking';

const BIG = 999_999;

export type PointAbParkingVisibilityMode = 'visible' | 'hidden_by_preference';

export type PointAbEffectivePreference = {
  noParkingPreferred: boolean;
  parkingVisibilityMode: PointAbParkingVisibilityMode;
  businessTravelMode: BusinessTravelMode;
  tripParkingPreference?: ParkingPreference;
  showParkingAnyway: boolean;
};

export type PointAbCanonicalWinners = {
  easiestWinner: PointAbModeKey | null;
  cheapestWinner: PointAbModeCandidate | null;
  fastestWinner: PointAbModeCandidate | null;
  bestOverallWinner: PointAbModeKey | null;
  heroWinner: PointAbModeKey | null;
  visibleOptionKeys: PointAbModeKey[];
  hiddenOptionKeys: PointAbModeKey[];
};

export function resolvePointAbEffectivePreference(input: {
  businessTravelMode: BusinessTravelMode;
  tripParkingPreference?: ParkingPreference;
  showParkingAnyway?: boolean;
}): PointAbEffectivePreference {
  const showParkingAnyway = input.showParkingAnyway ?? false;
  const noParkingPreferred =
    input.tripParkingPreference === 'none' ||
    input.businessTravelMode === 'expense_rideshare' ||
    input.businessTravelMode === 'no_parking';
  const parkingVisibilityMode: PointAbParkingVisibilityMode =
    noParkingPreferred && !showParkingAnyway ? 'hidden_by_preference' : 'visible';

  return {
    noParkingPreferred: parkingVisibilityMode === 'hidden_by_preference',
    parkingVisibilityMode,
    businessTravelMode: input.businessTravelMode,
    tripParkingPreference: input.tripParkingPreference,
    showParkingAnyway,
  };
}

function isVisibleCandidate(key: PointAbModeKey, noParkingPreferred: boolean): boolean {
  return !shouldExcludeFromPointAbQuickRead(key, noParkingPreferred);
}

function scoreVisibleCandidates(args: {
  candidates: PointAbModeCandidate[];
  sort: PointAbSortMode;
  noParkingPreferred: boolean;
  parkingCost: number | null;
  rideshareCost: number | null;
  parkingBonus: number;
}): Array<{ mode: PointAbModeCandidate; score: number }> {
  return args.candidates
    .filter((mode) => isVisibleCandidate(mode.key, args.noParkingPreferred))
    .map((mode) => ({
      mode,
      score: scorePointAbMode({
        mode,
        sort: args.sort,
        noParkingPreferred: args.noParkingPreferred,
        parkingCost: args.parkingCost,
        rideshareCost: args.rideshareCost,
        parkingBonus: mode.key === 'parking' ? args.parkingBonus : 0,
      }),
    }));
}

export function computePointAbCanonicalWinners(input: {
  candidates: PointAbModeCandidate[];
  sort: PointAbSortMode;
  noParkingPreferred: boolean;
  parkingCost: number | null;
  rideshareCost: number | null;
  parkingBonus?: number;
}): PointAbCanonicalWinners {
  const parkingBonus = input.parkingBonus ?? 0;
  const visibleCandidates = input.candidates.filter((mode) =>
    isVisibleCandidate(mode.key, input.noParkingPreferred),
  );
  const hiddenOptionKeys = input.candidates
    .filter((mode) => !isVisibleCandidate(mode.key, input.noParkingPreferred))
    .map((mode) => mode.key);
  const visibleOptionKeys = visibleCandidates.map((mode) => mode.key);

  const easiestScored = scoreVisibleCandidates({
    candidates: input.candidates,
    sort: 'easiest',
    noParkingPreferred: input.noParkingPreferred,
    parkingCost: input.parkingCost,
    rideshareCost: input.rideshareCost,
    parkingBonus,
  }).sort((a, b) => b.score - a.score)[0]?.mode.key ?? null;

  const sortScored = scoreVisibleCandidates({
    candidates: input.candidates,
    sort: input.sort,
    noParkingPreferred: input.noParkingPreferred,
    parkingCost: input.parkingCost,
    rideshareCost: input.rideshareCost,
    parkingBonus,
  }).sort((a, b) => b.score - a.score)[0]?.mode.key ?? null;

  const cheapestWinner =
    [...visibleCandidates]
      .filter((mode) => mode.reliable && mode.cost < BIG)
      .sort((a, b) => a.cost - b.cost || a.minutes - b.minutes)[0] ?? null;

  const fastestWinner =
    [...visibleCandidates]
      .filter((mode) => mode.reliable)
      .sort((a, b) => a.minutes - b.minutes || a.cost - b.cost)[0] ?? null;

  const heroWinner =
    input.sort === 'cheapest'
      ? cheapestWinner?.key ?? sortScored
      : input.sort === 'fastest'
        ? fastestWinner?.key ?? sortScored
        : sortScored ?? easiestScored;

  return {
    easiestWinner: easiestScored,
    cheapestWinner,
    fastestWinner,
    bestOverallWinner: easiestScored,
    heroWinner,
    visibleOptionKeys,
    hiddenOptionKeys,
  };
}

export function resolvePointAbRecommendationMode(input: {
  candidates: PointAbModeCandidate[];
  sort: PointAbSortMode;
  noParkingPreferred: boolean;
  parkingCost: number | null;
  rideshareCost: number | null;
  parkingBonus?: number;
}): PointAbModeKey | null {
  const winners = computePointAbCanonicalWinners(input);
  const extremeCostGap = preferenceBoostIsCapped({
    parkingCost: input.parkingCost,
    rideshareCost: input.rideshareCost,
  });

  if (input.noParkingPreferred && extremeCostGap) {
    const objectiveScored = input.candidates.map((mode) => ({
      mode,
      score: scorePointAbMode({
        mode,
        sort: input.sort,
        noParkingPreferred: false,
        parkingCost: input.parkingCost,
        rideshareCost: input.rideshareCost,
        parkingBonus: mode.key === 'parking' ? (input.parkingBonus ?? 0) : 0,
      }),
    }));
    const objectiveBest = objectiveScored.sort((a, b) => b.score - a.score)[0]?.mode.key ?? null;
    if (objectiveBest) return objectiveBest;
  }

  return winners.heroWinner;
}

const PARKING_UI_KEYS = new Set<PointAbModeKey>([
  'destination-customer',
  'parking',
  'street-meter',
  'park-ride',
]);

export function isPointAbParkingUiKey(key: string): boolean {
  return PARKING_UI_KEYS.has(key as PointAbModeKey);
}

export function resolvePointAbDisplayRecommendationMode(input: {
  recommendationMode: PointAbModeKey | 'compare';
  noParkingPreferred: boolean;
  visibleOptionKeys: PointAbModeKey[];
}): PointAbModeKey | 'compare' {
  if (input.recommendationMode === 'compare') return 'compare';

  const parkingHidden =
    input.noParkingPreferred && isPointAbParkingUiKey(input.recommendationMode);
  if (!parkingHidden) return input.recommendationMode;

  const visible = new Set(input.visibleOptionKeys);
  if (visible.has('rideshare')) return 'rideshare';
  if (visible.has('transit')) return 'transit';
  return input.recommendationMode;
}

export function buildPointAbDisplayRecommendation(input: {
  recommendationMode: PointAbModeKey | 'compare';
  displayRecommendationMode: PointAbModeKey | 'compare';
  recommendedTitle: string;
  recommendedReason: string;
  bestRideName?: string | null;
  noParkingPreferred: boolean;
}): { title: string; reason: string } {
  if (input.displayRecommendationMode === input.recommendationMode) {
    return {
      title: input.recommendedTitle,
      reason: input.recommendedReason,
    };
  }

  if (input.displayRecommendationMode === 'rideshare') {
    return {
      title: `Take ${input.bestRideName || 'rideshare'}`,
      reason: input.noParkingPreferred
        ? 'Best fit because you marked that parking is not needed for this trip.'
        : 'Best fit if you want the lowest effort and do not want to leave a car parked.',
    };
  }

  if (input.displayRecommendationMode === 'transit') {
    return {
      title: 'Take transit',
      reason: 'Best fit if cost matters most and your schedule has enough buffer.',
    };
  }

  return {
    title: 'Compare rideshare, transit, or directions',
    reason: 'Parking is hidden for this trip. Compare rideshare, transit, or open directions.',
  };
}

export function logPointAbCanonicalFlow(input: {
  effectivePreference: PointAbEffectivePreference;
  sort: PointAbSortMode;
  winners: PointAbCanonicalWinners;
  heroMode: PointAbModeKey | 'compare';
  displayMode: PointAbModeKey | 'compare';
}): void {
  debugLog('pointAbCanonicalFlow', {
    effectivePreference: input.effectivePreference,
    sort: input.sort,
    heroMode: input.heroMode,
    displayMode: input.displayMode,
    easiestWinner: input.winners.easiestWinner,
    cheapestWinner: input.winners.cheapestWinner?.key ?? null,
    fastestWinner: input.winners.fastestWinner?.key ?? null,
    bestOverallWinner: input.winners.bestOverallWinner,
    visibleOptionKeys: input.winners.visibleOptionKeys,
    hiddenOptionKeys: input.winners.hiddenOptionKeys,
  });
}
