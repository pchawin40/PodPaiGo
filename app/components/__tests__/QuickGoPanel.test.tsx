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

const originalGeolocationDescriptor = Object.getOwnPropertyDescriptor(
  window.navigator,
  'geolocation',
);
const originalPermissionsDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'permissions');
const originalFetchDescriptor = Object.getOwnPropertyDescriptor(global, 'fetch');

function mockBrowserGeolocation(permissionState: PermissionState = 'prompt') {
  const getCurrentPosition = jest.fn(
    (success: PositionCallback) => {
      success({
        coords: {
          latitude: 47.855,
          longitude: -121.97,
          accuracy: 25,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    },
  );
  const query = jest.fn(async () => ({
    state: permissionState,
    name: 'geolocation' as PermissionName,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  } as PermissionStatus));

  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });
  Object.defineProperty(window.navigator, 'permissions', {
    configurable: true,
    value: { query },
  });

  return { getCurrentPosition, query };
}

function restoreBrowserGeolocation() {
  if (originalGeolocationDescriptor) {
    Object.defineProperty(window.navigator, 'geolocation', originalGeolocationDescriptor);
  } else {
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    });
  }

  if (originalPermissionsDescriptor) {
    Object.defineProperty(window.navigator, 'permissions', originalPermissionsDescriptor);
  } else {
    Object.defineProperty(window.navigator, 'permissions', {
      configurable: true,
      value: undefined,
    });
  }
}

function restoreFetch() {
  if (originalFetchDescriptor) {
    Object.defineProperty(global, 'fetch', originalFetchDescriptor);
  } else {
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  }
}

