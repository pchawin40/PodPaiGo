import { calculateParkingDuration } from '../domain';
import type { TrafficEstimate, TripData, ParkAndRideParkingRules } from '../types';
import {
  canConfirmOvernightParkAndRide,
  isOvernightAirportParkingTrip,
  PARK_AND_RIDE_UI_COPY,
} from './parkAndRideAccess';
import type { AccessStrategyOption } from './types';
import { SEA_CURATED_HUBS } from './seaCuratedOptions';

export function isSeaCuratedAccessEnabled(): boolean {
  const value =
    process.env.SEA_CURATED_ACCESS ??
    process.env.NEXT_PUBLIC_SEA_CURATED_ACCESS ??
    '';

  return value === '1' || value.toLowerCase() === 'true';
}

let seaCuratedDisabledDiagnosticLogged = false;

export function resetSeaCuratedAccessDiagnosticsForTests(): void {
  seaCuratedDisabledDiagnosticLogged = false;
}

export function logSeaCuratedAccessDisabledDiagnostic(): void {
  if (process.env.NODE_ENV === 'production') return;
  if (seaCuratedDisabledDiagnosticLogged) return;

  seaCuratedDisabledDiagnosticLogged = true;
  console.warn(
    '[access] SEA_CURATED_ACCESS disabled; Northgate hidden option will not render.',
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

function scaleParkingRangeForConfirmedOvernight(
  min: number,
  max: number,
  tripData: TripData,
  rules: ParkAndRideParkingRules,
): { min: number; max: number } {
  if (!isOvernightAirportParkingTrip(tripData)) {
    return { min, max };
  }

  if (!canConfirmOvernightParkAndRide(rules)) {
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

function buildCuratedParkAndRideRules(
  overnightRules: string,
): ParkAndRideParkingRules {
  return {
    overnightAllowed: false,
    ruleConfidence: 'estimated',
    ruleNote: overnightRules,
  };
}

export function buildSeaCuratedAccessOptions(
  tripData: TripData,
  airportCode: string,
  trafficEstimate?: TrafficEstimate,
): AccessStrategyOption[] {
  if (airportCode.toUpperCase() !== 'SEA') return [];
  if (!isSeaCuratedAccessEnabled()) {
    logSeaCuratedAccessDisabledDiagnostic();
    return [];
  }

  const overnight = isOvernightAirportParkingTrip(tripData);

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

    const parkAndRideRules = buildCuratedParkAndRideRules(
      hub.parking.overnightRules,
    );
    const canEstimateOvernightParking = canConfirmOvernightParkAndRide(parkAndRideRules);

    const parkingRange = scaleParkingRangeForConfirmedOvernight(
      hub.parking.min,
      hub.parking.max,
      tripData,
      parkAndRideRules,
    );
    const transitRange = applyTransitFare(hub.transit.min, hub.transit.max, tripData);
    const totalMin = parkingRange.min + transitRange.min;
    const totalMax = parkingRange.max + transitRange.max;

    const confidenceScore = hub.confidence === 'high' ? 70 : hub.confidence === 'medium' ? 55 : 40;
    const stressScore = overnight ? 62 : 48;

    const pricing = canEstimateOvernightParking || !overnight
      ? {
          total: { min: totalMin, max: totalMax, currency: 'USD' as const },
          unit: 'trip_total' as const,
          confidence: 'estimated' as const,
          breakdown: {
            parking: {
              min: parkingRange.min,
              max: parkingRange.max,
              currency: 'USD' as const,
            },
            transit: {
              min: transitRange.min,
              max: transitRange.max,
              currency: 'USD' as const,
            },
          },
          displayPrimary: `Estimated ${formatMoneyRange(totalMin, totalMax)} total`,
          displaySecondary: `Parking ${formatMoneyRange(parkingRange.min, parkingRange.max)} + Link ${formatMoneyRange(transitRange.min, transitRange.max)}`,
          sourceNotes: `${hub.parking.sourceNotes} | ${hub.transit.sourceNotes}`,
        }
      : {
          total: { min: transitRange.min, max: transitRange.max, currency: 'USD' as const },
          unit: 'trip_total' as const,
          confidence: 'estimated' as const,
          breakdown: {
            transit: {
              min: transitRange.min,
              max: transitRange.max,
              currency: 'USD' as const,
            },
          },
          displayPrimary: PARK_AND_RIDE_UI_COPY.notRecommendedOvernight,
          displaySecondary: `${hub.parking.overnightRules} Transit ${formatMoneyRange(transitRange.min, transitRange.max)} only — parking cost not estimated for multi-day trips.`,
          sourceNotes: `${hub.parking.sourceNotes} | ${hub.transit.sourceNotes}`,
        };

    const recommendedForTrip = !overnight || canEstimateOvernightParking;

    return {
      id: hub.id,
      airportCode: 'SEA',
      displayName: hub.displayName,
      strategyType: hub.strategyType,
      sourceKind: 'curated',
      parkAndRideRules,
      recommendedForTrip,
      notRecommendedReason: recommendedForTrip
        ? undefined
        : PARK_AND_RIDE_UI_COPY.notRecommendedOvernight,
      pricing,
      timing: {
        terminalReadyMinutes,
        driveMinutes,
        walkMinutes: hub.timing.walkToPlatformMinutes,
        transitMinutes: hub.timing.linkRideMinutes,
        assumptions: [
          `Drive to ${hub.hubPlaceName}`,
          'Walk to Link platform',
          'Link light rail to SEA',
          overnight && !canEstimateOvernightParking
            ? PARK_AND_RIDE_UI_COPY.overnightCostUnavailable
            : 'Curated hub estimate; verify Sound Transit rules before leaving your car.',
          trafficEstimate?.trustStatus === 'live'
            ? 'Drive time partially informed by live traffic'
            : 'Drive time uses typical hub estimate',
        ],
      },
      easeScore: 100 - stressScore,
      stressScore,
      confidenceScore,
      overnightCaveat: overnight
        ? `${hub.parking.overnightRules} ${PARK_AND_RIDE_UI_COPY.verifyRules}`
        : `${PARK_AND_RIDE_UI_COPY.sameDayCaveat}. ${PARK_AND_RIDE_UI_COPY.verifyRules}`,
      explanation: hub.explanation,
      bestFor: hub.bestFor,
      isHiddenGem: true,
      sourceNotes: `${hub.parking.sourceNotes} | ${hub.transit.sourceNotes}`,
      mapLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hub.hubPlaceName)}`,
      sourceLink: 'https://www.soundtransit.org',
    };
  });
}
