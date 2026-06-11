import type { TransitOption, TripData } from '../types';
import { isEventVenueDestination } from './eventVenueDetection';
import { haversineMiles } from './routeMinutes';

export type TransitPracticalityAssessment = {
  isGeneralTrip: boolean;
  isAirportTrip: boolean;
  isEventTrip: boolean;
  isLongDistanceTrip: boolean;
  explicitTransitPreference: boolean;
  primaryEligible: boolean;
  confidence: 'High' | 'Medium' | 'Low';
  scorePenalty: number;
  costNote?: string;
  /**
   * True when the transit duration is fabricated/estimated-only for a
   * long-distance trip and should not be shown as a concrete time (no real
   * intercity transit schedule is attached).
   */
  suppressDuration: boolean;
  reasons: string[];
};

const LONG_DISTANCE_DRIVE_MINUTES = 120;
const LONG_DISTANCE_DIRECT_MILES = 75;
const MANY_TRANSFERS = 3;

function finiteMinutes(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function finiteDirectMiles(tripData: TripData): number | null {
  const { originLat, originLng, destinationLat, destinationLng } = tripData;
  if (
    typeof originLat !== 'number' ||
    typeof originLng !== 'number' ||
    typeof destinationLat !== 'number' ||
    typeof destinationLng !== 'number'
  ) {
    return null;
  }

  return haversineMiles(originLat, originLng, destinationLat, destinationLng);
}

function transferCount(transit: TransitOption | null | undefined): number {
  const maybeTransfers = (transit as { transfers?: unknown } | null | undefined)?.transfers;
  return typeof maybeTransfers === 'number' && Number.isFinite(maybeTransfers)
    ? Math.max(0, maybeTransfers)
    : 0;
}

function hasEstimatedOnlyRoute(transit: TransitOption | null | undefined): boolean {
  if (!transit) return true;
  const text = [
    transit.sourceName,
    transit.priceNote,
    ...(transit.assumptions || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    transit.trustStatus === 'estimated' ||
    transit.routeTrustStatus === 'estimated' ||
    /\b(open transit directions|confirm route|estimated from entered origin|not connected yet|exact route)\b/.test(
      text,
    )
  );
}

function isDataBackedTransit(transit: TransitOption | null | undefined): boolean {
  if (!transit) return false;
  if (hasEstimatedOnlyRoute(transit)) return false;
  return transit.trustStatus === 'verified-source' || transit.trustStatus === 'live';
}

function isAirportTrip(tripData: TripData): boolean {
  return (
    tripData.destinationKind === 'airport' ||
    Boolean(tripData.airportCode) ||
    tripData.type !== 'general-trip'
  );
}

function isEventTrip(input: {
  tripData: TripData;
  destinationLabel?: string | null;
  eventRulesLikely?: boolean;
}): boolean {
  if (input.eventRulesLikely) return true;
  return isEventVenueDestination({
    destination: input.destinationLabel || input.tripData.destination,
    destinationKind: input.tripData.destinationKind,
    origin: input.tripData.origin,
  });
}

export function assessTransitPracticality(input: {
  tripData: TripData;
  destinationLabel?: string | null;
  transit: TransitOption | null | undefined;
  transitDuration: number | null | undefined;
  driveMinutes: number | null | undefined;
  eventRulesLikely?: boolean;
}): TransitPracticalityAssessment {
  const airportTrip = isAirportTrip(input.tripData);
  const eventTrip = !airportTrip && isEventTrip(input);
  const generalTrip = !airportTrip;
  const explicitTransitPreference = input.tripData.transportAvailability === 'transit';
  const driveMinutes = finiteMinutes(input.driveMinutes);
  const transitDuration = finiteMinutes(input.transitDuration);
  const directMiles = finiteDirectMiles(input.tripData);
  const longDistanceTrip = Boolean(
    generalTrip &&
      !eventTrip &&
      ((driveMinutes != null && driveMinutes >= LONG_DISTANCE_DRIVE_MINUTES) ||
        (directMiles != null && directMiles >= LONG_DISTANCE_DIRECT_MILES)),
  );

  const reasons: string[] = [];
  const transfers = transferCount(input.transit);
  const missingDuration = transitDuration == null;
  const lowConfidence =
    !input.transit ||
    input.transit.trustStatus === 'fallback' ||
    input.transit.routeTrustStatus === 'fallback';
  const manyTransfers = transfers >= MANY_TRANSFERS;
  const estimatedOnly = hasEstimatedOnlyRoute(input.transit);
  const dataBacked = isDataBackedTransit(input.transit);
  const slowComparedToDrive =
    driveMinutes != null &&
    transitDuration != null &&
    transitDuration >= Math.max(driveMinutes + 45, driveMinutes * 1.35);
  const verySlowComparedToDrive =
    driveMinutes != null &&
    transitDuration != null &&
    transitDuration >= Math.max(driveMinutes + 60, driveMinutes * 1.75);

  if (airportTrip || eventTrip) {
    return {
      isGeneralTrip: generalTrip,
      isAirportTrip: airportTrip,
      isEventTrip: eventTrip,
      isLongDistanceTrip: false,
      explicitTransitPreference,
      primaryEligible: !missingDuration && !lowConfidence,
      confidence: input.transit?.trustStatus === 'verified-source' ? 'High' : 'Medium',
      scorePenalty: 0,
      suppressDuration: false,
      reasons: [],
    };
  }

  if (missingDuration) {
    reasons.push('Transit timing is missing; open directions to confirm.');
  }
  if (lowConfidence) {
    reasons.push('Transit route confidence is low.');
  }
  if (manyTransfers) {
    reasons.push('Requires several transfers.');
  }
  if (longDistanceTrip && estimatedOnly) {
    reasons.push('Transit is only an estimated planning link for this intercity trip.');
  }
  if (longDistanceTrip && slowComparedToDrive && !explicitTransitPreference) {
    reasons.push('Much slower than driving for this intercity trip.');
  } else if (verySlowComparedToDrive && !explicitTransitPreference) {
    reasons.push('Much slower than the known drive time.');
  }
  if (longDistanceTrip && !dataBacked && !explicitTransitPreference) {
    reasons.push('No data-backed intercity transit schedule is attached.');
  }

  const primaryEligible =
    reasons.length === 0 ||
    (explicitTransitPreference &&
      !missingDuration &&
      !lowConfidence &&
      !manyTransfers &&
      !(longDistanceTrip && !dataBacked));

  const scorePenalty = primaryEligible
    ? 0
    : longDistanceTrip
      ? 120
      : verySlowComparedToDrive || manyTransfers
        ? 80
        : 60;

  // A long-distance trip whose only transit signal is an estimated planning link
  // (no data-backed intercity schedule) produces a fabricated short duration
  // (e.g. a capped ~1h estimate). Do not present that as a concrete time.
  const suppressDuration = Boolean(
    longDistanceTrip &&
      !explicitTransitPreference &&
      !dataBacked &&
      transitDuration != null,
  );

  return {
    isGeneralTrip: generalTrip,
    isAirportTrip: false,
    isEventTrip: false,
    isLongDistanceTrip: longDistanceTrip,
    explicitTransitPreference,
    primaryEligible,
    confidence:
      !primaryEligible || lowConfidence || estimatedOnly
        ? 'Low'
        : input.transit?.trustStatus === 'verified-source'
          ? 'High'
          : 'Medium',
    scorePenalty,
    costNote: primaryEligible ? undefined : 'Possible but impractical',
    suppressDuration,
    reasons: [...new Set(reasons)],
  };
}
