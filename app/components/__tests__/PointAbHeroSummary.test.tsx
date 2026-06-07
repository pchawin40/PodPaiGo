/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import PointAbHeroSummary from '@/app/components/PointAbHeroSummary';
import type { PointAbRankingResult } from '@/lib/parking/pointAbRanking';

const ranking = {
  modes: [
    {
      key: 'parking',
      label: 'Destination parking',
      name: 'Garage A',
      cost: '$12',
      time: '35 min',
      confidence: 'Medium',
      pros: [],
      cons: [],
      status: 'best_pick',
      unavailable: false,
      hiddenByPreference: false,
    },
  ],
  recommendationMode: 'parking',
  recommendedTitle: 'Park at Garage A',
  recommendedReason: 'Best fit if you want to drive.',
  cheapestMode: { key: 'transit', label: 'Transit', cost: 3.25 },
  fastestMode: { key: 'rideshare', label: 'Rideshare', minutes: 28 },
  objectiveBestMode: 'parking',
} satisfies PointAbRankingResult;

describe('PointAbHeroSummary', () => {
  test('renders compact best, cheapest, fastest, and parking outlook cards', () => {
    render(
      <PointAbHeroSummary
        ranking={ranking}
        parkingOutlook={{
          title: 'Parking not confirmed yet',
          body: 'Compare options.',
          hints: ['4-hour limit may apply'],
          verifyNotice: 'Verify posted signs and lot rules.',
          showSearchNearbyParking: true,
          diagnostics: {
            accessType: 'Public',
            confidence: 'Not confirmed yet',
            reason: 'Test reason',
            recommendedAction: 'Check signs',
          },
        }}
      />,
    );

    expect(screen.getByText('Best')).toBeInTheDocument();
    expect(screen.getByText('Cheapest')).toBeInTheDocument();
    expect(screen.getByText('Fastest')).toBeInTheDocument();
    expect(screen.getByText('Parking outlook')).toBeInTheDocument();
    expect(screen.getByText('Drive + park')).toBeInTheDocument();
    expect(screen.getByText('Parking not confirmed yet')).toBeInTheDocument();
  });
});
