/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ParkingReviewsModal from '../ParkingReviewsModal';
import type { ParkingOption } from '@/lib/types';

const baseParking: ParkingOption = {
  id: 'lot-1',
  name: 'Jiffy Airport Parking',
  type: 'off-airport',
  price: 15,
  distance: 10,
  availability: 70,
  trustStatus: 'estimated',
  sourceName: 'Test',
  serviceAirportCode: 'SEA',
  lat: 47.44,
  lng: -122.29,
  lastUpdated: '2024-01-01T00:00:00.000Z',
  assumptions: [],
  googlePlaceId: 'place-abc',
  reviewScore: 4.5,
  reviewCount: 120,
  googleReviews: [
    {
      id: 'r1',
      authorName: 'Alex',
      displayName: 'Alex M.',
      rating: 5,
      relativeTimeDescription: '2 weeks ago',
      text: 'Easy shuttle.',
    },
  ],
};

describe('ParkingReviewsModal attribution', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('renders review author, rating, relative time, and Google Maps attribution', async () => {
    render(
      <ParkingReviewsModal
        parking={baseParking}
        open
        onClose={() => undefined}
        airportCode="SEA"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Alex M.')).toBeInTheDocument();
      expect(screen.getByText('2 weeks ago')).toBeInTheDocument();
      expect(screen.getByText('Easy shuttle.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Google Maps' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View all reviews on Google Maps' })).toBeInTheDocument();
    });
  });
});
