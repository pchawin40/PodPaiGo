import { buildStreetMeterParkingOption } from '../streetMeterParking';
import {
  computePointAbCanonicalWinners,
  resolvePointAbEffectivePreference,
  resolvePointAbDisplayRecommendationMode,
} from '../pointAbCanonicalFlow';
import { rankPointAbModes } from '../pointAbRanking';
import type { ParkingOption, RideshareOption, TransitOption } from '../../types';

const brightonTrip = {
  type: 'general-trip' as const,
  origin: 'Bellevue, WA',
  destination: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
  arrivalDate: '2026-06-07',
  arrivalTime: '11:00',
  parkingDuration: 120,
  transportAvailability: 'all' as const,
};

const garageParking = {
  id: 'brighton-garage',
  name: '1st Avenue Garage',
  type: 'off-airport' as const,
  price: 18,
  priceUnit: 'total' as const,
  distance: 0.1,
  originToParkingMinutes: 38,
  routeToParkingMinutes: 38,
  availability: 80,
  trustStatus: 'estimated' as const,
  sourceName: 'Test',
  lastUpdated: '2026-06-01T00:00:00Z',
  assumptions: [],
  transferToTerminalMinutes: 4,
  googleParkingOptions: { paidGarageParking: true },
} satisfies ParkingOption;

const rideshare = {
  id: 'uber',
  name: 'UberX',
  price: 48,
  duration: 43,
  driveMinutes: 38,
  pickupWaitMinutes: 5,
  totalOptionMinutes: 43,
  availability: 80,
  trustStatus: 'estimated' as const,
  sourceName: 'Test',
  lastUpdated: '2026-06-01T00:00:00Z',
  assumptions: [],
} satisfies RideshareOption;

const transit = {
  id: 'transit',
  name: 'Transit',
  price: 3.25,
  duration: 74,
  frequency: 12,
  availability: 80,
  trustStatus: 'verified-source' as const,
  sourceName: 'Test',
  lastUpdated: '2026-06-01T00:00:00Z',
  assumptions: [],
} satisfies TransitOption;

function rankBrighton(noParkingPreferred: boolean) {
  const streetMeterParking = buildStreetMeterParkingOption({
    destination: brightonTrip.destination,
    arrivalDate: brightonTrip.arrivalDate,
    arrivalTime: brightonTrip.arrivalTime,
    durationMinutes: brightonTrip.parkingDuration,
    driveMinutes: 38,
    isAirportTrip: false,
  });

  return rankPointAbModes({
    tripData: brightonTrip,
    sort: 'cheapest',
    destinationLabel: brightonTrip.destination,
    noParkingPreferred,
    bestParking: garageParking,
    parkingOptions: [garageParking],
    parkingTotal: 18,
    parkingMinutes: 46,
    bestRideOption: rideshare,
    ridePrice: 48,
    rideDuration: 43,
    bestTransitOption: transit,
    transitCost: 3.25,
    transitDuration: 74,
    transitCostDisplay: '$3.25 est.',
    hasReliableTransit: true,
    bestParkRideAccess: null,
    parkRideCost: null,
    parkRideDuration: null,
    parkRideReliable: false,
    streetMeterParking,
    driveMinutes: 38,
  });
}

describe('pointAbCanonicalFlow', () => {
  test('resolvePointAbEffectivePreference prioritizes in-page business travel mode', () => {
    expect(
      resolvePointAbEffectivePreference({
        businessTravelMode: 'no_parking',
        tripParkingPreference: 'destination',
        showParkingAnyway: false,
      }),
    ).toMatchObject({
      noParkingPreferred: true,
      parkingVisibilityMode: 'hidden_by_preference',
    });

    expect(
      resolvePointAbEffectivePreference({
        businessTravelMode: 'standard',
        tripParkingPreference: 'none',
        showParkingAnyway: false,
      }),
    ).toMatchObject({
      noParkingPreferred: true,
      parkingVisibilityMode: 'hidden_by_preference',
    });

    expect(
      resolvePointAbEffectivePreference({
        businessTravelMode: 'standard',
        tripParkingPreference: 'destination',
        showParkingAnyway: false,
      }),
    ).toMatchObject({
      noParkingPreferred: false,
      parkingVisibilityMode: 'visible',
    });
  });

  test('Brighton Jones no-parking -> driving preference updates hero away from transit-only winners', () => {
    const hiddenParking = rankBrighton(true);
    const driving = rankBrighton(false);

    expect(hiddenParking.displayRecommendationMode).toBe('transit');
    expect(hiddenParking.cheapestMode).toMatchObject({ key: 'transit', cost: 3.25 });
    expect(hiddenParking.fastestMode).toMatchObject({ key: 'rideshare', minutes: 43 });
    expect(hiddenParking.canonicalWinners.hiddenOptionKeys).toEqual(
      expect.arrayContaining(['parking', 'street-meter']),
    );
    expect(hiddenParking.canonicalWinners.visibleOptionKeys).toEqual(
      expect.arrayContaining(['rideshare', 'transit']),
    );

    expect(driving.displayRecommendationMode).not.toBe('transit');
    expect(driving.recommendationMode).toBe('street-meter');
    expect(driving.cheapestMode?.key).toBe('street-meter');
    expect(driving.canonicalWinners.visibleOptionKeys).toEqual(
      expect.arrayContaining(['parking', 'street-meter', 'rideshare', 'transit']),
    );
    expect(driving.canonicalWinners.hiddenOptionKeys).toEqual([]);
    expect(
      resolvePointAbDisplayRecommendationMode({
        recommendationMode: driving.recommendationMode,
        noParkingPreferred: false,
        visibleOptionKeys: driving.canonicalWinners.visibleOptionKeys,
      }),
    ).toBe('street-meter');
  });

  test('computePointAbCanonicalWinners keeps cheapest and fastest within visible options', () => {
    const ranked = rankBrighton(false);
    const winners = computePointAbCanonicalWinners({
      candidates: [
        {
          key: 'street-meter',
          label: 'Street / meter parking',
          cost: 0,
          minutes: 46,
          reliable: true,
          confidence: 'Medium',
        },
        {
          key: 'transit',
          label: 'Transit',
          cost: 3.25,
          minutes: 74,
          reliable: true,
          confidence: 'Medium',
        },
        {
          key: 'rideshare',
          label: 'Rideshare',
          cost: 48,
          minutes: 43,
          reliable: true,
          confidence: 'Medium',
        },
      ],
      sort: 'cheapest',
      noParkingPreferred: false,
      parkingCost: 18,
      rideshareCost: 48,
    });

    expect(winners.cheapestWinner?.key).toBe('street-meter');
    expect(winners.fastestWinner?.key).toBe('rideshare');
    expect(winners.heroWinner).toBe('street-meter');
    expect(ranked.canonicalWinners.heroWinner).toBe('street-meter');
  });
});
