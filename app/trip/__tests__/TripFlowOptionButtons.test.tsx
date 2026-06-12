/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TripFlow from '../TripFlow';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock('@/lib/analytics/trackEvent', () => ({
  trackEvent: jest.fn(),
}));

function mockFetch() {
  Object.defineProperty(global, 'fetch', {
    configurable: true,
    writable: true,
    value: jest.fn(async () => ({
      ok: true,
      json: async () => ({
        airportCode: 'SEA',
        sourceName: 'test',
        trustStatus: 'estimated',
        lanes: {
          standard: { available: true, waitMinutes: 12 },
          precheck: { available: true, waitMinutes: 5 },
          clear: { available: true, waitMinutes: 4 },
          clearPrecheck: { available: true, waitMinutes: 3 },
        },
      }),
    })),
  });
}

describe('TripFlow option button selected state', () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.localStorage.clear();
    mockFetch();
  });

  test('trip type cards show selected class on default choice', () => {
    render(<TripFlow />);

    const localTripButton = screen.getByRole('button', { name: /Compare a local trip/i });
    const airportTripButton = screen.getByRole('button', { name: /Airport trip/i });

    expect(localTripButton.className).toContain('pod-option-button-selected');
    expect(airportTripButton.className).toContain('pod-option-button-unselected');
    expect(within(localTripButton).getByText('Selected')).toBeInTheDocument();
  });

  test('airport readiness options swap selected class on click', async () => {
    render(<TripFlow />);

    fireEvent.click(screen.getByRole('button', { name: /Airport trip/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Airport readiness details are collapsed by default; expand to reach security options.
    fireEvent.click(screen.getByRole('button', { name: /Airport readiness/i }));

    const securitySection = await screen.findByText('Security');
    const securityGrid = securitySection.parentElement;
    expect(securityGrid).toBeTruthy();

    const standardButton = within(securityGrid!).getByRole('button', { name: /Standard TSA/i });
    const clearPrecheckButton = within(securityGrid!).getByRole('button', {
      name: /CLEAR \+ PreCheck/i,
    });

    expect(standardButton.className).toContain('pod-option-button-selected');
    expect(clearPrecheckButton.className).toContain('pod-option-button-unselected');

    fireEvent.click(clearPrecheckButton);

    expect(clearPrecheckButton.className).toContain('pod-option-button-selected');
    expect(standardButton.className).toContain('pod-option-button-unselected');
  });

  test('flying-out submission still includes selected security option', async () => {
    render(<TripFlow />);

    fireEvent.click(screen.getByRole('button', { name: /Airport trip/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByPlaceholderText('Start typing your address'), {
      target: { value: 'Monroe, WA' },
    });
    fireEvent.change(screen.getByLabelText('Parking check-in date'), {
      target: { value: '2026-11-13' },
    });
    fireEvent.change(screen.getByLabelText('Departure time'), {
      target: { value: '09:00' },
    });

    // Airport readiness details are collapsed by default; expand to reach security options.
    fireEvent.click(screen.getByRole('button', { name: /Airport readiness/i }));

    const securitySection = await screen.findByText('Security');
    const securityGrid = securitySection.parentElement;
    expect(securityGrid).toBeTruthy();

    fireEvent.click(
      within(securityGrid!).getByRole('button', { name: /CLEAR \+ PreCheck/i }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'See options' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledTimes(1);
    });

    const storedKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith('podpaigo-trip-'),
    );
    expect(storedKey).toBeTruthy();

    const payload = JSON.parse(window.localStorage.getItem(storedKey!) || '{}') as {
      query?: string;
    };
    const params = new URLSearchParams(payload.query || '');
    expect(params.get('security')).toBe('clear-precheck');
    expect(params.get('intent')).toBe('flying-out');
  });
});
