/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BetaFeedbackButton from '../BetaFeedbackButton';
import type { ParkingOption, TripData } from '@/lib/types';

jest.mock('@/lib/analytics/trackEvent', () => ({
  trackEvent: jest.fn(),
}));

const tripData: TripData = {
  type: 'general-trip',
  origin: '123 Main St, Seattle, WA',
  destination: 'Downtown Seattle',
  destinationKind: 'downtown',
  arrivalDate: '2026-06-01',
  arrivalTime: '18:00',
};

const parking: ParkingOption = {
  id: 'lot-1',
  name: 'Public Garage',
  type: 'garage',
  price: 18,
  distance: 0.2,
  availability: 80,
  trustStatus: 'estimated',
  sourceName: 'ParkWhiz',
  bookingProvider: 'ParkWhiz',
  lastUpdated: '2026-06-01T00:00:00.000Z',
  assumptions: [],
};

describe('BetaFeedbackButton', () => {
  beforeEach(() => {
    window.history.pushState(
      {},
      '',
      '/results?type=general-trip&origin=123%20Main%20St%2C%20Seattle%2C%20WA#details',
    );
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, stored: true }),
    })) as jest.Mock;
  });

  test('submits expected feedback payload without raw origin context', async () => {
    render(<BetaFeedbackButton tripData={tripData} parking={parking} accessToken="token-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    fireEvent.change(screen.getByLabelText('Issue type'), {
      target: { value: 'wrong_route_time' },
    });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'The walk time looks too short.' },
    });
    fireEvent.change(screen.getByLabelText('Email (optional)'), {
      target: { value: 'beta@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/feedback',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-1',
          }),
        }),
      );
    });

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({
      issueType: 'wrong_route_time',
      message: 'The walk time looks too short.',
      email: 'beta@example.com',
      context: {
        resultType: 'recommendation_results',
        tripType: 'general-trip',
        provider: 'ParkWhiz',
        lotId: 'lot-1',
        lotName: 'Public Garage',
      },
    });
    expect(JSON.stringify(body.context)).not.toContain('123 Main St');
    expect(JSON.stringify(body.context)).not.toContain('origin=');
    expect(body.context.pageUrl).toBe('http://localhost/results');
    expect(body.context.pagePath).toBe('/results');
    expect(await screen.findByText('Thanks. Your feedback was sent.')).toBeInTheDocument();
  });
});
