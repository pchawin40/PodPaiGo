import {
  calculateParkingDuration,
  calculateTransitCost,
  getTransitTripTotalCost,
  isTransitFareKnown,
} from '../domain';
import type {
  OptionScoreBreakdown,
  OptionScoreMode,
  ParkingOption,
  PointToPointTiming,
  RideshareOption,
  TransitOption,
  TripData,
} from '../types';
import type { WeatherImpact } from '../weather/types';
import {
  buildDestinationParkingIntelligence,
  isPaidParkingOption,
} from './destinationParkingIntelligence';
import {
  resolveCustomerParkingTiming,
  resolvePaidGarageTiming,
  resolveRideshareTiming,
  resolveStreetMeterTiming,
} from './pointAbModeTiming';
import { getParkingTotalPrice } from './priceDisplay';
import {
  buildParkingDriveContextFromOption,
  resolveParkingDriveMinutesDetailed,
} from './routeMinutes';
import { isParkingRouteUnavailable } from './routeStatus';
import {
  selectBestParkAndRideForPointAb,
  toPointAbParkRidePresentation,
} from './parkAndRideSelection';
import type { PointAbParkRidePresentation } from './parkAndRideTypes';
import { buildStreetMeterParkingOption } from './streetMeterParking';
import { assessTransitPracticality } from './transitPracticality';

export type PointAbSortMode = 'easiest' | 'cheapest' | 'fastest';
export type PointAbModeKey =
  | 'destination-customer'
  | 'parking'
  | 'street-meter'
  | 'rideshare'
  | 'transit'
  | 'park-ride';

export type BuildPointAbOptionScoreBreakdownsInput = {
  tripData: TripData;
  destinationLabel: string;
  parkingOptions: ParkingOption[];
  rideshareOptions: RideshareOption[];
  transitOptions: TransitOption[];
  driveMinutes?: number | null;
  parkingDurationMinutes?: number | null;
  weatherRisk?: WeatherImpact['riskLevel'] | null;
};

const INVALID_SCORE = -1_000_000;

function finiteMinutes(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function dollarsToCents(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value * 100))
    : null;
}

function confidenceFromLevel(level: 'High' | 'Medium' | 'Low' | undefined): number {
  if (level === 'High') return 82;
  if (level === 'Medium') return 62;
  return 42;
}

function confidenceFromTrust(value: string | null | undefined): number {
  if (value === 'live') return 86;
  if (value === 'verified-source') return 82;
  if (value === 'estimated') return 58;
  if (value === 'fallback') return 34;
  return 50;
}

function freshnessFromTrust(value: string | null | undefined): number {
  if (value === 'live') return 90;
  if (value === 'verified-source') return 82;
  if (value === 'estimated') return 55;
  if (value === 'fallback') return 30;
  return 45;
}

function scoreCost(totalCostCents: number | null): number {
  if (totalCostCents == null) return INVALID_SCORE;
  return clampScore(100 - totalCostCents / 100);
}

function scoreTime(totalTimeMinutes: number | null): number {
  if (totalTimeMinutes == null) return INVALID_SCORE;
  return clampScore(100 - totalTimeMinutes);
}

function scoreEase(input: {
  mode: OptionScoreMode;
  totalTimeMinutes: number | null;
  confidenceScore: number;
  frictionScore: number;
  walkMinutes: number | null;
  waitMinutes: number | null;
  sourceFreshnessScore: number;
  penalties: string[];
}): number {
  const walk = input.walkMinutes ?? 0;
  const wait = input.waitMinutes ?? 0;
  const time = input.totalTimeMinutes ?? 90;
  const simpleActionBonus =
    input.mode === 'rideshare'
      ? 10
      : input.mode === 'customer_parking'
        ? 4
        : input.mode === 'parking'
          ? 2
          : 0;
  const uncertaintyPenalty = input.penalties.length * 3;

  return clampScore(
    100 -
      input.frictionScore +
      input.confidenceScore * 0.28 +
      input.sourceFreshnessScore * 0.18 +
      simpleActionBonus -
      walk * 0.9 -
      wait * 0.45 -
      time * 0.04 -
      uncertaintyPenalty,
  );
}

