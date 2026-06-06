/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ParkingReviewsModal from '../ParkingReviewsModal';
import type { ParkingOption } from '@/lib/types';
import {
  GOOGLE_LISTING_NOT_FOUND_MESSAGE,
  GOOGLE_REVIEWS_CAP_EXCEEDED_MESSAGE,
  GOOGLE_REVIEWS_NOT_AVAILABLE_MESSAGE,
  GOOGLE_REVIEWS_SAFE_MODE_MESSAGE,
} from '@/lib/parking/googlePlacesSafeMode';

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

function mockReviewsFetch(payload: Record<string, unknown>) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
}

describe('ParkingReviewsModal filter buttons', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('sort filter buttons use shared option selected/unselected classes', async () => {
    render(
      <ParkingReviewsModal
        parking={baseParking}
        open
        onClose={() => undefined}
        airportCode="SEA"
      />,
    );

    const mostRelevant = screen.getByRole('button', { name: 'Most relevant' });
    const newest = screen.getByRole('button', { name: 'Newest' });

    expect(mostRelevant.className).toContain('pod-option-button-selected');
    expect(newest.className).toContain('pod-option-button-unselected');
    expect(mostRelevant.className).toContain('pod-option-button--compact');
  });
});

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

describe('ParkingReviewsModal status messages', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  const parkingWithoutPlace: ParkingOption = {
    ...baseParking,
    googlePlaceId: undefined,
    googleReviews: undefined,
    reviewScore: undefined,
    reviewCount: undefined,
  };

  test('shows safe mode message when reviews are disabled', async () => {
    mockReviewsFetch({
      reviews: [],
      source: 'disabled',
      message: GOOGLE_REVIEWS_SAFE_MODE_MESSAGE,
      liveReviewsEnabled: false,
      place: null,
    });

    render(
      <ParkingReviewsModal
        parking={parkingWithoutPlace}
        open
        onClose={() => undefined}
        airportCode="SEA"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(GOOGLE_REVIEWS_SAFE_MODE_MESSAGE)).toBeInTheDocument();
    });
  });

  test('shows listing not found when no googlePlaceId is returned', async () => {
    mockReviewsFetch({
      reviews: [],
      source: 'no-listing',
      message: GOOGLE_LISTING_NOT_FOUND_MESSAGE,
      liveReviewsEnabled: true,
      place: null,
    });

    render(
      <ParkingReviewsModal
        parking={parkingWithoutPlace}
        open
        onClose={() => undefined}
        airportCode="SEA"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(GOOGLE_LISTING_NOT_FOUND_MESSAGE)).toBeInTheDocument();
    });
  });

  test('shows demo limit when review cap is exceeded', async () => {
    mockReviewsFetch({
      reviews: [],
      source: 'cap-exceeded',
      message: GOOGLE_REVIEWS_CAP_EXCEEDED_MESSAGE,
      liveReviewsEnabled: true,
      place: {
        googlePlaceId: 'place-abc',
        rating: 4.1,
        reviewCount: 40,
      },
    });

    render(
      <ParkingReviewsModal
        parking={parkingWithoutPlace}
        open
        onClose={() => undefined}
        airportCode="SEA"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(GOOGLE_REVIEWS_CAP_EXCEEDED_MESSAGE)).toBeInTheDocument();
    });
  });

  test('shows no reviews message when listing exists but reviews are empty', async () => {
    mockReviewsFetch({
      reviews: [],
      source: 'no-reviews',
      message: GOOGLE_REVIEWS_NOT_AVAILABLE_MESSAGE,
      liveReviewsEnabled: true,
      place: {
        googlePlaceId: 'place-abc',
        rating: 4.1,
        reviewCount: 40,
      },
    });

    render(
      <ParkingReviewsModal
        parking={parkingWithoutPlace}
        open
        onClose={() => undefined}
        airportCode="SEA"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(GOOGLE_REVIEWS_NOT_AVAILABLE_MESSAGE)).toBeInTheDocument();
    });
  });
});
