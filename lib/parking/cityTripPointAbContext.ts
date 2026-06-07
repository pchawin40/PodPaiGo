import {
  formatTransitCostDisplay,
  getTransitTripTotalCost,
  calculateParkingDuration,
  type RankedRecommendation,
} from '../domain';
import type { Recommendation, TripData } from '../types';
import type { ParkingOption, RideshareOption, TransitOption } from '../types';
import { parkingTimeBreakdown } from './routeDisplay';
import { buildParkingDriveContextFromOption } from './routeMinutes';
import { resolveTripParkingContext } from '../trip/tripContext';
import { getParkingTotalPrice } from './priceDisplay';
import {
  selectBestParkAndRideForPointAb,
  toPointAbParkRidePresentation,
} from './parkAndRideSelection';
import { rankPointAbModes, type PointAbRankingResult } from './pointAbRanking';

export function computeCityTripPointAbRanking(input: {
  tripData: TripData;
  sort: 'easiest' | 'cheapest' | 'fastest';
  destinationLabel: string;
  noParkingPreferred: boolean;
  smartPickOption: ParkingOption | null;
  parkingDisplayOptions: ParkingOption[];
  sortedOptions: RankedRecommendation[];
  recommendation: Recommendation;
}): PointAbRankingResult | null {
  const parkingDurationMinutes = calculateParkingDuration(input.tripData);
  const bestParking = input.smartPickOption || input.parkingDisplayOptions[0] || null;
  const tripParkingContext = resolveTripParkingContext(input.tripData);

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

  const bestRide = input.sortedOptions.find((option) => option.type === 'rideshare') || null;
  const bestRideOption = bestRide?.option as RideshareOption | undefined;
  const ridePrice =
    typeof bestRide?.cost === 'number' && bestRide.cost < 999999
      ? bestRide.cost
      : bestRideOption?.price ?? null;
  const rideDuration =
    typeof bestRide?.duration === 'number' && bestRide.duration < 999999
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
    bestTransitOption && input.tripData && hasReliableTransit
      ? getTransitTripTotalCost(bestTransitOption, input.tripData)
      : typeof bestTransit?.cost === 'number' && bestTransit.cost < 999999
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
    parkRideReliable: Boolean(pointAbParkRide?.recommended),
  });
}
