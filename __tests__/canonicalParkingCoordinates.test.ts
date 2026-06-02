import {
  applyCanonicalCoordinatesToOption,
  getParkingRouteCoordinates,
} from '../lib/parking/parkingCoordinates';
import { parkingRouteLinks, resolveParkingLotDestination } from '../lib/parking/routeDisplay';
import {
  estimateDriveMinutesFromStraightLineMiles,
  haversineMiles,
  parkingRouteMinutesAreTrusted,
  resolveParkingDriveMinutesDetailed,
} from '../lib/parking/routeMinutes';
import type { ParkingOption } from '../lib/types';

const MONROE = { lat: 47.8552, lng: -121.9709 };

// ParkWhiz-style entrance pin too close to SEA (~28m drive in prior bug).
const BAD_PROVIDER_COORDS = { lat: 47.4484, lng: -122.3084 };

// Canonical Google Places pin for Jiffy on International Blvd (~57–60m drive).
const JIFFY_GOOGLE_COORDS = { lat: 47.439, lng: -122.294 };

const JIFFY_OPTION: ParkingOption = {
  id: 'parkwhiz-jiffy',
  name: 'Jiffy Airport Parking - SeaTac',
  address: '1811 S 192nd St, SeaTac, WA 98188',
  type: 'off-airport',
  price: 42,
  priceDisplay: 'live',
  priceUnit: 'total',
  pricingConfidence: 'live',
  distance: 0,
  transferToTerminalMinutes: 12,
  availability: 80,
  trustStatus: 'live',
  sourceName: 'ParkWhiz',
  bookingProvider: 'ParkWhiz',
  serviceAirportCode: 'SEA',
  lastUpdated: '2026-01-01T00:00:00.000Z',
  assumptions: [],
  lat: BAD_PROVIDER_COORDS.lat,
  lng: BAD_PROVIDER_COORDS.lng,
  providerLat: BAD_PROVIDER_COORDS.lat,
  providerLng: BAD_PROVIDER_COORDS.lng,
};

