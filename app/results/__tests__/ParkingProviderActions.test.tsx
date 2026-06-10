/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import ParkingProviderActions from '@/app/results/ParkingProviderActions';

jest.mock('@/lib/monetization/trackOutboundClick', () => ({
  copyTextThenOpenWithTracking: jest.fn(),
  openTrackedUrl: jest.fn(),
}));

jest.mock('@/lib/analytics/trackEvent', () => ({
  trackEvent: jest.fn(),
}));

const { copyTextThenOpenWithTracking } = jest.requireMock('@/lib/monetization/trackOutboundClick');
const { trackEvent } = jest.requireMock('@/lib/analytics/trackEvent');

describe('ParkingProviderActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders reserve, route, and parking-to-terminal actions', () => {
    render(
      <ParkingProviderActions
        bookingUrl="https://book.example/lot"
        providerUrl="https://book.example/lot"
        routeToParkingUrl="https://maps.example/to-lot"
        parkingToTerminalUrl="https://maps.example/to-terminal"
        searchQuery="SEA parking"
      />,
    );

    expect(screen.getByRole('button', { name: 'Reserve parking' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Route to parking' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parking to terminal' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View provider' })).not.toBeInTheDocument();
  });

  test('shows view provider when no booking link exists', () => {
    render(
      <ParkingProviderActions
        bookingUrl={null}
        providerUrl="https://provider.example"
        routeToParkingUrl="https://maps.example/to-lot"
        searchQuery="Parking"
      />,
    );

    expect(screen.getByRole('button', { name: 'View provider' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Route to parking' })).toBeInTheDocument();
  });

  test('tracks reserve parking click with safe metadata before provider handoff', () => {
    render(
      <ParkingProviderActions
        bookingUrl="https://book.example/lot"
        providerUrl="https://book.example/lot"
        routeToParkingUrl="https://maps.example/to-lot"
        searchQuery="SEA parking"
        provider="ParkWhiz"
        airportCode="SEA"
        parkingLotId="lot-1"
        parkingLotName="Public Garage"
        tripType="general-trip"
        resultType="parking"
        rank={2}
        priceTotal={18}
        priceLabel="$18 total"
        driveToLotMinutes={12}
        walkMinutes={4}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reserve parking' }));

    expect(trackEvent).toHaveBeenCalledWith('reserve_parking_clicked', {
      accessToken: undefined,
      eventProperties: expect.objectContaining({
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotId: 'lot-1',
        lotName: 'Public Garage',
        tripType: 'general-trip',
        resultType: 'parking',
        rank: 2,
        priceTotal: 18,
        priceLabel: '$18 total',
        driveToLotMinutes: 12,
        walkMinutes: 4,
      }),
    });
    expect(copyTextThenOpenWithTracking).toHaveBeenCalledWith(
      'SEA parking',
      'https://book.example/lot',
      expect.objectContaining({
        eventType: 'reserve_parking',
        provider: 'ParkWhiz',
        parkingLotId: 'lot-1',
        metadata: expect.objectContaining({
          lotName: 'Public Garage',
          rank: 2,
          priceTotal: 18,
        }),
      }),
      undefined,
    );
  });
});
