/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import ParkingProviderActions from '@/app/results/ParkingProviderActions';

jest.mock('@/lib/monetization/trackOutboundClick', () => ({
  copyTextThenOpenWithTracking: jest.fn(),
  openTrackedUrl: jest.fn(),
}));

jest.mock('@/lib/analytics/trackEvent', () => ({
  trackEvent: jest.fn(),
}));

describe('ParkingProviderActions', () => {
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
});
