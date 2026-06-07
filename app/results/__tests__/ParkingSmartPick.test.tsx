/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ParkingSmartPick from '@/app/results/ParkingSmartPick';
import type { ParkingOption, TripData } from '@/lib/types';

jest.mock('@/app/results/ParkingLotVisual', () => function MockParkingLotVisual({
  option,
}: {
  option: { googlePhotoName?: string; googlePhotoNames?: string[] };
}) {
  return (
    <div
      data-testid="parking-lot-visual"
      data-photo-name={option.googlePhotoName || option.googlePhotoNames?.[0] || ''}
    />
  );
});

const tripData: TripData = {
  type: 'one-way-departure',
  origin: 'Seattle, WA',
  destination: 'SEA Airport',
  destinationKind: 'airport',
  airportCode: 'SEA',
  departureDate: '2026-06-01',
  departureTime: '09:00',
};

const routeUnavailableParking: ParkingOption = {
  id: 'jiffy',
  name: 'Jiffy Airport Parking Lot SEA',
  serviceAirportCode: 'SEA',
  type: 'off-airport',
  price: 42,
  priceUnit: 'total',
  priceDisplay: 'live',
  pricingConfidence: 'live',
  priceConfidence: 'high',
  distance: 8,
  availability: 80,
  trustStatus: 'live',
  sourceName: 'AirportParkingReservations',
  bookingProvider: 'AirportParkingReservations',
  sourceLink: 'https://provider.example.com/jiffy',
  mapLink: 'https://maps.example.com/jiffy',
  lastUpdated: '2026-06-01T00:00:00.000Z',
  assumptions: [],
  routeUnavailable: true,
  routeUnavailableReason: 'Google route timing unavailable',
  routeDestination: 'Jiffy Airport Parking Lot SEA, Seatac, WA',
  transferType: 'shuttle',
  shuttleMinutes: 10,
};

describe('ParkingSmartPick fallback', () => {
  test('hides Sort lenses from default Smart Pick UI', () => {
    const routeAvailableParking: ParkingOption = {
      ...routeUnavailableParking,
      routeUnavailable: false,
      routeUnavailableReason: undefined,
    };

    render(
      <ParkingSmartPick
        options={[routeAvailableParking]}
        selectedOption={routeAvailableParking}
        tripData={tripData}
        sortMode="best"
      />,
    );

    expect(screen.queryByText('Sort lenses')).not.toBeInTheDocument();
  });

  test('shows a recommended parking card even when route timing is unavailable', () => {
    render(
      <ParkingSmartPick
        options={[routeUnavailableParking]}
        selectedOption={routeUnavailableParking}
        tripData={tripData}
        sortMode="easiest"
      />,
    );

    expect(screen.getAllByText('Jiffy Airport Parking Lot SEA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Route timing unavailable').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        'Showing best available parking estimate. Open directions to confirm route timing.',
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Live price').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AirportParkingReservations').length).toBeGreaterThan(0);
    expect(screen.queryByText('Check reviews')).not.toBeInTheDocument();
  });

  test('shows enriched Google photo metadata and a single review chip', () => {
    const onShowReviews = jest.fn();
    const routeAvailableParking: ParkingOption = {
      ...routeUnavailableParking,
      routeUnavailable: false,
      routeUnavailableReason: undefined,
    };

    render(
      <ParkingSmartPick
        options={[routeAvailableParking]}
        selectedOption={routeAvailableParking}
        tripData={tripData}
        sortMode="easiest"
        onShowReviews={onShowReviews}
        googleEnrichedParking={{
          [routeAvailableParking.id]: {
            googlePlaceId: 'places/jiffy',
            googleMapsUri: 'https://maps.google.com/?cid=jiffy',
            googlePhotoName: 'places/jiffy/photos/primary',
            googlePhotoNames: ['places/jiffy/photos/primary'],
            reviewScore: 4.6,
            reviewCount: 1248,
            googleReviews: [
              {
                id: 'review-1',
                source: 'google-places',
                rating: 5,
                relativeTimeDescription: '2 weeks ago',
                text: 'Fast shuttle and easy uncovered self parking.',
              },
              {
                id: 'review-2',
                source: 'google-places',
                rating: 4,
                text: 'Good price near SEA.',
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByTestId('parking-lot-visual')).toHaveAttribute(
      'data-photo-name',
      'places/jiffy/photos/primary',
    );
    expect(screen.getAllByText('★ 4.6 · 1,248 reviews')).toHaveLength(1);
    expect(screen.queryByText('Google reviews')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Fast shuttle and easy uncovered self parking.'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /4\.6/ }));
    expect(onShowReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        googlePlaceId: 'places/jiffy',
        googlePhotoName: 'places/jiffy/photos/primary',
        reviewScore: 4.6,
        reviewCount: 1248,
      }),
    );
  });
});
