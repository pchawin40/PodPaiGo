import { calculateParkingDuration } from '../domain';
import type { ParkingOption, TrafficEstimate, TripData } from '../types';
import {
  deriveParkingTotalRange,
} from './pricingLadder';
import type { AccessStrategyOption } from './types';

const PARK_AND_RIDE_NAME_PATTERNS = [
  'park & ride',
  'park and ride',
  'park-and-ride',
  'park n ride',
  'transit center',
  'transit centre',
  'link station',
  'light rail',
  'sound transit',
  'station parking',
  'narrows park',
  'northgate transit',
];

export function isParkAndRideParkingOption(option: ParkingOption): boolean {
  if (option.type === 'park-and-ride') return true;
  if (option.transferType === 'transit') return true;

  const name = option.name.toLowerCase();
  return PARK_AND_RIDE_NAME_PATTERNS.some((pattern) => name.includes(pattern));
}

function formatMoneyRange(min: number, max: number): string {
  if (min === max) return `$${Math.round(min)}`;
  return `$${Math.round(min)}–$${Math.round(max)}`;
}

function isOvernightTrip(tripData: TripData): boolean {
  const parkingDurationMinutes = calculateParkingDuration(tripData);
  return (
    (tripData.type === 'one-way-departure' || tripData.type === 'round-trip') &&
    parkingDurationMinutes >= 18 * 60
  );
}

function transitFareRange(tripData: TripData): { min: number; max: number } {
  if (tripData.transitPayment === 'orca-pass') {
    return { min: 0, max: 0 };
  }

  const multiplier = tripData.type === 'round-trip' ? 2 : 1;
  return { min: 3 * multiplier, max: 6 * multiplier };
}

function estimateDriveMinutes(
  parking: ParkingOption,
  trafficEstimate: TrafficEstimate | undefined,
): number {
  if (
    trafficEstimate &&
    !trafficEstimate.routeUnavailable &&
    trafficEstimate.duration > 0
  ) {
    return Math.max(12, Math.round(trafficEstimate.duration * 0.55));
  }

  if (typeof parking.distance === 'number' && parking.distance > 0) {
    return Math.max(12, Math.round(parking.distance * 2.4));
  }

  return 25;
}

export function buildParkAndRideAccessFromParking(
  parking: ParkingOption,
  tripData: TripData,
  airportCode: string,
  trafficEstimate?: TrafficEstimate,
): AccessStrategyOption {
  const overnight = isOvernightTrip(tripData);
  const parkingTotal = deriveParkingTotalRange(parking, tripData);
  const transitRange = transitFareRange(tripData);
  const totalMin = parkingTotal.min + transitRange.min;
  const totalMax = parkingTotal.max + transitRange.max;
  const driveMinutes = estimateDriveMinutes(parking, trafficEstimate);
  const walkMinutes = parking.walkingMinutes ?? 8;
  const transitMinutes =
    parking.transferToTerminalMinutes ?? parking.shuttleMinutes ?? 35;
  const terminalReadyMinutes = driveMinutes + walkMinutes + transitMinutes;

  return {
    id: `park-and-ride-${parking.id}`,
    airportCode: airportCode.toUpperCase(),
    displayName: parking.name,
    strategyType: 'park_and_ride_transit',
    sourceKind: 'parking',
    sourceOption: parking,
    pricing: {
      total: { min: totalMin, max: totalMax, currency: 'USD' },
      unit: 'trip_total',
      confidence: 'estimated',
      breakdown: {
        parking: {
          min: parkingTotal.min,
          max: parkingTotal.max,
          currency: 'USD',
        },
        transit: {
          min: transitRange.min,
          max: transitRange.max,
          currency: 'USD',
        },
      },
      displayPrimary: `Estimated ${formatMoneyRange(totalMin, totalMax)} total`,
      displaySecondary: `Parking ${formatMoneyRange(parkingTotal.min, parkingTotal.max)} + transit ${formatMoneyRange(transitRange.min, transitRange.max)}`,
      sourceNotes: parking.sourceName || 'Discovered park-and-ride listing',
    },
    timing: {
      terminalReadyMinutes,
      driveMinutes,
      walkMinutes,
      transitMinutes,
      assumptions: [
        `Drive to ${parking.name}`,
        'Walk or transfer to transit',
        `Transit/light rail toward ${airportCode}`,
        trafficEstimate?.trustStatus === 'live'
          ? 'Drive time partially informed by route data'
          : 'Drive time uses typical estimate',
      ],
    },
    easeScore: overnight ? 58 : 68,
    stressScore: overnight ? 64 : 52,
    confidenceScore: 52,
    overnightCaveat:
      'Verify parking availability and overnight rules before leaving your car.',
    explanation:
      'Park-and-ride access uses station or transit-center parking plus rail or transit to reach the airport. This is not standard airport parking.',
    bestFor: ['Park & Ride', 'Transit + parking', ...(parking.bestFor || [])].filter(
      (tag, index, tags) => tags.indexOf(tag) === index,
    ),
    isHiddenGem: false,
    sourceNotes: parking.sourceName || 'Park-and-ride listing',
    mapLink:
      parking.mapLink ||
      parking.sourceLink ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parking.name)}`,
    sourceLink: 'https://www.soundtransit.org',
  };
}

export function buildParkAndRideAccessOptionsFromParking(
  parkingOptions: ParkingOption[],
  tripData: TripData,
  airportCode: string,
  trafficEstimate?: TrafficEstimate,
): AccessStrategyOption[] {
  return parkingOptions
    .filter(isParkAndRideParkingOption)
    .map((parking) =>
      buildParkAndRideAccessFromParking(parking, tripData, airportCode, trafficEstimate),
    );
}

export function partitionParkingByAccessKind(parkingOptions: ParkingOption[]): {
  standardParking: ParkingOption[];
  parkAndRideParking: ParkingOption[];
} {
  const parkAndRideParking = parkingOptions.filter(isParkAndRideParkingOption);
  const standardParking = parkingOptions.filter(
    (option) => !isParkAndRideParkingOption(option),
  );

  return { standardParking, parkAndRideParking };
}
