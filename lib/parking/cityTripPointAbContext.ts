import {
  formatTransitCostDisplay,
  getTransitTripTotalCost,
  calculateParkingDuration,
  type RankedRecommendation,
} from '../domain';
import { isTransitFareKnown } from '../transit/transitPricing';
import type { Recommendation, TripData } from '../types';
import type { OptionScoreBreakdown, ParkingOption, RideshareOption, TransitOption } from '../types';
import { parkingTimeBreakdown } from './routeDisplay';
import { buildParkingDriveContextFromOption } from './routeMinutes';
import { resolveTripParkingContext } from '../trip/tripContext';
import { getParkingTotalPrice } from './priceDisplay';
import {
  selectBestParkAndRideForPointAb,
  toPointAbParkRidePresentation,
} from './parkAndRideSelection';
import { rankPointAbModes, type PointAbRankingResult } from './pointAbRanking';
import { buildStreetMeterParkingOption } from './streetMeterParking';

function getTripArrivalContext(tripData: TripData): {
  arrivalDate?: string;
  arrivalTime?: string;
} {
  if (tripData.type === 'general-trip' || tripData.type === 'one-way-arrival') {
    return {
      arrivalDate: tripData.arrivalDate,
      arrivalTime: tripData.arrivalTime,
    };
  }

  if (tripData.type === 'one-way-departure' || tripData.type === 'round-trip') {
    return {
      arrivalDate: tripData.departureDate,
      arrivalTime: tripData.departureTime,
    };
  }

  return {};
}

export function computeCityTripPointAbRanking(input: {
  tripData: TripData;
  sort: 'easiest' | 'cheapest' | 'fastest';
  destinationLabel: string;
  noParkingPreferred: boolean;
  smartPickOption: ParkingOption | null;
  parkingDisplayOptions: ParkingOption[];
  sortedOptions: RankedRecommendation[];
  recommendation: Recommendation;
  driveMinutes?: number | null;
  scoreBreakdowns?: OptionScoreBreakdown[] | null;
}): PointAbRankingResult | null {
  const parkingDurationMinutes = calculateParkingDuration(input.tripData);
  const bestParking = input.smartPickOption || input.parkingDisplayOptions[0] || null;
  const tripParkingContext = resolveTripParkingContext(input.tripData);
  const arrivalContext = getTripArrivalContext(input.tripData);

  const parkingBreakdown = bestParking
    ? parkingTimeBreakdown(
        bestParking,
        buildParkingDriveContextFromOption(bestParking),
        tripParkingContext,
      )
    : null;

  const parkingTotal = bestParking
    ? getParkingTotalPrice(bestParking, input.tripData) ?? bestParking.price ?? null
    : null;

  const streetMeterParking = buildStreetMeterParkingOption({
    destination: input.destinationLabel,
    arrivalDate: arrivalContext.arrivalDate,
    arrivalTime: arrivalContext.arrivalTime,
    durationMinutes: parkingDurationMinutes,
    driveMinutes:
      input.driveMinutes ??
      input.recommendation.trafficEstimate?.duration ??
      parkingBreakdown?.parts[0]?.minutes ??
      null,
    isAirportTrip: false,
  });

  const bestRide = input.sortedOptions.find((option) => option.type === 'rideshare') || null;
  const bestRideOption = bestRide?.option as RideshareOption | undefined;
  const ridesharePriceUnavailable =
    bestRideOption?.priceDisplay === 'check-live' ||
    bestRideOption?.rideshareEstimateConfidence === 'unavailable';
  const ridePriceCandidate =
    typeof bestRide?.cost === 'number' && bestRide.cost < 999999
      ? bestRide.cost
      : bestRideOption?.price ?? null;
  const ridePrice = ridesharePriceUnavailable ? null : ridePriceCandidate;
  const rideDuration =
    typeof bestRideOption?.totalOptionMinutes === 'number' &&
    Number.isFinite(bestRideOption.totalOptionMinutes)
      ? bestRideOption.totalOptionMinutes
      : typeof bestRide?.duration === 'number' && bestRide.duration < 999999
      ? bestRide.duration
      : bestRideOption?.duration ?? null;

  const bestTransit = input.sortedOptions.find((option) => option.type === 'transit') || null;
  const bestTransitOption = bestTransit?.option as TransitOption | undefined;
  const transitDuration =
    typeof bestTransit?.duration === 'number' && bestTransit.duration < 999999
      ? bestTransit.duration
      : bestTransitOption?.duration ?? null;
  const hasReliableTransit =
    Boolean(bestTransit) &&
    bestTransitOption?.trustStatus !== 'fallback' &&
    transitDuration !== null;
  const transitCost =
    bestTransitOption &&
    input.tripData &&
    hasReliableTransit &&
    isTransitFareKnown(bestTransitOption)
      ? getTransitTripTotalCost(bestTransitOption, input.tripData)
      : typeof bestTransit?.cost === 'number' &&
          bestTransit.cost < 999999 &&
          (!bestTransitOption || isTransitFareKnown(bestTransitOption))
        ? bestTransit.cost
        : null;
  const transitCostDisplay =
    bestTransitOption && input.tripData
      ? formatTransitCostDisplay(bestTransitOption, input.tripData)
      : null;

  const bestParkRideAccess =
    input.recommendation.accessStrategies?.options?.find(
      (option) => option.strategyType === 'park_and_ride_transit',
    ) || null;

  const pointAbParkRideSelection = selectBestParkAndRideForPointAb({
    origin: input.tripData.origin,
    originLat: input.tripData.originLat,
    originLng: input.tripData.originLng,
    destination: input.destinationLabel,
    destinationLat: input.tripData.destinationLat,
    destinationLng: input.tripData.destinationLng,
    parkingDurationMinutes,
    isAirportTrip: false,
    sort: input.sort,
    parkingTotal,
    weatherRisk: input.recommendation.weatherImpact?.riskLevel,
  });
  const pointAbParkRide = toPointAbParkRidePresentation(
    pointAbParkRideSelection ?? { best: null, candidates: [] },
  );

  return rankPointAbModes({
    tripData: input.tripData,
    sort: input.sort,
    destinationLabel: input.destinationLabel,
    noParkingPreferred: input.noParkingPreferred,
    bestParking,
    parkingOptions: input.parkingDisplayOptions,
    parkingTotal,
    parkingMinutes: parkingBreakdown?.totalMinutes ?? null,
    bestRideOption: bestRideOption ?? null,
    ridePrice,
    rideDuration,
    bestTransitOption: bestTransitOption ?? null,
    transitCost,
    transitDuration,
    transitCostDisplay: transitCostDisplay?.primary ?? null,
    hasReliableTransit,
    bestParkRideAccess,
    pointAbParkRide,
    parkRideCost: pointAbParkRide?.cost ?? null,
    parkRideDuration: pointAbParkRide?.durationMinutes ?? null,
    parkRideReliable: Boolean(pointAbParkRide?.reliable),
    streetMeterParking,
    scoreBreakdowns: input.scoreBreakdowns,
    driveMinutes:
      input.driveMinutes ?? input.recommendation.trafficEstimate?.duration ?? null,
  });
}