function buildBreakdown(input: {
  optionId: string;
  mode: OptionScoreMode;
  totalCostCents: number | null;
  timing: PointToPointTiming | null;
  confidenceScore: number;
  frictionScore: number;
  sourceFreshnessScore: number;
  reasons: string[];
  penalties: string[];
}): OptionScoreBreakdown {
  const totalTimeMinutes = finiteMinutes(input.timing?.totalOptionMinutes);
  const walkMinutes = finiteMinutes(input.timing?.walkToDestinationMinutes);
  const waitMinutes = finiteMinutes(input.timing?.pickupWaitMinutes);
  const driveMinutes = finiteMinutes(input.timing?.driveMinutes);
  const parkingBufferMinutes = finiteMinutes(input.timing?.parkingBufferMinutes);
  const cheapestScore = scoreCost(input.totalCostCents);
  const fastestScore = scoreTime(totalTimeMinutes);
  const easiestScore = scoreEase({
    mode: input.mode,
    totalTimeMinutes,
    confidenceScore: input.confidenceScore,
    frictionScore: input.frictionScore,
    walkMinutes,
    waitMinutes,
    sourceFreshnessScore: input.sourceFreshnessScore,
    penalties: input.penalties,
  });

  return {
    optionId: input.optionId,
    mode: input.mode,
    totalCostCents: input.totalCostCents,
    totalTimeMinutes,
    confidenceScore: clampScore(input.confidenceScore),
    frictionScore: clampScore(input.frictionScore),
    walkMinutes,
    waitMinutes,
    driveMinutes,
    parkingBufferMinutes,
    sourceFreshnessScore: clampScore(input.sourceFreshnessScore),
    easiestScore,
    cheapestScore,
    fastestScore,
    bestOverallScore: clampScore(
      easiestScore * 0.55 +
        Math.max(0, cheapestScore) * 0.2 +
        Math.max(0, fastestScore) * 0.25,
    ),
    reasons: input.reasons,
    penalties: input.penalties,
  };
}

export function optionScoreModeToPointAbKey(mode: OptionScoreMode): PointAbModeKey {
  if (mode === 'customer_parking') return 'destination-customer';
  if (mode === 'street') return 'street-meter';
  if (mode === 'park_ride') return 'park-ride';
  return mode;
}

export function pointAbKeyToOptionScoreMode(key: PointAbModeKey): OptionScoreMode {
  if (key === 'destination-customer') return 'customer_parking';
  if (key === 'street-meter') return 'street';
  if (key === 'park-ride') return 'park_ride';
  return key;
}

function parkingScoreMode(mode: OptionScoreMode): boolean {
  return mode === 'parking' || mode === 'street' || mode === 'customer_parking' || mode === 'park_ride';
}

function usableForSort(score: OptionScoreBreakdown, sort: PointAbSortMode): boolean {
  if (sort === 'cheapest') return score.totalCostCents != null;
  if (sort === 'fastest') return score.totalTimeMinutes != null;
  return score.totalTimeMinutes != null && score.easiestScore > 0;
}

function visibleScores(
  scores: OptionScoreBreakdown[],
  noParkingPreferred: boolean,
): OptionScoreBreakdown[] {
  return scores.filter((score) => !(noParkingPreferred && parkingScoreMode(score.mode)));
}

export function selectCanonicalPointAbWinner(input: {
  scores: OptionScoreBreakdown[];
  sort: PointAbSortMode;
  noParkingPreferred?: boolean;
}): OptionScoreBreakdown | null {
  const candidates = visibleScores(input.scores, input.noParkingPreferred === true)
    .filter((score) => usableForSort(score, input.sort));

  if (input.sort === 'cheapest') {
    return (
      candidates.sort(
        (a, b) =>
          (a.totalCostCents ?? Number.MAX_SAFE_INTEGER) -
            (b.totalCostCents ?? Number.MAX_SAFE_INTEGER) ||
          (a.totalTimeMinutes ?? Number.MAX_SAFE_INTEGER) -
            (b.totalTimeMinutes ?? Number.MAX_SAFE_INTEGER) ||
          b.easiestScore - a.easiestScore,
      )[0] ?? null
    );
  }

  if (input.sort === 'fastest') {
    return (
      candidates.sort(
        (a, b) =>
          (a.totalTimeMinutes ?? Number.MAX_SAFE_INTEGER) -
            (b.totalTimeMinutes ?? Number.MAX_SAFE_INTEGER) ||
          a.frictionScore - b.frictionScore ||
          (a.totalCostCents ?? Number.MAX_SAFE_INTEGER) -
            (b.totalCostCents ?? Number.MAX_SAFE_INTEGER),
      )[0] ?? null
    );
  }

  return (
    candidates.sort(
      (a, b) =>
        b.easiestScore - a.easiestScore ||
        a.frictionScore - b.frictionScore ||
        (a.totalTimeMinutes ?? Number.MAX_SAFE_INTEGER) -
          (b.totalTimeMinutes ?? Number.MAX_SAFE_INTEGER),
    )[0] ?? null
  );
}

