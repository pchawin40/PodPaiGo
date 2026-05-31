import { calculateParkingDuration } from '../domain';
import type { TrafficEstimate, TripData } from '../types';
import type { AccessStrategyOption } from './types';
import { SEA_CURATED_HUBS } from './seaCuratedOptions';

export function isSeaCuratedAccessEnabled(): boolean {
  const value =
    process.env.SEA_CURATED_ACCESS ??
    process.env.NEXT_PUBLIC_SEA_CURATED_ACCESS ??
    '';

  return value === '1' || value.toLowerCase() === 'true';
}

function isOvernightTrip(tripData: TripData): boolean {
  const parkingDurationMinutes = calculateParkingDuration(tripData);
  return (
    (tripData.type === 'one-way-departure' || tripData.type === 'round-trip') &&
    parkingDurationMinutes >= 18 * 60
  );
}

function estimateDriveMinutes(
  tripData: TripData,
  trafficEstimate: TrafficEstimate | undefined,
  fallbackMinutes: number,
): number {
  if (trafficEstimate && !trafficEstimate.routeUnavailable && trafficEstimate.duration > 0) {
    return Math.max(fallbackMinutes, Math.round(trafficEstimate.duration * 0.45));
  }
  return fallbackMinutes;
}

function scaleParkingRange(
  min: number,
  max: number,
  tripData: TripData,
): { min: number; max: number } {
  if (!isOvernightTrip(tripData)) {
    return { min, max };
  }

  const days = Math.max(1, Math.ceil(calculateParkingDuration(tripData) / (24 * 60)));
  return {
    min: min * Math.min(days, 3),
    max: max * Math.min(days, 3),
  };
}

function applyTransitFare(
  min: number,
  max: number,
  tripData: TripData,
): { min: number; max: number } {
  if (tripData.transitPayment === 'orca-pass') {
    return { min: 0, max: 0 };
  }

  const multiplier = tripData.type === 'round-trip' ? 2 : 1;
  return {
    min: min * multiplier,
    max: max * multiplier,
  };
}

function formatMoneyRange(min: number, max: number): string {
  if (min === max) return `$${Math.round(min)}`;
  return `$${Math.round(min)}–$${Math.round(max)}`;
}

export function buildSeaCuratedAccessOptions(
  tripData: TripData,
  airportCode: string,
  trafficEstimate?: TrafficEstimate,
): AccessStrategyOption[] {
  if (airportCode.toUpperCase() !== 'SEA') return [];
  if (!isSeaCuratedAccessEnabled()) return [];

  const overnight = isOvernightTrip(tripData);

  return SEA_CURATED_HUBS.filter((hub) => hub.enabled).map((hub) => {
    const driveMinutes = estimateDriveMinutes(
      tripData,
      trafficEstimate,
      hub.timing.driveTimeFactorMinutes,
    );
    const terminalReadyMinutes =
      driveMinutes +
      hub.timing.walkToPlatformMinutes +
      hub.timing.linkRideMinutes;

    const parkingRange = scaleParkingRange(
      hub.parking.min,
      hub.parking.max,
      tripData,
    );
    const transitRange = applyTransitFare(hub.transit.min, hub.transit.max, tripData);
    const totalMin = parkingRange.min + transitRange.min;
    const totalMax = parkingRange.max + transitRange.max;

    const confidenceScore = hub.confidence === 'high' ? 70 : hub.confidence === 'medium' ? 55 : 40;
    const stressScore = overnight ? 62 : 48;

    return {
      id: hub.id,
      airportCode: 'SEA',
      displayName: hub.displayName,
      strategyType: hub.strategyType,
      sourceKind: 'curated',
      pricing: {
        total: { min: totalMin, max: totalMax, currency: 'USD' },
        unit: 'trip_total',
        confidence: 'estimated',
        breakdown: {
          parking: {
            min: parkingRange.min,
            max: parkingRange.max,
            currency: 'USD',
          },
          transit: {
            min: transitRange.min,
            max: transitRange.max,
            currency: 'USD',
          },
        },
        displayPrimary: `Estimated ${formatMoneyRange(totalMin, totalMax)} total`,
        displaySecondary: `Parking ${formatMoneyRange(parkingRange.min, parkingRange.max)} + Link ${formatMoneyRange(transitRange.min, transitRange.max)}`,
        sourceNotes: `${hub.parking.sourceNotes} | ${hub.transit.sourceNotes}`,
      },
      timing: {
        terminalReadyMinutes,
        driveMinutes,
        walkMinutes: hub.timing.walkToPlatformMinutes,
        transitMinutes: hub.timing.linkRideMinutes,
        assumptions: [
          `Drive to ${hub.hubPlaceName}`,
          'Walk to Link platform',
          'Link light rail to SEA',
          trafficEstimate?.trustStatus === 'live'
            ? 'Drive time partially informed by live traffic'
            : 'Drive time uses typical hub estimate',
        ],
      },
      easeScore: 100 - stressScore,
      stressScore,
      confidenceScore,
      overnightCaveat: overnight ? hub.parking.overnightRules : undefined,
      explanation: hub.explanation,
      bestFor: hub.bestFor,
      isHiddenGem: true,
      sourceNotes: `${hub.parking.sourceNotes} | ${hub.transit.sourceNotes}`,
      mapLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hub.hubPlaceName)}`,
      sourceLink: 'https://www.soundtransit.org',
    };
  });
}
