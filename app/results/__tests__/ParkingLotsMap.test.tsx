/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import ParkingLotsMap from '../ParkingLotsMap';
import type { ParkingOption } from '@/lib/types';
import { loadGoogleMaps } from '../../../lib/googleMapsLoader';

let mockGoogleMapsFailureListener: ((error: Error) => void) | null = null;
const mockUnsubscribeGoogleMapsFailure = jest.fn();

jest.mock('../../../lib/googleMapsLoader', () => ({
  loadGoogleMaps: jest.fn(),
  onGoogleMapsLoadFailure: jest.fn((listener: (error: Error) => void) => {
    mockGoogleMapsFailureListener = listener;
    return mockUnsubscribeGoogleMapsFailure;
  }),
}));

const mockLoadGoogleMaps = loadGoogleMaps as jest.MockedFunction<typeof loadGoogleMaps>;

const baseParkingLot: ParkingOption = {
  id: 'lot-1',
  name: 'Pike Place Garage',
  type: 'off-airport',
  price: 18,
  availability: 80,
  trustStatus: 'live',
  sourceName: 'Test Parking',
  lastUpdated: '2026-06-10T00:00:00.000Z',
  assumptions: [],
  address: '1531 Western Ave, Seattle, WA',
  lat: 47.6088,
  lng: -122.3423,
  availabilityStatus: 'available',
};

function setBrowserMapsKey(value: string | undefined) {
  if (value) {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = value;
  } else {
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  }
}

function setupGoogleMapsMock() {
  const mapInstances: Array<{
    fitBounds: jest.Mock;
    setCenter: jest.Mock;
    setZoom: jest.Mock;
    getZoom: jest.Mock;
  }> = [];

  const Map = jest.fn().mockImplementation(() => {
    const instance = {
      fitBounds: jest.fn(),
      setCenter: jest.fn(),
      setZoom: jest.fn(),
      getZoom: jest.fn(() => 11),
    };
    mapInstances.push(instance);
    return instance;
  });
  const AdvancedMarkerElement = jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
  }));
  const PinElement = jest.fn().mockImplementation((options) => ({ options }));
  const LatLngBounds = jest.fn().mockImplementation(() => ({
    extend: jest.fn(),
  }));
  const InfoWindow = jest.fn().mockImplementation(() => ({
    open: jest.fn(),
  }));
  const addListenerOnce = jest.fn((_map, _event, callback: () => void) => callback());
  const trigger = jest.fn();
  const importLibrary = jest.fn(async (library: string) => {
    if (library === 'maps') return { Map };
    if (library === 'marker') return { AdvancedMarkerElement, PinElement };
    throw new Error(`Unexpected Google Maps library: ${library}`);
  });

  (globalThis as typeof globalThis & { google?: unknown }).google = {
    maps: {
      importLibrary,
      LatLngBounds,
      InfoWindow,
      event: {
        addListenerOnce,
        trigger,
      },
    },
  };

  return {
    AdvancedMarkerElement,
    importLibrary,
    mapInstances,
    Map,
    trigger,
  };
}