export function selectCanonicalCheapest(input: {
  scores: OptionScoreBreakdown[];
  noParkingPreferred?: boolean;
}): OptionScoreBreakdown | null {
  return selectCanonicalPointAbWinner({
    scores: input.scores,
    sort: 'cheapest',
    noParkingPreferred: input.noParkingPreferred,
  });
}

export function selectCanonicalFastest(input: {
  scores: OptionScoreBreakdown[];
  noParkingPreferred?: boolean;
}): OptionScoreBreakdown | null {
  return selectCanonicalPointAbWinner({
    scores: input.scores,
    sort: 'fastest',
    noParkingPreferred: input.noParkingPreferred,
  });
}

export function resolvePaidParkingDriveToLotMinutes(parking: ParkingOption | null): number | null {
  if (!parking || isParkingRouteUnavailable(parking)) return null;

  const resolved = resolveParkingDriveMinutesDetailed(
    parking,
    buildParkingDriveContextFromOption(parking),
  );
  if (resolved.source) return resolved.minutes;

  if (parking.coordinateSource === 'google_place' && parking.routesUsedCanonicalCoords !== true) {
    return null;
  }

  return (
    finiteMinutes(parking.timingBreakdown?.driveMinutes) ??
    finiteMinutes(parking.originToParkingMinutes) ??
    finiteMinutes(parking.routeToParkingMinutes) ??
    finiteMinutes(parking.driveMinutes) ??
    finiteMinutes(parking.duration) ??
    null
  );
}

function parkingTimingForScore(parking: ParkingOption): PointToPointTiming | null {
  const driveToLotMinutes = resolvePaidParkingDriveToLotMinutes(parking);
  return resolvePaidGarageTiming({
    driveMinutes: driveToLotMinutes,
    parkingMinutes: finiteMinutes(parking.timingBreakdown?.totalOptionMinutes ?? parking.totalOptionMinutes),
    parking,
  });
}

function rideshareCostCents(option: RideshareOption): number | null {
  if (option.priceDisplay === 'check-live' || option.rideshareEstimateConfidence === 'unavailable') {
    return null;
  }

  return dollarsToCents(option.price);
}

function transitCostCents(option: TransitOption, tripData: TripData): number | null {
  if (!isTransitFareKnown(option)) return null;
  const total = getTransitTripTotalCost(option, tripData);
  if (Number.isFinite(total)) return dollarsToCents(total);
  return dollarsToCents(calculateTransitCost(option, tripData));
}

function weatherPenalty(weatherRisk?: WeatherImpact['riskLevel'] | null): number {
  if (weatherRisk === 'high') return 12;
  if (weatherRisk === 'medium') return 6;
  return 0;
}

function parkRideTiming(option: PointAbParkRidePresentation): PointToPointTiming | null {
  if (option.durationMinutes == null) return null;
  const routeBreakdown = option.details.routeBreakdown;

  return {
    driveMinutes: routeBreakdown.driveMinutes,
    parkingBufferMinutes: null,
    walkToDestinationMinutes: routeBreakdown.walkMinutes,
    pickupWaitMinutes: routeBreakdown.waitMinutes,
    totalOptionMinutes: option.durationMinutes,
  };
}

