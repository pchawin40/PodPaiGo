import {
  RECOMMENDATION_STATUS_LABELS,
  mapComparisonVerdictToStatus,
  recommendationStatusBadgeClass,
  recommendationStatusLabel,
  type RecommendationStatus,
} from '../recommendationStatusBadge';

describe('RecommendationStatusBadge helpers', () => {
  test('labels cover all statuses', () => {
    expect(recommendationStatusLabel('best_pick')).toBe('Best pick');
    expect(recommendationStatusLabel('budget_option')).toBe('Budget');
    expect(recommendationStatusLabel('easy_backup')).toBe('Easy backup');
    expect(recommendationStatusLabel('cheapest')).toBe('Cheapest');
    expect(recommendationStatusLabel('fastest')).toBe('Fastest');
    expect(recommendationStatusLabel('hidden_by_preference')).toBe('Hidden');
    expect(recommendationStatusLabel('verify_rules')).toBe('Verify');
    expect(recommendationStatusLabel('route_needed')).toBe('Route needed');
    expect(recommendationStatusLabel('live_route_needed')).toBe('Route needed');
    expect(recommendationStatusLabel('unavailable')).toBe('Unavailable');
    expect(recommendationStatusLabel('not_recommended')).toBe('Not recommended');
    expect(Object.keys(RECOMMENDATION_STATUS_LABELS)).toHaveLength(12);
  });

  test('badge classes are dark-mode readable and consistent', () => {
    for (const status of Object.keys(RECOMMENDATION_STATUS_LABELS) as RecommendationStatus[]) {
      const className = recommendationStatusBadgeClass(status);
      expect(className).toContain('inline-flex');
      expect(className).toContain('h-7');
      expect(className).toContain('rounded-full');
      expect(className).toContain('dark:');
    }
  });

  test('maps comparison verdict strings to statuses', () => {
    expect(mapComparisonVerdictToStatus({ verdict: 'Best pick' })).toBe('best_pick');
    expect(
      mapComparisonVerdictToStatus({ verdict: 'Best pick', sort: 'cheapest', isCheapestMode: true }),
    ).toBe('cheapest');
    expect(
      mapComparisonVerdictToStatus({ verdict: 'Best pick', sort: 'fastest', isFastestMode: true }),
    ).toBe('fastest');
    expect(mapComparisonVerdictToStatus({ verdict: 'Easy backup' })).toBe('easy_backup');
    expect(mapComparisonVerdictToStatus({ verdict: 'Live route needed' })).toBe('live_route_needed');
    expect(mapComparisonVerdictToStatus({ verdict: 'Unavailable', unavailable: true })).toBe(
      'unavailable',
    );
    expect(mapComparisonVerdictToStatus({ verdict: 'Not recommended' })).toBe('not_recommended');
  });
});
