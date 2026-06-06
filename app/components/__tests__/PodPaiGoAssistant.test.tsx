/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PodPaiGoAssistant from '@/app/components/PodPaiGoAssistant';
import TripAssistantVoiceButton from '@/app/components/TripAssistantVoiceButton';
import type { ParsedTripAssistantResult } from '@/lib/ai/tripParseTypes';

const mockUseAuth = jest.fn();

jest.mock('@/app/components/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockParsed: ParsedTripAssistantResult = {
  mode: 'airport_trip',
  destinationText: null,
  originSource: 'manual',
  destinationCategory: null,
  originText: 'Monroe',
  airportCode: 'SEA',
  destinationCity: 'Las Vegas',
  airlineText: null,
  departureDate: '2026-11-15',
  departureTime: '12:00',
  timeAnchor: 'depart_at',
  returnDate: null,
  returnTime: null,
  transportAvailability: 'all',
  parkingPreference: 'nearby',
  tripType: 'one-way-departure',
  needsParking: true,
  needsLeaveTime: true,
  missingFields: [],
  confidence: 'high',
  parser: 'mock',
};

describe('PodPaiGoAssistant', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockUseAuth.mockReturnValue({
      session: null,
      user: null,
      loading: false,
      configured: true,
    });
    global.fetch = jest.fn();
  });

  function mockSignedInAuth() {
    mockUseAuth.mockReturnValue({
      session: { access_token: 'token-1' },
      user: { id: 'user-1', email: 'test@example.com' },
      loading: false,
      configured: true,
    });
  }

  test('assistant disabled state hides launcher', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ disabled: true, provider: 'mock', assistantLabel: 'Assistant disabled' }),
    } as Response);

    render(<PodPaiGoAssistant page="home" />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Ask PodPaiGo' })).not.toBeInTheDocument();
    });
  });

  test('mock chat response appears in drawer', async () => {
    mockSignedInAuth();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ disabled: false, provider: 'mock', assistantLabel: 'Basic assistant' }),
    } as Response);

    render(<PodPaiGoAssistant page="home" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ask PodPaiGo' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ask PodPaiGo' }));
    fireEvent.change(screen.getByLabelText('Message PodPaiGo assistant'), {
      target: { value: 'hello there' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByText('hello there')).toBeInTheDocument();
      expect(screen.getByText(/Hi!/i)).toBeInTheDocument();
      expect(screen.getByText('Mock parser in development')).toBeInTheDocument();
    });
  });

  test('info control opens feature tooltip on hover and click', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ disabled: false, provider: 'mock', assistantLabel: 'Basic assistant' }),
    } as Response);

    render(<PodPaiGoAssistant page="home" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'AI Trip Planner info' })).toBeInTheDocument();
    });

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'AI Trip Planner info' }));
    expect(screen.getByText(/Ask PodPaiGo can explain routes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'AI Trip Planner info' }));
    expect(screen.queryByText(/Ask PodPaiGo can explain routes/i)).not.toBeInTheDocument();
  });

  test('signed-out user sees sign-in prompt and does not call parse route', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ disabled: false, provider: 'mock', assistantLabel: 'Basic assistant' }),
    } as Response);

    render(<PodPaiGoAssistant page="trip" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ask PodPaiGo' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ask PodPaiGo' }));

    expect(screen.getAllByText('Sign in to use AI Trip Planner').length).toBeGreaterThan(0);
    expect(screen.getByText(/AI planning is available for signed-in users/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register or sign in' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/ai/parse-trip'))).toBe(
      false,
    );
  });

  test('trip parse opens confirm review', async () => {
    mockSignedInAuth();
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.includes('/api/ai/status')) {
        return {
          ok: true,
          json: async () => ({ disabled: false, provider: 'mock', assistantLabel: 'Basic assistant' }),
        } as Response;
      }

      if (url.includes('/api/ai/parse-trip') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ ...mockParsed, status: 'ready_for_review' }),
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<PodPaiGoAssistant page="trip" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ask PodPaiGo' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ask PodPaiGo' }));
    fireEvent.change(screen.getByLabelText('Message PodPaiGo assistant'), {
      target: {
        value: 'Weekend trip from Monroe to SEA Nov 15 to Nov 18 with parking',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByText('Review parsed trip')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm and run recommendations' })).toBeInTheDocument();
    });

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/ai/parse-trip'))).toBe(
      true,
    );
  });

  test('trip parse asks clarification before review when required fields are missing', async () => {
    mockSignedInAuth();
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.includes('/api/ai/status')) {
        return {
          ok: true,
          json: async () => ({ disabled: false, provider: 'mock', assistantLabel: 'Basic assistant' }),
        } as Response;
      }

      if (url.includes('/api/ai/parse-trip') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            ...mockParsed,
            mode: 'quick_go',
            destinationText: 'Pike Place Market',
            airportCode: null,
            originText: null,
            departureDate: '2026-06-06',
            departureTime: null,
            status: 'needs_clarification',
            missingFields: ['originText', 'targetTime'],
            clarificationQuestions: [
              'Where are you starting from, and what time do you want to arrive at Pike Place Market?',
            ],
          }),
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<PodPaiGoAssistant page="trip" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ask PodPaiGo' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ask PodPaiGo' }));
    fireEvent.change(screen.getByLabelText('Message PodPaiGo assistant'), {
      target: {
        value: 'I am going to Pike Place Market tomorrow. Plan commute for me.',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByText(/Where are you starting from/i)).toBeInTheDocument();
      expect(screen.queryByText('Review point A-to-B trip')).not.toBeInTheDocument();
    });
  });

  test('results explanation uses existing recommendation data', async () => {
    mockSignedInAuth();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ disabled: false, provider: 'mock', assistantLabel: 'Basic assistant' }),
    } as Response);

    render(
      <PodPaiGoAssistant
        page="results"
        resultsContext={{
          tripData: {
            type: 'one-way-departure',
            origin: 'Monroe, WA',
            destination: 'SEA',
            airportCode: 'SEA',
            destinationKind: 'airport',
            departureDate: '2026-11-15',
            departureTime: '12:00',
          },
          recommendation: {
            parking: [],
            rideshare: [],
            transit: [],
            tsaEstimate: {
              destination: 'SEA',
              waitTime: 20,
              status: 'estimated',
              trustStatus: 'estimated',
              sourceName: 'TSA estimate',
              assumptions: [],
            },
            leaveByTime: '08:30',
          },
          leaveByTime: '08:15',
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ask PodPaiGo' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ask PodPaiGo' }));
    fireEvent.change(screen.getByLabelText('Message PodPaiGo assistant'), {
      target: { value: 'When should I leave?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByText(/leave by 8:15 AM/i)).toBeInTheDocument();
      expect(screen.getByText(/already shown on this page/i)).toBeInTheDocument();
    });
  });
});

describe('TripAssistantVoiceButton', () => {
  test('voice button hides when browser speech recognition is unsupported', () => {
    const { container } = render(
      <TripAssistantVoiceButton onTranscript={() => undefined} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
