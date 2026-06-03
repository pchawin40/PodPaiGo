/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuickGoPanel from '@/app/components/QuickGoPanel';
import { searchDestinations } from '@/lib/search/destinationSearch';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock('@/lib/search/destinationSearch', () => {
  const actual = jest.requireActual('@/lib/search/destinationSearch');
  return {
    ...actual,
    searchDestinations: jest.fn(),
  };
});

jest.mock('@/lib/analytics/trackEvent', () => ({
  trackEvent: jest.fn(),
}));

const searchDestinationsMock = searchDestinations as jest.MockedFunction<typeof searchDestinations>;

function ensureOriginEditorOpen() {
  const changeButton = screen.queryByRole('button', { name: 'Change' });
  if (changeButton) {
    fireEvent.click(changeButton);
  }
}

async function typeDestination(value: string) {
  fireEvent.change(screen.getByPlaceholderText('Where are you going?'), {
    target: { value },
  });

  await waitFor(() => {
    expect(searchDestinationsMock).toHaveBeenCalled();
  });
}

describe('QuickGoPanel', () => {
  beforeEach(() => {
    pushMock.mockReset();
    searchDestinationsMock.mockReset();
    window.localStorage.clear();
    window.localStorage.setItem(
      'podpaigo-recent-origins',
      JSON.stringify(['456 Oak Avenue, Sample Town, ST']),
    );
  });

  test('blocks quick-go search until a starting point is provided', async () => {
    searchDestinationsMock.mockResolvedValue([]);

    render(<QuickGoPanel />);

    await typeDestination('Grocery store');
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByText('Add a starting point to compare routes.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type an address or place')).toBeInTheDocument();
  });

  test('accepts typed origin and starts quick-go search with selected destination', async () => {
    searchDestinationsMock.mockResolvedValue([
      {
        id: 'geocoder:grocery',
        label: 'Neighborhood Grocery Store',
        address: '100 Market Street, Example City, ST',
        category: 'retail',
        source: 'geocoder',
        confidence: 'high',
      },
    ]);

    render(<QuickGoPanel />);

    await typeDestination('Grocery store');
    fireEvent.click(screen.getByRole('option', { name: /Neighborhood Grocery Store/i }));
    ensureOriginEditorOpen();
    fireEvent.change(screen.getByPlaceholderText('Type an address or place'), {
      target: { value: '123 Main Street, Example City, ST' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const path = String(pushMock.mock.calls[0]?.[0]);
    expect(path).toMatch(/^\/results\//);

    const storedKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith('podpaigo-trip-'),
    );
    expect(storedKey).toBeTruthy();

    const payload = JSON.parse(window.localStorage.getItem(storedKey!) || '{}') as {
      tripData?: Record<string, string>;
    };
    expect(payload.tripData?.type).toBe('quick-go');
    expect(payload.tripData?.destinationLabel).toBe('Neighborhood Grocery Store');
    expect(payload.tripData?.destinationSource).toBe('geocoder');
    expect(payload.tripData?.originSource).toBe('manual');
    expect(payload.tripData?.origin).toBe('123 Main Street, Example City, ST');
  });

  test('Fred Meyer Monroe search returns selectable destination', async () => {
    searchDestinationsMock.mockResolvedValue([
      {
        id: 'saved:fred-meyer',
        label: 'Fred Meyer Monroe',
        address: '19500 Hwy 2, Monroe, WA 98272',
        category: 'saved',
        source: 'saved',
        confidence: 'high',
      },
    ]);

    render(<QuickGoPanel />);

    await typeDestination('Fred Meyer Monroe');
    expect(screen.getByText('Fred Meyer Monroe')).toBeInTheDocument();
    expect(screen.getByText(/Saved destination/i)).toBeInTheDocument();
  });

  test('requires explicit saved-origin choice instead of silently using localStorage', async () => {
    searchDestinationsMock.mockResolvedValue([]);

    render(<QuickGoPanel />);

    await typeDestination('Coffee shop');
    fireEvent.click(screen.getByRole('button', { name: /Use typed destination/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    expect(pushMock).not.toHaveBeenCalled();

    ensureOriginEditorOpen();
    fireEvent.click(screen.getByRole('button', { name: /Use saved:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const storedKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith('podpaigo-trip-'),
    );
    const payload = JSON.parse(window.localStorage.getItem(storedKey!) || '{}') as {
      tripData?: Record<string, string>;
    };
    expect(payload.tripData?.originSource).toBe('saved');
    expect(payload.tripData?.origin).toBe('456 Oak Avenue, Sample Town, ST');
  });

  test('airport destination offers full airport planner prompt', async () => {
    searchDestinationsMock.mockResolvedValue([
      {
        id: 'airport:SEA',
        label: 'Seattle-Tacoma International Airport',
        address: 'Seattle-Tacoma International Airport (SEA), Seattle, WA',
        category: 'airport',
        source: 'airport',
        confidence: 'high',
        airportCode: 'SEA',
      },
    ]);

    render(<QuickGoPanel />);

    await typeDestination('SEA Airport');
    fireEvent.click(screen.getByRole('option', { name: /Seattle-Tacoma/i }));
    ensureOriginEditorOpen();
    fireEvent.change(screen.getByPlaceholderText('Type an address or place'), {
      target: { value: '123 Main Street, Example City, ST' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    expect(
      screen.getByText('This looks like an airport trip. Want to use the full airport planner?'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use full airport planner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue Quick Go' })).toBeInTheDocument();
  });

  test('blocks submit when multiple destination results exist without a selection', async () => {
    searchDestinationsMock.mockResolvedValue([
      {
        id: 'one',
        label: 'Fred Meyer Monroe',
        address: '19500 Hwy 2, Monroe, WA',
        category: 'saved',
        source: 'saved',
        confidence: 'high',
      },
      {
        id: 'two',
        label: 'Fred Meyer Lynnwood',
        address: '2902 164th St SW, Lynnwood, WA',
        category: 'saved',
        source: 'saved',
        confidence: 'high',
      },
    ]);

    render(<QuickGoPanel />);

    await typeDestination('Fred Meyer');
    ensureOriginEditorOpen();
    fireEvent.change(screen.getByPlaceholderText('Type an address or place'), {
      target: { value: '123 Main Street, Example City, ST' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a destination from the suggestions.')).toBeInTheDocument();
  });
});