describe('ParkingLotsMap fallback and loader behavior', () => {
  beforeEach(() => {
    cleanup();
    jest.clearAllMocks();
    mockGoogleMapsFailureListener = null;
    setBrowserMapsKey(undefined);
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
    delete (globalThis as typeof globalThis & { google?: unknown }).google;
  });

  afterEach(() => {
    cleanup();
  });

  test('renders a friendly fallback and Google Maps link when the public browser key is missing', async () => {
    render(
      <ParkingLotsMap
        destinationLatLng={{ lat: 47.6097, lng: -122.3331 }}
        destinationLabel="Downtown Seattle"
        parkingOptions={[baseParkingLot]}
      />,
    );

    expect(await screen.findByText('Map could not load. Open in Google Maps instead.')).toBeInTheDocument();
    expect(mockLoadGoogleMaps).not.toHaveBeenCalled();
    expect(screen.getByTestId('parking-lots-map-fallback')).toHaveClass('min-h-[360px]');

    const link = screen.getByRole('link', { name: 'Open in Google Maps' });
    expect(link).toHaveAttribute('href', expect.stringContaining('query=47.6097%2C-122.3331'));
  });

  test('uses the selected lot address for the primary fallback link when coordinates are unavailable', async () => {
    const addressOnlyLot: ParkingOption = {
      ...baseParkingLot,
      id: 'address-lot',
      name: '1935 2nd Ave. Lot',
      lat: undefined,
      lng: undefined,
      address: '1935 2nd Ave, Seattle, WA',
    };

    render(
      <ParkingLotsMap
        destinationLabel="Seattle"
        parkingOptions={[addressOnlyLot]}
        selectedParkingId="address-lot"
      />,
    );

    expect(await screen.findByText('Map could not load. Open in Google Maps instead.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute(
      'href',
      expect.stringContaining('1935%202nd%20Ave%2C%20Seattle%2C%20WA'),
    );
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      expect.stringContaining('1935%202nd%20Ave%2C%20Seattle%2C%20WA'),
    );
  });

  test('does not crash and shows fallback when Google Maps loading rejects', async () => {
    setBrowserMapsKey('browser-test-key');
    mockLoadGoogleMaps.mockRejectedValue(new Error('Google Maps authentication failed.'));

    render(
      <ParkingLotsMap
        destinationLatLng={{ lat: 47.6097, lng: -122.3331 }}
        destinationLabel="Downtown Seattle"
        parkingOptions={[baseParkingLot]}
      />,
    );

    expect(await screen.findByText('Map could not load. Open in Google Maps instead.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Google Maps' })).toBeInTheDocument();
  });

  test('shows fallback when the loader reports a later Google Maps auth failure', async () => {
    setBrowserMapsKey('browser-test-key');
    mockLoadGoogleMaps.mockImplementation(() => new Promise(() => undefined));

    render(
      <ParkingLotsMap
        destinationLatLng={{ lat: 47.6097, lng: -122.3331 }}
        destinationLabel="Downtown Seattle"
        parkingOptions={[baseParkingLot]}
      />,
    );

    await waitFor(() => expect(mockGoogleMapsFailureListener).toBeTruthy());

    act(() => {
      mockGoogleMapsFailureListener?.(new Error('Google Maps authentication failed.'));
    });

    expect(await screen.findByText('Map could not load. Open in Google Maps instead.')).toBeInTheDocument();
  });

  test('keeps a stable mobile-sized container and initializes the map when Google Maps is available', async () => {
    setBrowserMapsKey('browser-test-key');
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID = 'parking-map-id';
    mockLoadGoogleMaps.mockResolvedValue(undefined);
    const googleMapsMock = setupGoogleMapsMock();

    render(
      <ParkingLotsMap
        destinationLatLng={{ lat: 47.6097, lng: -122.3331 }}
        destinationLabel="Downtown Seattle"
        parkingOptions={[baseParkingLot]}
      />,
    );

    const shell = screen.getByTestId('parking-lots-map-shell');
    expect(shell).toHaveClass('h-[min(68dvh,620px)]');
    expect(shell).toHaveClass('min-h-[360px]');

    await waitFor(() => expect(mockLoadGoogleMaps).toHaveBeenCalledWith('browser-test-key'));
    await waitFor(() => expect(googleMapsMock.Map).toHaveBeenCalled());

    expect(googleMapsMock.importLibrary).toHaveBeenCalledWith('maps');
    expect(googleMapsMock.importLibrary).toHaveBeenCalledWith('marker');
    expect(googleMapsMock.Map).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        center: { lat: 47.6097, lng: -122.3331 },
        mapId: 'parking-map-id',
      }),
    );
    expect(googleMapsMock.mapInstances[0].fitBounds).toHaveBeenCalled();
    expect(screen.queryByText('Map could not load. Open in Google Maps instead.')).not.toBeInTheDocument();
  });
});
