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

jest.mock('@/app/components/useTripPlanningLocation', () => ({
  useTripPlanningLocation: () => ({
    geolocationAvailable: true,
    geolocationDenied: false,
    currentLocationLabel: 'Monroe, WA',
    isLocating: false,
    refreshLocationLabel: jest.fn(),
  }),
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
      expect(screen.getByText('AI planner beta')).toBeInTheDocument();
      expect(screen.queryByText('Mock parser in development')).not.toBeInTheDocument();
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
      expect(screen.getByText('Ready to plan')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Plan Trip' })).toBeInTheDocument();
    });

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/ai/parse-trip'))).toBe(
      true,
    );
  });

  test('Yes quick reply advances to ready state without another parse call', async () => {
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
          json: async () => ({
            mode: 'quick_go',
            destinationText: 'Pike Place Market',
            originSource: 'unknown',
            destinationCategory: 'general',
            originText: null,
            airportCode: null,
            destinationCity: null,
            airlineText: null,
            departureDate: '2026-06-06',
            departureTime: '09:00',
            timeAnchor: 'arrive_by',
            returnDate: null,
            returnTime: null,
            transportAvailability: 'all',
            parkingPreference: 'nearby',
            tripType: 'quick-go',
            needsParking: true,
            needsLeaveTime: true,
            missingFields: ['originText'],
            confidence: 'medium',
            parser: 'mock',
            status: 'needs_clarification',
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
      expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    });

    const parseCallsBeforeYes = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/ai/parse-trip'),
    ).length;

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() => {
      expect(screen.getByText('Ready to plan')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Plan Trip' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Change start' })).not.toBeInTheDocument();
    });

    const parseCallsAfterYes = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/ai/parse-trip'),
    ).length;
    expect(parseCallsAfterYes).toBe(parseCallsBeforeYes);
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
      expect(screen.getByText(/Got it — Pike Place Market/i)).toBeInTheDocument();
      expect(screen.getByText(/I just need one detail/i)).toBeInTheDocument();
      expect(screen.getByText(/starting from|starting near/i)).toBeInTheDocument();
      expect(screen.queryByText('Review point A-to-B trip')).not.toBeInTheDocument();
      expect(screen.queryByText('A few details needed')).not.toBeInTheDocument();
    });
  });

  test('No quick reply opens origin input without another parse call', async () => {
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
          json: async () => ({
            mode: 'quick_go',
            destinationText: 'Pike Place Market',
            originSource: 'unknown',
            destinationCategory: 'general',
            originText: null,
            airportCode: null,
            destinationCity: null,
            airlineText: null,
            departureDate: '2026-06-06',
            departureTime: '09:00',
            timeAnchor: 'arrive_by',
            returnDate: null,
            returnTime: null,
            transportAvailability: 'all',
            parkingPreference: 'nearby',
            tripType: 'quick-go',
            needsParking: true,
            needsLeaveTime: true,
            missingFields: ['originText'],
            confidence: 'medium',
            parser: 'mock',
            status: 'needs_clarification',
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
      expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
    });

    const parseCallsBeforeNo = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/ai/parse-trip'),
    ).length;

    fireEvent.click(screen.getByRole('button', { name: 'No' }));

    await waitFor(() => {
      expect(screen.getByText(/No problem — where should I start from/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Message PodPaiGo assistant')).toHaveAttribute(
        'placeholder',
        'Enter a starting address…',
      );
    });

    const parseCallsAfterNo = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/ai/parse-trip'),
    ).length;
    expect(parseCallsAfterNo).toBe(parseCallsBeforeNo);
  });

  test('Edit details opens compact review panel', async () => {
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
            mode: 'quick_go',
            destinationText: 'Pike Place Market',
            originSource: 'current_location',
            destinationCategory: 'general',
            originText: null,
            airportCode: null,
            destinationCity: null,
            airlineText: null,
            departureDate: '2026-06-06',
            departureTime: '09:00',
            timeAnchor: 'arrive_by',
            returnDate: null,
            returnTime: null,
            transportAvailability: 'all',
            parkingPreference: 'nearby',
            tripType: 'quick-go',
            needsParking: true,
            needsLeaveTime: true,
            missingFields: [],
            confidence: 'medium',
            parser: 'mock',
            status: 'ready_for_review',
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
      expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));

    await waitFor(() => {
      expect(screen.getByText('Trip details')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Change' }).length).toBeGreaterThan(0);
      expect(screen.getByLabelText('Message PodPaiGo assistant')).toHaveAttribute(
        'placeholder',
        'Update a field above, or tap Plan trip…',
      );
    });
  });

  test('ready state uses conversational placeholder', async () => {
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
      target: { value: 'Weekend trip from Monroe to SEA Nov 15 to Nov 18 with parking' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Message PodPaiGo assistant')).toHaveAttribute(
        'placeholder',
        'Ask a change, or tap Plan trip…',
      );
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
