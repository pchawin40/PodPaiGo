export type RecommendationStatus =
  | 'best_pick'
  | 'easy_backup'
  | 'cheapest'
  | 'fastest'
  | 'live_route_needed'
  | 'unavailable'
  | 'not_recommended';

export const RECOMMENDATION_STATUS_LABELS: Record<RecommendationStatus, string> = {
  best_pick: 'Best pick',
  easy_backup: 'Easy backup',
  cheapest: 'Cheapest',
  fastest: 'Fastest',
  live_route_needed: 'Route needed',
  unavailable: 'Unavailable',
  not_recommended: 'Not recommended',
};

export function recommendationStatusLabel(status: RecommendationStatus): string {
  return RECOMMENDATION_STATUS_LABELS[status];
}

export function recommendationStatusBadgeClass(status: RecommendationStatus): string {
  const base =
    'inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-xs font-semibold leading-none';

  switch (status) {
    case 'best_pick':
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100`;
    case 'easy_backup':
      return `${base} border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100`;
    case 'cheapest':
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100`;
    case 'fastest':
      return `${base} border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-100`;
    case 'live_route_needed':
      return `${base} border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100`;
    case 'unavailable':
      return `${base} border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`;
    case 'not_recommended':
      return `${base} border-red-200 bg-red-50 text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100`;
  }
}

export function mapComparisonVerdictToStatus(args: {
  verdict: string;
  unavailable?: boolean;
  sort?: 'easiest' | 'cheapest' | 'fastest';
  isCheapestMode?: boolean;
  isFastestMode?: boolean;
}): RecommendationStatus {
  const { verdict, unavailable, sort, isCheapestMode, isFastestMode } = args;

  if (unavailable || verdict === 'Unavailable' || verdict === 'Hidden by preference') {
    return 'unavailable';
  }

  if (verdict === 'Not recommended') {
    return 'not_recommended';
  }

  if (verdict === 'Live route needed') {
    return 'live_route_needed';
  }

  if (verdict === 'Best pick') {
    if (sort === 'cheapest' || isCheapestMode) return 'cheapest';
    if (sort === 'fastest' || isFastestMode) return 'fastest';
    return 'best_pick';
  }

  if (sort === 'cheapest' && (verdict === 'Good backup' || verdict === 'Budget option')) {
    return 'easy_backup';
  }

  return 'easy_backup';
}