function mockReverseGeocodeFetch() {
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({ formattedAddress: 'Current location near Monroe, WA' }),
  } as Response));
  Object.defineProperty(global, 'fetch', {
    configurable: true,
    writable: true,
    value: fetchMock,
  });
  return fetchMock;
}

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
    restoreBrowserGeolocation();
    restoreFetch();
    window.localStorage.clear();
    window.localStorage.setItem(
      'podpaigo-recent-origins',
      JSON.stringify(['456 Oak Avenue, Sample Town, ST']),
    );
  });

  afterEach(() => {
    restoreBrowserGeolocation();
    restoreFetch();
  });

  test('defaults starting point to current location when browser geolocation exists', async () => {
    const geo = mockBrowserGeolocation('prompt');

    render(<QuickGoPanel />);

    await waitFor(() => {
      expect(screen.getByText('Current location')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  test('blocks quick-go search until a starting point is provided when geolocation is unavailable', async () => {
    searchDestinationsMock.mockResolvedValue([]);

    render(<QuickGoPanel />);

    await typeDestination('Grocery store');
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    await waitFor(() => {
      expect(pushMock).not.toHaveBeenCalled();
      expect(screen.getByText('Add a starting point to compare routes.')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Type an address or place')).toBeInTheDocument();
    });
  });

  test('resolves current location on submit and stores geolocation origin', async () => {
    const geo = mockBrowserGeolocation('prompt');
    mockReverseGeocodeFetch();
    searchDestinationsMock.mockResolvedValue([
      {
        id: 'google:grocery',
        label: 'Neighborhood Grocery Store',
        address: '100 Market Street, Example City, ST',
        category: 'retail',
        source: 'google',
        confidence: 'medium',
      },
    ]);

    render(<QuickGoPanel />);

    await typeDestination('Grocery store');
    fireEvent.click(screen.getByRole('option', { name: /Neighborhood Grocery Store/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    await waitFor(() => {
      expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledTimes(1);
    });

    const storedKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith('podpaigo-trip-'),
    );
    const payload = JSON.parse(window.localStorage.getItem(storedKey!) || '{}') as {
      tripData?: Record<string, string>;
    };
    expect(payload.tripData?.originSource).toBe('geolocation');
    expect(payload.tripData?.originLabel).toBe('Current location');
    expect(payload.tripData?.originLat).toBe('47.855');
    expect(payload.tripData?.originLng).toBe('-121.97');
  });

  test('passes resolved current-location coordinates into generic destination search', async () => {
    const geo = mockBrowserGeolocation('granted');
    mockReverseGeocodeFetch();
    searchDestinationsMock.mockResolvedValue([]);

    render(<QuickGoPanel />);

    await waitFor(() => {
      expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    });

    await typeDestination('grocery store');

    expect(searchDestinationsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: 'grocery store',
        originLat: 47.855,
        originLng: -121.97,
        originSource: 'geolocation',
      }),
      {},
    );
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

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledTimes(1);
    });
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

  test('origin autocomplete selects a hotel and stores coordinates for routing', async () => {
    searchDestinationsMock.mockImplementation(async ({ query }) => {
      if (/la quinta/i.test(query)) {
        return [
          {
            id: 'google:la-quinta-seattle',
            label: 'La Quinta Inn & Suites by Wyndham Seattle Downtown',
            address: '2224 8th Avenue, Seattle, WA',
            category: 'address',
            source: 'google',
            lat: 47.6172,
            lng: -122.3405,
            placeId: 'la-quinta-seattle',
            confidence: 'medium',
          },
        ];
      }

      if (/grocery/i.test(query)) {
        return [
          {
            id: 'geocoder:grocery',
            label: 'Neighborhood Grocery Store',
            address: '100 Market Street, Example City, ST',
            category: 'retail',
            source: 'geocoder',
            confidence: 'high',
          },
        ];
      }

      return [];
    });

    render(<QuickGoPanel />);

    ensureOriginEditorOpen();
    fireEvent.change(screen.getByPlaceholderText('Type an address or place'), {
      target: { value: 'la quinta inn' },
    });

    const hotel = await screen.findByRole('option', {
      name: /La Quinta Inn & Suites by Wyndham Seattle Downtown/i,
    });
    fireEvent.click(hotel);

    expect(screen.getByPlaceholderText('Type an address or place')).toHaveValue(
      'La Quinta Inn & Suites by Wyndham Seattle Downtown',
    );
    expect(
      screen.getByText(/Selected starting point: La Quinta Inn & Suites/i),
    ).toBeInTheDocument();

    await typeDestination('Grocery store');
    fireEvent.click(await screen.findByRole('option', { name: /Neighborhood Grocery Store/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledTimes(1);
    });

    const storedKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith('podpaigo-trip-'),
    );
    const payload = JSON.parse(window.localStorage.getItem(storedKey!) || '{}') as {
      tripData?: Record<string, string>;
    };
    expect(payload.tripData?.origin).toBe('2224 8th Avenue, Seattle, WA');
    expect(payload.tripData?.originLabel).toBe(
      'La Quinta Inn & Suites by Wyndham Seattle Downtown',
    );
    expect(payload.tripData?.originSource).toBe('google');
    expect(payload.tripData?.originLat).toBe('47.6172');
    expect(payload.tripData?.originLng).toBe('-122.3405');
    expect(payload.tripData?.originPlaceId).toBe('la-quinta-seattle');
  });

  test('origin autocomplete supports keyboard selection', async () => {
    searchDestinationsMock.mockResolvedValue([
      {
        id: 'google:la-quinta-downtown',
        label: 'La Quinta Downtown',
        address: '2224 8th Avenue, Seattle, WA',
        category: 'address',
        source: 'google',
        lat: 47.6172,
        lng: -122.3405,
        placeId: 'la-quinta-downtown',
        confidence: 'medium',
      },
      {
        id: 'google:la-quinta-tacoma',
        label: 'La Quinta Tacoma',
        address: '1425 East 27th Street, Tacoma, WA',
        category: 'address',
        source: 'google',
        lat: 47.2408,
        lng: -122.4112,
        placeId: 'la-quinta-tacoma',
        confidence: 'medium',
      },
    ]);

    render(<QuickGoPanel />);

    ensureOriginEditorOpen();
    const originInput = screen.getByPlaceholderText('Type an address or place');
    fireEvent.change(originInput, { target: { value: 'la quinta inn' } });

    await screen.findByRole('option', { name: /La Quinta Downtown/i });
    fireEvent.keyDown(originInput, { key: 'ArrowDown' });
    fireEvent.keyDown(originInput, { key: 'Enter' });

    expect(originInput).toHaveValue('La Quinta Tacoma');
    expect(screen.getByText(/Selected starting point: La Quinta Tacoma/i)).toBeInTheDocument();
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

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledTimes(1);
    });
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
