import fs from 'fs';
import path from 'path';

describe('analytics implementation avoids new Google Places usage', () => {
  const analyticsFiles = [
    'lib/analytics/trackEvent.ts',
    'lib/analytics/sanitizeAnalytics.ts',
    'lib/analytics/insertAnalyticsEvent.ts',
    'app/api/analytics/event/route.ts',
    'app/components/HomeAnalytics.tsx',
  ];

  it('does not add Google Places API calls in analytics modules', () => {
    for (const relativePath of analyticsFiles) {
      const contents = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
      expect(contents).not.toMatch(/googlePlaces|Google Places|places\.googleapis/i);
    }
  });
});