export function buildPointAbOptionScoreBreakdowns(
  input: BuildPointAbOptionScoreBreakdownsInput,
): OptionScoreBreakdown[] {
  const driveMinutes = finiteMinutes(input.driveMinutes);
  const parkingDurationMinutes =
    finiteMinutes(input.parkingDurationMinutes) ?? calculateParkingDuration(input.tripData);
  const destinationLabel = input.destinationLabel || input.tripData.destination;
  const scores: OptionScoreBreakdown[] = [];
  const weatherFriction = weatherPenalty(input.weatherRisk);
  const parkingOptions = input.parkingOptions || [];
  const bestParking = parkingOptions.find((option) => !isParkingRouteUnavailable(option)) ?? parkingOptions[0] ?? null;

  const destinationIntelligence = buildDestinationParkingIntelligence({
    destination: destinationLabel,
    destinationKind: input.tripData.destinationKind,
    airportCode: input.tripData.airportCode,
    parkingOptions,
  });

  if (destinationIntelligence.customerCandidate) {
    const customer = destinationIntelligence.customerCandidate;
    const timing = resolveCustomerParkingTiming({
      driveMinutes,
      confidence: customer.confidence,
    });
    const penalties = [
      customer.verifyRequired ? 'Verify signs, access rules, and towing restrictions.' : '',
      customer.confidence === 'Low' ? 'Customer parking is plausible but unconfirmed.' : '',
    ].filter(Boolean);

    scores.push(
      buildBreakdown({
        optionId: 'customer-parking',
        mode: 'customer_parking',
        totalCostCents: 0,
        timing,
        confidenceScore: confidenceFromLevel(customer.confidence),
        frictionScore: customer.confidence === 'High' ? 22 : customer.confidence === 'Medium' ? 30 : 40,
        sourceFreshnessScore: customer.confidence === 'High' ? 72 : 58,
        reasons: customer.pros,
        penalties,
      }),
    );
  }

  if (bestParking) {
    const timing = parkingTimingForScore(bestParking);
    const paid = isPaidParkingOption(bestParking);
    const routeUnavailable = isParkingRouteUnavailable(bestParking);
    const cost = getParkingTotalPrice(bestParking, input.tripData) ?? bestParking.price ?? null;
    const walk = timing?.walkToDestinationMinutes ?? bestParking.walkToDestinationMinutes ?? bestParking.walkingMinutes ?? null;
    const penalties = [
      routeUnavailable ? 'Origin-to-lot route timing is unavailable.' : '',
      paid ? 'Paid parking requires booking, payment, or garage entry.' : '',
      timing?.driveMinutes == null ? 'Drive-to-lot timing is not confirmed.' : '',
    ].filter(Boolean);

    scores.push(
      buildBreakdown({
        optionId: bestParking.id,
        mode: 'parking',
        totalCostCents: dollarsToCents(cost),
        timing,
        confidenceScore: routeUnavailable ? 30 : confidenceFromTrust(bestParking.trustStatus),
        frictionScore:
          (paid ? 44 : 32) +
          (walk ?? 6) * 0.8 +
          (timing?.parkingBufferMinutes ?? 8) * 0.5 +
          (routeUnavailable ? 32 : 0) +
          weatherFriction,
        sourceFreshnessScore: freshnessFromTrust(bestParking.trustStatus),
        reasons: [
          paid ? 'Bookable paid option.' : 'Parking near destination.',
          bestParking.reviewScore ? `Google rating ${bestParking.reviewScore}.` : '',
        ].filter(Boolean),
        penalties,
      }),
    );
  }

  const arrivalDate =
    input.tripData.type === 'general-trip' || input.tripData.type === 'one-way-arrival'
      ? input.tripData.arrivalDate
      : input.tripData.type === 'one-way-departure' || input.tripData.type === 'round-trip'
        ? input.tripData.departureDate
        : undefined;
  const arrivalTime =
    input.tripData.type === 'general-trip' || input.tripData.type === 'one-way-arrival'
      ? input.tripData.arrivalTime
      : input.tripData.type === 'one-way-departure' || input.tripData.type === 'round-trip'
        ? input.tripData.departureTime
        : undefined;
  const streetMeter = buildStreetMeterParkingOption({
    destination: destinationLabel,
    destinationKind: input.tripData.destinationKind,
    origin: input.tripData.origin,
    arrivalDate,
    arrivalTime,
    durationMinutes: parkingDurationMinutes,
    driveMinutes,
    isAirportTrip: false,
  });

  if (streetMeter?.applicable) {
    const timing = resolveStreetMeterTiming({
      driveMinutes,
      hasDestinationCoords:
        typeof input.tripData.destinationLat === 'number' &&
        typeof input.tripData.destinationLng === 'number',
    });
    const penalties = [
      'Availability is not guaranteed.',
      streetMeter.verifyRequired ? 'Posted signs and meter rules must be checked on arrival.' : '',
    ].filter(Boolean);

    scores.push(
      buildBreakdown({
        optionId: 'street-meter',
        mode: 'street',
        totalCostCents: dollarsToCents(streetMeter.cost),
        timing,
        confidenceScore: confidenceFromLevel(streetMeter.confidence),
        frictionScore: 62 + weatherFriction,
        sourceFreshnessScore: 50,
        reasons: streetMeter.pros,
        penalties,
      }),
    );
  }

  input.rideshareOptions.forEach((option) => {
    const timing = resolveRideshareTiming({
      driveMinutes,
      rideshare: option,
    });
    const cost = rideshareCostCents(option);
    const penalties = [
      cost == null ? 'Live fare is unavailable; open the app for current price.' : '',
      'Surge pricing can change.',
    ].filter(Boolean);

    scores.push(
      buildBreakdown({
        optionId: option.id,
        mode: 'rideshare',
        totalCostCents: cost,
        timing,
        confidenceScore: confidenceFromTrust(option.trustStatus),
        frictionScore: 22 + (timing?.pickupWaitMinutes ?? 5) * 0.5,
        sourceFreshnessScore:
          option.rideshareEstimateConfidence === 'live-route-estimate'
            ? 72
            : option.rideshareEstimateConfidence === 'unavailable'
              ? 42
              : freshnessFromTrust(option.trustStatus),
        reasons: ['No parking required.', 'Simple provider app handoff.'],
        penalties,
      }),
    );
  });

  input.transitOptions.forEach((option) => {
    const duration = finiteMinutes(option.duration);
    const waitMinutes = finiteMinutes(option.frequency) != null ? Math.round((option.frequency ?? 0) / 2) : null;
    const timing: PointToPointTiming | null =
      duration != null
        ? {
            driveMinutes: null,
            parkingBufferMinutes: null,
            walkToDestinationMinutes: null,
            pickupWaitMinutes: waitMinutes,
            totalOptionMinutes: duration,
          }
        : null;
    const cost = transitCostCents(option, input.tripData);
    const practicality = assessTransitPracticality({
      tripData: input.tripData,
      destinationLabel,
      transit: option,
      transitDuration: duration,
      driveMinutes,
    });

    scores.push(
      buildBreakdown({
        optionId: option.id,
        mode: 'transit',
        totalCostCents: cost,
        timing,
        confidenceScore: practicality.primaryEligible
          ? confidenceFromTrust(option.trustStatus)
          : Math.min(38, confidenceFromTrust(option.trustStatus)),
        frictionScore:
          56 +
          (waitMinutes ?? 8) * 0.6 +
          weatherFriction +
          (practicality.primaryEligible ? 0 : 42),
        sourceFreshnessScore: practicality.primaryEligible
          ? freshnessFromTrust(option.trustStatus)
          : Math.min(34, freshnessFromTrust(option.trustStatus)),
        reasons: practicality.primaryEligible
          ? ['Usually low cost.', 'Avoids parking search.']
          : ['Possible route to check in maps.'],
        penalties: [
          'More walking and waiting.',
          cost == null ? 'Fare is not confirmed.' : '',
          ...practicality.reasons,
        ].filter(Boolean),
      }),
    );
  });

  const parkRideSelection = selectBestParkAndRideForPointAb({
    origin: input.tripData.origin,
    originLat: input.tripData.originLat,
    originLng: input.tripData.originLng,
    destination: destinationLabel,
    destinationLat: input.tripData.destinationLat,
    destinationLng: input.tripData.destinationLng,
    parkingDurationMinutes,
    isAirportTrip: false,
    sort: 'easiest',
    arrivalDate: input.tripData.type === 'general-trip' ? input.tripData.arrivalDate : undefined,
    arrivalTime: input.tripData.type === 'general-trip' ? input.tripData.arrivalTime : undefined,
    transitPayment: input.tripData.transitPayment,
    parkingTotal: bestParking ? getParkingTotalPrice(bestParking, input.tripData) ?? bestParking.price ?? null : null,
    weatherRisk: input.weatherRisk ?? undefined,
  });
  const parkRide = toPointAbParkRidePresentation(parkRideSelection);

  if (parkRide) {
    const timing = parkRideTiming(parkRide);
    const unavailable = !parkRide.reliable || parkRide.durationMinutes == null;

    scores.push(
      buildBreakdown({
        optionId: parkRide.lotName || 'park-ride',
        mode: 'park_ride',
        totalCostCents: dollarsToCents(parkRide.cost),
        timing,
        confidenceScore: parkRide.confidenceScore,
        frictionScore: unavailable ? 82 : 66 + weatherFriction,
        sourceFreshnessScore: parkRide.reliable ? 62 : 34,
        reasons: parkRide.pros,
        penalties: [
          ...parkRide.cons,
          unavailable ? parkRide.unavailableReason || 'Park & Ride is not recommended for this trip.' : '',
        ].filter(Boolean),
      }),
    );
  }

  return scores;
}
