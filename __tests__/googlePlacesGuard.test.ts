import {
  canMakeLiveGetPlaceCall,
  canMakeLivePhotoMediaCall,
  canMakeLiveSearchTextCall,
  isGoogleParkingDiscoveryLiveBlocked,
  isGooglePlacePhotosLiveBlocked,
  isGooglePlacesLiveBlocked,
} from '../lib/parking/googlePlacesGuard';
import {
  getMaxGooglePlacesCallsPerRequest,
  getMaxGoogleSearchTextPerRequest,
  resetPlacesRequestBudgetForTests,
  runWithPlacesRequestBudget,
  tryConsumePlacesRequestCall,
} from '../lib/apiUsage/placesRequestBudget';
import { shouldDiscoverParkingForTrip } from '../lib/trip/tripContext';
import type { TripData } from '../lib/types';

const CITY_TRIP: TripData = {
  type: 'general-trip',
  origin: 'Monroe, WA',
  destination: 'Bellevue, WA',
  destinationKind: 'downtown',
  arrivalDate: '2026-06-01',
  arrivalTime: '10:00',
  parkingDuration: 180,
};

const AIRPORT_TRIP: TripData = {
  type: 'one-way-departure',
  origin: 'Monroe, WA',
  destination: 'Seattle-Tacoma International Airport',
  destinationKind: 'airport',
  airportCode: 'SEA',
  departureDate: '2026-06-01',
  departureTime: '06:00',
};

describe('googlePlacesGuard emergency safeguards', () => {
  beforeEach(() => {
    resetPlacesRequestBudgetForTests();
    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.DISABLE_GOOGLE_PLACE_PHOTOS;
    delete process.env.DISABLE_GOOGLE_PARKING_DISCOVERY;
    delete process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('DISABLE_GOOGLE_PLACES=true prevents SearchText and GetPlace', () => {
    process.env.DISABLE_GOOGLE_PLACES = 'true';

    expect(
      canMakeLiveSearchTextCall({
        reason: 'place_match_search',
        route: 'resolveParkingGooglePlace',
        lotName: 'Jiffy Airport Parking',
        airportCode: 'SEA',
      }),
    ).toBe(false);

    expect(
      canMakeLiveGetPlaceCall({
        reason: 'place_details',
        route: 'fetchGooglePlaceDetailsLive',
        lotName: 'Jiffy Airport Parking',
        airportCode: 'SEA',
        cacheKey: 'place-123',
      }),
    ).toBe(false);
  });

  test('DISABLE_GOOGLE_PLACE_PHOTOS=true prevents photo media call', () => {
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'true';

    expect(
      canMakeLivePhotoMediaCall({
        reason: 'place_photo_media',
        route: '/api/google-place-photo',
        cacheKey: 'places/abc/photos/def',
      }),
    ).toBe(false);
  });

  test('DISABLE_GOOGLE_PARKING_DISCOVERY=true prevents discovery SearchText', () => {
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';

    expect(
      canMakeLiveSearchTextCall(
        {
          reason: 'airport_parking_discovery',
          route: 'searchAirportGoogleParking',
          airportCode: 'SEA',
        },
        { discovery: true },
      ),
    ).toBe(false);

    expect(isGoogleParkingDiscoveryLiveBlocked()).toBe(true);
    expect(isGooglePlacesLiveBlocked()).toBe(false);
  });

  test('parking discovery includes point A to B trips and airport departure parking trips', () => {
    expect(shouldDiscoverParkingForTrip(CITY_TRIP)).toBe(true);
    expect(shouldDiscoverParkingForTrip(AIRPORT_TRIP)).toBe(true);
    expect(
      shouldDiscoverParkingForTrip({
        type: 'one-way-arrival',
        destinationKind: 'airport',
      }),
    ).toBe(false);
    expect(
      shouldDiscoverParkingForTrip({
        type: 'dropoff-pickup',
        destinationKind: 'airport',
      }),
    ).toBe(false);
  });

  test('local dev default max live Places calls is 0 unless explicitly overridden', () => {
    process.env.NODE_ENV = 'development';

    expect(getMaxGoogleSearchTextPerRequest()).toBe(0);
    expect(getMaxGooglePlacesCallsPerRequest()).toBe(0);
    expect(
      tryConsumePlacesRequestCall('searchText'),
    ).toBe(false);

    process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '3';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '3';
    expect(getMaxGoogleSearchTextPerRequest()).toBe(3);
    expect(tryConsumePlacesRequestCall('searchText')).toBe(true);
  });

  test('request budget blocks live calls after cap is reached', async () => {
    process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '1';

    await runWithPlacesRequestBudget('test-search', async () => {
      expect(
        canMakeLiveSearchTextCall({
          reason: 'airport_parking_discovery',
          route: 'searchAirportGoogleParking',
          airportCode: 'SEA',
        }),
      ).toBe(true);

      expect(
        canMakeLiveSearchTextCall({
          reason: 'airport_parking_discovery',
          route: 'searchAirportGoogleParking',
          airportCode: 'SEA',
        }),
      ).toBe(false);
    });
  });

  test('recommendation engine calls destination parking for point A to B trips without airport code', async () => {
    const { RecommendationEngine } = await import('../lib/recommendationEngine');
    const getParkingOptionsSpy = jest
      .spyOn(RecommendationEngine.provider, 'getParkingOptions')
      .mockResolvedValue([]);

    await RecommendationEngine.generateRecommendations(CITY_TRIP);

    expect(getParkingOptionsSpy).toHaveBeenCalledTimes(1);
    expect(getParkingOptionsSpy).toHaveBeenCalledWith(
      CITY_TRIP.origin,
      CITY_TRIP.destination,
      expect.any(String),
      CITY_TRIP.parkingDuration,
      expect.objectContaining({
        destinationKind: 'downtown',
        airportCode: undefined,
      }),
    );

    getParkingOptionsSpy.mockRestore();
  });
});
