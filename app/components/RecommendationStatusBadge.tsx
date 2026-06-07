import {
  mapComparisonVerdictToStatus,
  recommendationStatusBadgeClass,
  recommendationStatusLabel,
  type RecommendationStatus,
} from '../../lib/recommendationStatusBadge';

type RecommendationStatusBadgeProps = {
  status?: RecommendationStatus;
  verdict?: string;
  unavailable?: boolean;
  sort?: 'easiest' | 'cheapest' | 'fastest';
  isCheapestMode?: boolean;
  isFastestMode?: boolean;
  className?: string;
};

export default function RecommendationStatusBadge({
  status,
  verdict,
  unavailable,
  sort,
  isCheapestMode,
  isFastestMode,
  className = '',
}: RecommendationStatusBadgeProps) {
  const resolvedStatus =
    status ??
    (verdict
      ? mapComparisonVerdictToStatus({
          verdict,
          unavailable,
          sort,
          isCheapestMode,
          isFastestMode,
        })
      : 'easy_backup');

  return (
    <span
      className={`${recommendationStatusBadgeClass(resolvedStatus)} ${className}`.trim()}
    >
      {recommendationStatusLabel(resolvedStatus)}
    </span>
  );
}
