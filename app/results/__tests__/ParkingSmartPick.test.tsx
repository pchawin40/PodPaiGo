/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ParkingSmartPick from '@/app/results/ParkingSmartPick';
import type { ParkingOption, TripData } from '@/lib/types';

jest.mock('@/app/results/ParkingLotVisual', () => function MockParkingLotVisual() {
  return <div data-testid="parking-lot-visual" />;
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
  test('shows a recommended parking card even when route timing is unavailable', () => {
    render(
      <ParkingSmartPick
        options={[routeUnavailableParking]}
        selectedOption={routeUnavailableParking}
        tripData={tripData}
        sortMode="easiest"
      />,
    );

    expect(screen.getByText('Jiffy Airport Parking Lot SEA')).toBeInTheDocument();
    expect(screen.getAllByText('Route timing unavailable').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        'Showing best available parking estimate. Open directions to confirm route timing.',
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Live price').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AirportParkingReservations').length).toBeGreaterThan(0);
  });
});
