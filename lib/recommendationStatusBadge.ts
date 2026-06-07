export type RecommendationStatus =
  | 'best_pick'
  | 'budget_option'
  | 'fastest'
  | 'easiest'
  | 'easy_backup'
  | 'hidden_by_preference'
  | 'verify_rules'
  | 'unavailable'
  | 'not_recommended'
  | 'route_needed'
  | 'cheapest'
  | 'live_route_needed';

export const RECOMMENDATION_STATUS_LABELS: Record<RecommendationStatus, string> = {
  best_pick: 'Best pick',
  budget_option: 'Budget',
  fastest: 'Fastest',
  easiest: 'Easiest',
  easy_backup: 'Easy backup',
  hidden_by_preference: 'Hidden',
  verify_rules: 'Verify',
  unavailable: 'Unavailable',
  not_recommended: 'Not recommended',
  route_needed: 'Route needed',
  cheapest: 'Budget',
  live_route_needed: 'Route needed',
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
    case 'budget_option':
    case 'cheapest':
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100`;
    case 'fastest':
      return `${base} border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-100`;
    case 'easiest':
    case 'easy_backup':
      return `${base} border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100`;
    case 'hidden_by_preference':
      return `${base} border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-100`;
    case 'verify_rules':
    case 'live_route_needed':
    case 'route_needed':
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

  if (verdict === 'Hidden by preference') {
    return 'hidden_by_preference';
  }

  if (unavailable || verdict === 'Unavailable') {
    return 'unavailable';
  }

  if (verdict === 'Not recommended') {
    return 'not_recommended';
  }

  if (verdict === 'Verify rules') {
    return 'verify_rules';
  }

  if (verdict === 'Live route needed' || verdict === 'Open app') {
    return 'route_needed';
  }

  if (verdict === 'Best pick') {
    if (sort === 'cheapest' || isCheapestMode) return 'budget_option';
    if (sort === 'fastest' || isFastestMode) return 'fastest';
    return 'best_pick';
  }

  if (verdict === 'Budget option') {
    return 'budget_option';
  }

  if (verdict === 'Fastest') {
    return 'fastest';
  }

  if (sort === 'cheapest' && (verdict === 'Good backup' || verdict === 'Budget option')) {
    return 'easy_backup';
  }

  return 'easy_backup';
}
