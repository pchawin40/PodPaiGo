import type { TransitJourney, TransitOption, TripData } from '../types';
import {
  formatResolvedTransitFarePrimary,
  isKnownTransitFare,
  resolveTransitFare,
} from './transitFareResolver';
import {
  getTransitPassCoveredLabel,
  resolveTransitPaymentRegionContext,
} from './transitPaymentLabels';

type TransitWithComputedCost = (TransitOption | TransitJourney) & {
  calculatedCost?: number;
};

export function getTransitOneWayCost(transit: TransitOption | TransitJourney): number {
  const resolution = transit.transitFareResolution;
  if (resolution && !isKnownTransitFare(resolution)) {
    return Number.NaN;
  }

  return 'totalCost' in transit ? transit.totalCost : transit.price;
}

export function isTransitFareKnown(transit: TransitOption | TransitJourney): boolean {
  if (transit.transitFareResolution) {
    return isKnownTransitFare(transit.transitFareResolution);
  }

  const oneWay = 'totalCost' in transit ? transit.totalCost : transit.price;
  return Number.isFinite(oneWay);
}

export function resolveTransitFareForTrip(input: {
  transit: TransitOption | TransitJourney;
  tripData: TripData;
}): ReturnType<typeof resolveTransitFare> {
  if (input.transit.transitFareResolution) {
    return input.transit.transitFareResolution;
  }

  return resolveTransitFare({
    destination: input.transit.routeDestination || input.tripData.destination,
    origin: input.transit.routeOrigin || input.tripData.origin,
    agencyName: input.transit.sourceName,
    airportCode: input.tripData.airportCode,
  });
}

function parseTripDateTime(date: string | undefined, time?: string): Date | null {
  if (!date) return null;
  const parsed = new Date(`${date}T${time || '00:00'}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isAirportStyleTrip(tripData: TripData): boolean {
  if (tripData.destinationKind === 'airport') return true;
  return (
    tripData.type === 'one-way-departure' ||
    tripData.type === 'round-trip' ||
    tripData.type === 'one-way-arrival' ||
    tripData.type === 'dropoff-pickup'
  );
}

export function shouldIncludeReturnTransitLeg(tripData: TripData): boolean {
  if (tripData.type === 'round-trip') {
    return true;
  }

  if ((tripData.type as string) === 'airport-round-trip') {
    return true;
  }

  if (tripData.type === 'one-way-departure' && isAirportStyleTrip(tripData)) {
    const checkInDate = tripData.parkingCheckInDate || tripData.departureDate;
    const checkOutDate = tripData.parkingCheckOutDate;

    if (!checkInDate || !checkOutDate) {
      return false;
    }

    const checkIn = parseTripDateTime(
      checkInDate,
      tripData.parkingCheckInTime || tripData.departureTime,
    );
    const checkOut = parseTripDateTime(
      checkOutDate,
      tripData.parkingCheckOutTime || tripData.departureTime,
    );

    if (!checkIn || !checkOut || checkOut.getTime() <= checkIn.getTime()) {
      return false;
    }

    return checkIn.toDateString() !== checkOut.toDateString();
  }

  return false;
}

export function calculateTransitCost(
  transit: TransitOption | TransitJourney,
  tripData: TripData,
): number {
  if (tripData.transitPayment === 'orca-pass') {
    return 0;
  }

  const oneWayCost = getTransitOneWayCost(transit);
  if (!Number.isFinite(oneWayCost)) {
    return Number.NaN;
  }

  return shouldIncludeReturnTransitLeg(tripData) ? oneWayCost * 2 : oneWayCost;
}

export function getTransitTripTotalCost(
  transit: TransitOption | TransitJourney,
  tripData: TripData,
): number {
  if (tripData.transitPayment === 'orca-pass') {
    return 0;
  }

  const enriched = transit as TransitWithComputedCost;
  if (typeof enriched.calculatedCost === 'number') {
    return enriched.calculatedCost;
  }

  if (typeof transit.trueTotalCost === 'number') {
    return transit.trueTotalCost;
  }

  return calculateTransitCost(transit, tripData);
}

function formatFareAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export type TransitCostDisplay = {
  tripTotal: number;
  oneWay: number;
  includesReturnLeg: boolean;
  primary: string;
  secondary: string | null;
};

export function formatTransitCostDisplay(
  transit: TransitOption | TransitJourney,
  tripData: TripData,
): TransitCostDisplay {
  if (tripData.transitPayment === 'orca-pass') {
    const context = resolveTransitPaymentRegionContext({
      airportCode: tripData.airportCode,
    });

    return {
      tripTotal: 0,
      oneWay: 0,
      includesReturnLeg: false,
      primary: '$0',
      secondary: getTransitPassCoveredLabel(context),
    };
  }

  const fareResolution = resolveTransitFareForTrip({ transit, tripData });
  const oneWay = getTransitOneWayCost(transit);
  const includesReturnLeg = shouldIncludeReturnTransitLeg(tripData);
  const tripTotal = getTransitTripTotalCost(transit, tripData);

  if (!isKnownTransitFare(fareResolution) || !Number.isFinite(oneWay)) {
    return {
      tripTotal: Number.NaN,
      oneWay: Number.NaN,
      includesReturnLeg,
      primary: fareResolution.fareLabel,
      secondary: fareResolution.sourceLabel,
    };
  }

  if (includesReturnLeg) {
    return {
      tripTotal,
      oneWay,
      includesReturnLeg: true,
      primary: formatResolvedTransitFarePrimary(fareResolution, tripTotal, true),
      secondary: `$${formatFareAmount(oneWay)} one-way × 2`,
    };
  }

  return {
    tripTotal,
    oneWay,
    includesReturnLeg: false,
    primary: formatResolvedTransitFarePrimary(fareResolution, tripTotal, false),
    secondary: fareResolution.matchKind === 'city' ? fareResolution.sourceLabel : null,
  };
}
