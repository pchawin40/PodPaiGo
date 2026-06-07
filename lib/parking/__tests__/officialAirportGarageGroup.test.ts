import { buildSeaOfficialParkingOptions } from '../seaOfficialParking';
import {
  groupOfficialSeaGarageOptions,
  isSeaOfficialGarageCandidate,
  SEA_OFFICIAL_GARAGE_GROUP_ID,
} from '../officialAirportGarageGroup';
import { sortParkingOptionsForMode } from '../sortParkingOptions';
import type { ParkingOption, TripData } from '../../types';

const seaTrip: TripData = {
  type: 'round-trip',
  origin: 'Seattle, WA',
  destination: 'SEA Airport',
  destinationKind: 'airport',
  airportCode: 'SEA',
  departureDate: '2026-06-01',
  departureTime: '09:00',
  returnDate: '2026-06-03',
  returnTime: '09:00',
  parkingDuration: 2 * 24 * 60,
};

function googleGarageLot(): ParkingOption {
  return {
    id: 'google-sea-garage',
    name: 'Seattle-Tacoma International Airport (SEA) Parking Garage',
    serviceAirportCode: 'SEA',
    type: 'official',
    price: 0,
    distance: 2,
    availability: 50,
    trustStatus: 'estimated',
    sourceName: 'Google Places',
    lastUpdated: '2026-06-01T00:00:00.000Z',
    assumptions: [],
    lat: 47.4439,
    lng: -122.3022,
    routeDestination: 'SEA Airport Parking Garage, 17801 International Blvd, SeaTac, WA 98158',
    originToParkingMinutes: 12,
    parkingBufferMinutes: 8,
    transferToTerminalMinutes: 5,
    transferType: 'airport-garage',
    walkingMinutes: 5,
  };
}

function offSiteLot(): ParkingOption {
  return {
    id: 'offsite',
    name: 'Budget Shuttle Lot',
    serviceAirportCode: 'SEA',
    type: 'off-airport',
    price: 24,
    priceUnit: 'total',
    priceDisplay: 'live',
    pricingConfidence: 'live',
    distance: 12,
    availability: 90,
    trustStatus: 'live',
    sourceName: 'Test lot',
    lastUpdated: '2026-06-01T00:00:00.000Z',
    assumptions: [],
    originToParkingMinutes: 10,
    parkingBufferMinutes: 6,
    shuttleWaitMinutes: 8,
    transferToTerminalMinutes: 12,
    transferType: 'shuttle',
    walkingMinutes: 3,
  };
}

describe('officialAirportGarageGroup', () => {
  test('detects official SEA garage family members', () => {
    const official = buildSeaOfficialParkingOptions({
      airportCode: 'SEA',
      checkInAt: '2026-06-01T09:00',
      checkOutAt: '2026-06-03T09:00',
    });

    expect(isSeaOfficialGarageCandidate(official[0]!, 'SEA')).toBe(true);
    expect(isSeaOfficialGarageCandidate(official[1]!, 'SEA')).toBe(true);
    expect(isSeaOfficialGarageCandidate(googleGarageLot(), 'SEA')).toBe(true);
    expect(isSeaOfficialGarageCandidate(offSiteLot(), 'SEA')).toBe(false);
  });

  test('groups official SEA products into one garage card with sub-options', () => {
    const official = buildSeaOfficialParkingOptions({
      airportCode: 'SEA',
      checkInAt: '2026-06-01T09:00',
      checkOutAt: '2026-06-03T09:00',
    }).map((option) => ({
      ...option,
      originToParkingMinutes: 12,
      routeToParkingMinutes: 12,
    }));

    const grouped = groupOfficialSeaGarageOptions(
      [...official, googleGarageLot(), offSiteLot()],
      'fastest',
      seaTrip,
      'SEA',
    );

    const garageCards = grouped.filter((option) => option.officialGarageGroupId);
    expect(garageCards).toHaveLength(1);
    expect(garageCards[0]?.id).toBe(SEA_OFFICIAL_GARAGE_GROUP_ID);
    expect(garageCards[0]?.name).toContain('Official SEA Airport Garage');
    expect(garageCards[0]?.officialGarageSubOptions?.map((sub) => sub.id)).toEqual([
      'sea-general',
      'sea-reserved',
    ]);
    expect(grouped.some((option) => option.id === 'sea-general')).toBe(false);
    expect(grouped.some((option) => option.id === 'google-sea-garage')).toBe(false);
    expect(grouped.some((option) => option.id === 'offsite')).toBe(true);
  });

  test('cheapest representative prefers General Parking', () => {
    const official = buildSeaOfficialParkingOptions({
      airportCode: 'SEA',
      checkInAt: '2026-06-01T09:00',
      checkOutAt: '2026-06-03T09:00',
    });

    const grouped = groupOfficialSeaGarageOptions(official, 'cheapest', seaTrip, 'SEA');
    expect(grouped[0]?.price).toBe(74);
    expect(grouped[0]?.officialGarageMemberIds).toContain('sea-general');
  });

  test('fastest representative prefers Reserved Parking', () => {
    const official = buildSeaOfficialParkingOptions({
      airportCode: 'SEA',
      checkInAt: '2026-06-01T09:00',
      checkOutAt: '2026-06-03T09:00',
    }).map((option) => ({
      ...option,
      originToParkingMinutes: 12,
      routeToParkingMinutes: 12,
    }));

    const grouped = groupOfficialSeaGarageOptions(official, 'fastest', seaTrip, 'SEA');
    expect(grouped[0]?.officialGarageMemberIds).toContain('sea-reserved');
    expect(grouped[0]?.transferToTerminalMinutes).toBe(3);
  });

  test('best overall can differ from cheapest and fastest winners', () => {
    const official = buildSeaOfficialParkingOptions({
      airportCode: 'SEA',
      checkInAt: '2026-06-01T09:00',
      checkOutAt: '2026-06-03T09:00',
    }).map((option) => ({
      ...option,
      originToParkingMinutes: 12,
      routeToParkingMinutes: 12,
    }));

    const options = [...official, offSiteLot()];
    const cheapest = sortParkingOptionsForMode(options, 'cheapest', { tripData: seaTrip })[0];
    const fastest = sortParkingOptionsForMode(options, 'fastest', { tripData: seaTrip })[0];
    const best = sortParkingOptionsForMode(options, 'best', { tripData: seaTrip })[0];

    expect(cheapest?.id).toBe('offsite');
    expect(fastest?.id).toBe('sea-reserved');
    expect(cheapest?.id).not.toBe(fastest?.id);
    expect(['offsite', 'sea-general', 'sea-reserved']).toContain(best?.id);
  });
});