describe('canonical parking coordinates', () => {
  test('ParkWhiz bad provider coords are replaced by Google Place canonical coords', () => {
    const canonical = applyCanonicalCoordinatesToOption(JIFFY_OPTION, {
      googlePlaceId: 'google-jiffy-place',
      googlePlaceName: 'Jiffy Airport Parking',
      googlePlaceAddress: '18836 International Blvd, SeaTac, WA 98188',
      canonicalLat: JIFFY_GOOGLE_COORDS.lat,
      canonicalLng: JIFFY_GOOGLE_COORDS.lng,
      canonicalAddress: '18836 International Blvd, SeaTac, WA 98188',
      coordinateSource: 'google_place',
      lat: JIFFY_GOOGLE_COORDS.lat,
      lng: JIFFY_GOOGLE_COORDS.lng,
      providerLat: BAD_PROVIDER_COORDS.lat,
      providerLng: BAD_PROVIDER_COORDS.lng,
    });

    expect(canonical.coordinateSource).toBe('google_place');
    expect(canonical.lat).toBe(JIFFY_GOOGLE_COORDS.lat);
    expect(canonical.lng).not.toBe(BAD_PROVIDER_COORDS.lng);
    expect(canonical.providerLat).toBe(BAD_PROVIDER_COORDS.lat);
    expect(canonical.providerLng).toBe(BAD_PROVIDER_COORDS.lng);
    expect(getParkingRouteCoordinates(canonical)).toEqual(JIFFY_GOOGLE_COORDS);
  });

  test('route link destination uses canonical Google place/address', () => {
    const option = applyCanonicalCoordinatesToOption(JIFFY_OPTION, {
      googlePlaceId: 'google-jiffy-place',
      googlePlaceAddress: '18836 International Blvd, SeaTac, WA 98188',
      canonicalLat: JIFFY_GOOGLE_COORDS.lat,
      canonicalLng: JIFFY_GOOGLE_COORDS.lng,
      canonicalAddress: '18836 International Blvd, SeaTac, WA 98188',
      coordinateSource: 'google_place',
      lat: JIFFY_GOOGLE_COORDS.lat,
      lng: JIFFY_GOOGLE_COORDS.lng,
    });

    const lotDestination = resolveParkingLotDestination(
      option,
      'Seattle-Tacoma International Airport',
    );

    expect(lotDestination.source).toBe('google-place');
    expect(lotDestination.googlePlaceId).toBe('google-jiffy-place');
    expect(lotDestination.destination).toContain('International');

    const links = parkingRouteLinks(option, {
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      airportCode: 'SEA',
      destinationKind: 'airport',
    });

    expect(links.routeToParkingUrl).toContain('google.com/maps/dir');
    expect(links.routeToParkingUrl).toContain(encodeURIComponent('International'));
  });

  test('drive minutes do not come from provider transfer/shuttle fields', () => {
    const resolution = resolveParkingDriveMinutesDetailed(
      {
        ...JIFFY_OPTION,
        originToParkingMinutes: undefined,
        transferToTerminalMinutes: 12,
        distance: 12,
        duration: 12,
      },
      { originLat: MONROE.lat, originLng: MONROE.lng },
    );

    expect(resolution.minutes).not.toBe(12);
  });

  test('Jiffy-style canonical coords produce longer drive estimate than bad provider pin', () => {
    const badMiles = haversineMiles(
      MONROE.lat,
      MONROE.lng,
      BAD_PROVIDER_COORDS.lat,
      BAD_PROVIDER_COORDS.lng,
    );
    const goodMiles = haversineMiles(
      MONROE.lat,
      MONROE.lng,
      JIFFY_GOOGLE_COORDS.lat,
      JIFFY_GOOGLE_COORDS.lng,
    );

    expect(goodMiles).toBeGreaterThan(badMiles);

    const badEstimate = estimateDriveMinutesFromStraightLineMiles(badMiles);
    const goodEstimate = estimateDriveMinutesFromStraightLineMiles(goodMiles);

    expect(goodEstimate).toBeGreaterThan(badEstimate);
    expect(goodEstimate).toBeGreaterThanOrEqual(50);

    const canonicalResolution = resolveParkingDriveMinutesDetailed(
      applyCanonicalCoordinatesToOption(JIFFY_OPTION, {
        canonicalLat: JIFFY_GOOGLE_COORDS.lat,
        canonicalLng: JIFFY_GOOGLE_COORDS.lng,
        coordinateSource: 'google_place',
        lat: JIFFY_GOOGLE_COORDS.lat,
        lng: JIFFY_GOOGLE_COORDS.lng,
      }),
      { originLat: MONROE.lat, originLng: MONROE.lng },
    );

    expect(canonicalResolution.minutes).toBeGreaterThanOrEqual(50);
    expect(canonicalResolution.minutes).toBeGreaterThan(badEstimate);
  });

  test('route destination uses google_place coords not provider coords when canonical is set', () => {
    const canonical = applyCanonicalCoordinatesToOption(JIFFY_OPTION, {
      googlePlaceId: 'google-jiffy-place',
      canonicalLat: JIFFY_GOOGLE_COORDS.lat,
      canonicalLng: JIFFY_GOOGLE_COORDS.lng,
      coordinateSource: 'google_place',
      lat: JIFFY_GOOGLE_COORDS.lat,
      lng: JIFFY_GOOGLE_COORDS.lng,
      providerLat: BAD_PROVIDER_COORDS.lat,
      providerLng: BAD_PROVIDER_COORDS.lng,
      originToParkingMinutes: 57,
      routeToParkingMinutes: 57,
      originDriveSource: 'google-routes',
      routesUsedCanonicalCoords: true,
      routeTargetLat: JIFFY_GOOGLE_COORDS.lat,
      routeTargetLng: JIFFY_GOOGLE_COORDS.lng,
      parkingRouteDebug: {
        routesApiDestination: `${JIFFY_GOOGLE_COORDS.lat},${JIFFY_GOOGLE_COORDS.lng}`,
        googleMapsUrlDestination: '18836 International Blvd, SeaTac, WA 98188',
      },
    });

    const routeCoords = getParkingRouteCoordinates(canonical);
    expect(routeCoords).toEqual(JIFFY_GOOGLE_COORDS);
    expect(routeCoords).not.toEqual(BAD_PROVIDER_COORDS);
    expect(canonical.parkingRouteDebug?.routesApiDestination).toBe(
      `${JIFFY_GOOGLE_COORDS.lat},${JIFFY_GOOGLE_COORDS.lng}`,
    );
    expect(parkingRouteMinutesAreTrusted(canonical)).toBe(true);
  });

  test('stale 28m provider route minutes are ignored when canonical coords differ', () => {
    const staleOption = applyCanonicalCoordinatesToOption(JIFFY_OPTION, {
      googlePlaceId: 'google-jiffy-place',
      canonicalLat: JIFFY_GOOGLE_COORDS.lat,
      canonicalLng: JIFFY_GOOGLE_COORDS.lng,
      coordinateSource: 'google_place',
      lat: JIFFY_GOOGLE_COORDS.lat,
      lng: JIFFY_GOOGLE_COORDS.lng,
      originToParkingMinutes: 28,
      routeToParkingMinutes: 28,
      originDriveSource: 'google-routes',
      routesUsedCanonicalCoords: false,
      routeTargetLat: BAD_PROVIDER_COORDS.lat,
      routeTargetLng: BAD_PROVIDER_COORDS.lng,
    });

    expect(parkingRouteMinutesAreTrusted(staleOption)).toBe(false);

    const resolution = resolveParkingDriveMinutesDetailed(staleOption, {
      originLat: MONROE.lat,
      originLng: MONROE.lng,
    });

    expect(resolution.minutes).not.toBe(28);
    expect(resolution.minutes).toBeGreaterThanOrEqual(50);
    expect(resolution.source).toBe('haversine-estimated');
  });
});
