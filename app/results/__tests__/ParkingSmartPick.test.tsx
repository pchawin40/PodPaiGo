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

  test('shows Sort lenses only when internal debug is enabled', () => {
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
        showInternalDebug
      />,
    );

    expect(screen.getByText('Sort lenses')).toBeInTheDocument();
  });

  test('booking helper check-in/check-out details are collapsed until expanded', () => {
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

    const summary = screen.getByText('Booking helper · check-in & check-out times');
    const details = summary.closest('details');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details).toContainElement(screen.getByText('Copy times'));
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

  test('normalizes Google rating aliases and does not duplicate the review chip', () => {
    const routeAvailableParking = {
      ...routeUnavailableParking,
      routeUnavailable: false,
      routeUnavailableReason: undefined,
      googlePlaceId: 'places/jiffy',
      googleRating: 4.7,
      googleReviewCount: 981,
    } as ParkingOption & {
      googleRating: number;
      googleReviewCount: number;
    };

    render(
      <ParkingSmartPick
        options={[routeAvailableParking]}
        selectedOption={routeAvailableParking}
        tripData={tripData}
        sortMode="best"
        onShowReviews={jest.fn()}
      />,
    );

    expect(screen.getAllByText('★ 4.7 · 981 reviews')).toHaveLength(1);
  });

  test('renders one Google rating chip for general-trip parking when rating data exists', () => {
    const cityTripData: TripData = {
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Downtown Seattle',
      destinationKind: 'downtown',
      arrivalDate: '2026-06-01',
      arrivalTime: '18:00',
    };
    const cityParking = {
      ...routeUnavailableParking,
      id: 'securities-building-garage',
      name: 'Securities Building Garage (Lot #1) - Weekday Evening Rates',
      serviceAirportCode: undefined,
      type: 'off-airport',
      sourceName: 'ParkWhiz',
      bookingProvider: 'ParkWhiz',
      routeUnavailable: false,
      routeUnavailableReason: undefined,
      googlePlaceId: 'places/securities-building-garage',
      googleRating: 4.4,
      googleReviewCount: 312,
      parkingBufferMinutes: 8,
      walkingMinutes: 3,
      transferToTerminalMinutes: 3,
      driveToLotMinutes: 14,
    } as ParkingOption & {
      googleRating: number;
      googleReviewCount: number;
    };

    render(
      <ParkingSmartPick
        options={[cityParking]}
        selectedOption={cityParking}
        tripData={cityTripData}
        sortMode="best"
        onShowReviews={jest.fn()}
      />,
    );

    expect(screen.getAllByText('★ 4.4 · 312 reviews')).toHaveLength(1);
  });

  test('details show fallback route time instead of blank drive-to-lot timing', () => {
    const cityTripData: TripData = {
      type: 'general-trip',
      origin: 'Seattle, WA',
      destination: 'Downtown Seattle',
      destinationKind: 'downtown',
      arrivalDate: '2026-06-01',
      arrivalTime: '18:00',
    };
    const cityParking: ParkingOption = {
      ...routeUnavailableParking,
      id: 'skyway-luggage-lot',
      name: 'Skyway Luggage Employee Lot (Lot #84) - Weekday Evening Rates',
      serviceAirportCode: undefined,
      type: 'off-airport',
      sourceName: 'Test city parking',
      routeUnavailable: false,
      routeUnavailableReason: undefined,
      routeDestination: 'Seattle, WA',
      transferType: 'walk',
      transferToTerminalMinutes: undefined,
      walkingMinutes: undefined,
      shuttleMinutes: undefined,
      parkingBufferMinutes: undefined,
      originToParkingMinutes: undefined,
      routeToParkingMinutes: undefined,
      driveMinutes: undefined,
      duration: undefined,
      routeTime: { durationMinutes: '15' },
    } as ParkingOption & { routeTime: { durationMinutes: string } };

    render(
      <ParkingSmartPick
        options={[cityParking]}
        selectedOption={cityParking}
        tripData={cityTripData}
        sortMode="best"
      />,
    );

    expect(screen.getAllByText('15m total').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fallback route time').length).toBeGreaterThan(0);
    expect(screen.getAllByText('15m route').length).toBeGreaterThan(0);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  test('general-trip details show Drive to lot when driveToLotMinutes is attached', () => {
    const cityTripData: TripData = {
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Downtown Seattle',
      destinationKind: 'downtown',
      arrivalDate: '2026-06-01',
      arrivalTime: '18:00',
    };
    const cityParking: ParkingOption = {
      ...routeUnavailableParking,
      id: 'securities-building-garage',
      name: 'Securities Building Garage (Lot #1) - Weekday Evening Rates',
      serviceAirportCode: undefined,
      type: 'off-airport',
      sourceName: 'ParkWhiz',
      routeUnavailable: false,
      routeUnavailableReason: undefined,
      routeDestination: '1922 3rd Ave., Seattle, WA 98101',
      address: '1922 3rd Ave., Seattle, WA 98101',
      transferType: 'walk',
      parkingBufferMinutes: 8,
      transferToTerminalMinutes: 3,
      walkingMinutes: 3,
      originToParkingMinutes: undefined,
      routeToParkingMinutes: undefined,
      driveToLotMinutes: 14,
      routeLegs: {
        originToLot: {
          durationMinutes: 14,
          distanceMiles: 2,
          source: 'google-routes',
        },
      },
    };

    render(
      <ParkingSmartPick
        options={[cityParking]}
        selectedOption={cityParking}
        tripData={cityTripData}
        sortMode="best"
      />,
    );

    expect(screen.getAllByText('14m').length).toBeGreaterThan(0);
    expect(screen.getByText('Total to destination')).toBeInTheDocument();
    expect(screen.getAllByText('25m').length).toBeGreaterThan(0);
    expect(screen.queryByText('Partial to destination')).not.toBeInTheDocument();
  });

  test('general-trip details label park and walk total as partial when drive is missing', () => {
    const cityTripData: TripData = {
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Downtown Seattle',
      destinationKind: 'downtown',
      arrivalDate: '2026-06-01',
      arrivalTime: '18:00',
    };
    const cityParking: ParkingOption = {
      ...routeUnavailableParking,
      id: 'securities-building-garage',
      name: 'Securities Building Garage (Lot #1) - Weekday Evening Rates',
      serviceAirportCode: undefined,
      type: 'off-airport',
      sourceName: 'ParkWhiz',
      routeUnavailable: false,
      routeUnavailableReason: undefined,
      routeDestination: '1922 3rd Ave., Seattle, WA 98101',
      address: '1922 3rd Ave., Seattle, WA 98101',
      transferType: 'walk',
      parkingBufferMinutes: 8,
      transferToTerminalMinutes: 3,
      walkingMinutes: 3,
      originToParkingMinutes: undefined,
      routeToParkingMinutes: undefined,
      driveToLotMinutes: undefined,
      driveMinutes: undefined,
      duration: undefined,
      lat: undefined,
      lng: undefined,
    };

    render(
      <ParkingSmartPick
        options={[cityParking]}
        selectedOption={cityParking}
        tripData={cityTripData}
        sortMode="best"
      />,
    );

    expect(screen.getByText('Partial to destination')).toBeInTheDocument();
    expect(screen.getAllByText('11m partial').length).toBeGreaterThan(0);
    expect(screen.queryByText('11m total')).not.toBeInTheDocument();
  });

  test('does not show a fake exact walk time for city parking with unknown walk distance', () => {
    const cityTripData: TripData = {
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Lumen Field',
      destinationKind: 'stadium',
      arrivalDate: '2026-06-01',
      arrivalTime: '18:00',
    };
    const cityParking: ParkingOption = {
      ...routeUnavailableParking,
      id: 'stadium-garage',
      name: 'Stadium Garage',
      serviceAirportCode: undefined,
      type: 'official',
      sourceName: 'Estimated city parking',
      routeUnavailable: false,
      routeUnavailableReason: undefined,
      routeDestination: '100 Stadium Way, Seattle, WA',
      transferType: 'walk',
      transferToTerminalMinutes: undefined,
      walkingMinutes: undefined,
      shuttleMinutes: undefined,
      distance: undefined,
      parkingBufferMinutes: 8,
      originToParkingMinutes: 35,
      routeToParkingMinutes: 35,
    };

    render(
      <ParkingSmartPick
        options={[cityParking]}
        selectedOption={cityParking}
        tripData={cityTripData}
        sortMode="best"
      />,
    );

    expect(screen.getAllByText('Walk time not confirmed').length).toBeGreaterThan(0);
    expect(screen.queryByText('5m')).not.toBeInTheDocument();
  });
});
