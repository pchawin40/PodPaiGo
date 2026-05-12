import type { RideshareEstimateConfidence, RideshareOption, TrafficEstimate } from '../types';

type RideProviderKind = 'uber' | 'lyft' | 'taxi';

type FareProfile = {
  id: string;
  name: string;
  providerKind: RideProviderKind;
  baseFare: number;
  perMile: number;
  perMinute: number;
  serviceFee: number;
  minimumFare: number;
  rangePercent: number;
  pickupWaitMinutes: number;
  availability: number;
};

type BuildRideshareEstimateOptionsArgs = {
  origin: string;
  destination: string;
  routeEstimate: TrafficEstimate;
  directionsUrl: string;
  uberUrl: string;
  lyftUrl: string;
  taxiSearchUrl: string;
};

const METERS_PER_MILE = 1609.344;

const FARE_PROFILES: FareProfile[] = [
  {
    id: 'uber',
    name: 'UberX',
    providerKind: 'uber',
    baseFare: 3.5,
    perMile: 1.75,
    perMinute: 0.36,
    serviceFee: 5.25,
    minimumFare: 14,
    rangePercent: 0.28,
    pickupWaitMinutes: 5,
    availability: 85,
  },
  {
    id: 'lyft',
    name: 'Lyft',
    providerKind: 'lyft',
    baseFare: 3.25,
    perMile: 1.7,
    perMinute: 0.34,
    serviceFee: 5,
    minimumFare: 13,
    rangePercent: 0.28,
    pickupWaitMinutes: 5,
    availability: 84,
  },
  {
    id: 'taxi',
    name: 'Taxi',
    providerKind: 'taxi',
    baseFare: 4,
    perMile: 3.15,
    perMinute: 0.48,
    serviceFee: 4,
    minimumFare: 18,
    rangePercent: 0.16,
    pickupWaitMinutes: 6,
    availability: 70,
  },
  {
    id: 'premium-xl',
    name: 'Uber Premium / XL',
    providerKind: 'uber',
    baseFare: 6,
    perMile: 2.65,
    perMinute: 0.55,
    serviceFee: 7,
    minimumFare: 26,
    rangePercent: 0.32,
    pickupWaitMinutes: 7,
    availability: 72,
  },
];

function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

function estimateMilesFromDuration(durationMinutes: number): number {
  // Baseline fallback: roughly 28 mph urban/suburban airport routing.
  return Math.max(1, (durationMinutes / 60) * 28);
}

function roundFare(value: number): number {
  return Math.max(1, Math.round(value));
}

function congestionMultiplier(congestion: TrafficEstimate['congestion']): number {
  switch (congestion) {
    case 'high':
      return 1.18;
    case 'medium':
      return 1.08;
    case 'low':
    default:
      return 1;
  }
}

function confidenceForRoute(routeEstimate: TrafficEstimate): RideshareEstimateConfidence {
  if (routeEstimate.routeUnavailable) return 'unavailable';

  return routeEstimate.trustStatus === 'live' &&
    typeof routeEstimate.distanceMeters === 'number' &&
    routeEstimate.distanceMeters > 0
    ? 'live-route-estimate'
    : 'baseline-estimate';
}

function confidenceLabel(confidence: RideshareEstimateConfidence): string {
  switch (confidence) {
    case 'live-route-estimate':
      return 'Estimated from live route distance/time';
    case 'baseline-estimate':
      return 'Baseline estimate from route time';
    case 'unavailable':
      return 'Route unavailable';
  }
}

function providerSourceLink(
  profile: FareProfile,
  args: BuildRideshareEstimateOptionsArgs
): string {
  if (profile.providerKind === 'uber') return args.uberUrl;
  if (profile.providerKind === 'lyft') return args.lyftUrl;
  return args.taxiSearchUrl;
}

function sourceName(profile: FareProfile): string {
  if (profile.providerKind === 'uber') return 'Uber';
  if (profile.providerKind === 'lyft') return 'Lyft';
  return 'Taxi fare estimate';
}

function estimateFareRange(args: {
  profile: FareProfile;
  durationMinutes: number;
  distanceMiles: number;
  congestion: TrafficEstimate['congestion'];
  confidence: RideshareEstimateConfidence;
}): { min: number; max: number; midpoint: number } {
  const { profile, durationMinutes, distanceMiles, congestion, confidence } = args;
  const demandMultiplier =
    profile.providerKind === 'taxi' ? 1 : congestionMultiplier(congestion);
  const baseline =
    profile.baseFare +
    profile.serviceFee +
    distanceMiles * profile.perMile +
    durationMinutes * profile.perMinute;
  const fare = Math.max(profile.minimumFare, baseline * demandMultiplier);
  const confidenceRangeExtra = confidence === 'baseline-estimate' ? 0.12 : 0;
  const rangePercent = profile.rangePercent + confidenceRangeExtra;
  const min = roundFare(fare * (1 - rangePercent));
  const max = Math.max(min + 4, roundFare(fare * (1 + rangePercent)));

  return {
    min,
    max,
    midpoint: roundFare((min + max) / 2),
  };
}

export function buildRideshareEstimateOptions(
  args: BuildRideshareEstimateOptionsArgs
): RideshareOption[] {
  const { routeEstimate } = args;

  if (routeEstimate.routeUnavailable || routeEstimate.duration <= 0) {
    return [];
  }

  const confidence = confidenceForRoute(routeEstimate);
  const hasRouteDistance =
    typeof routeEstimate.distanceMeters === 'number' &&
    routeEstimate.distanceMeters > 0;
  const distanceMiles = hasRouteDistance
    ? metersToMiles(routeEstimate.distanceMeters!)
    : estimateMilesFromDuration(routeEstimate.duration);
  const routeDistanceMeters = hasRouteDistance
    ? routeEstimate.distanceMeters
    : undefined;
  const now = new Date().toISOString();
  const routeBasis = confidenceLabel(confidence);

  return FARE_PROFILES.map((profile) => {
    const fare = estimateFareRange({
      profile,
      durationMinutes: routeEstimate.duration,
      distanceMiles,
      congestion: routeEstimate.congestion,
      confidence,
    });
    const isTaxi = profile.providerKind === 'taxi';
    const providerName = sourceName(profile);
    const liveRouteAssumption =
      confidence === 'live-route-estimate'
        ? 'Google Routes supplied traffic-aware duration and route distance.'
        : 'Distance was approximated from route duration because route distance was unavailable.';

    return {
      id: profile.id,
      name: profile.name,
      price: fare.midpoint,
      priceMin: fare.min,
      priceMax: fare.max,
      priceRangeLabel: `$${fare.min}-${fare.max}`,
      priceDisplay: 'estimated',
      priceUnit: 'total',
      priceNote: `${routeBasis}. Not a live ${isTaxi ? 'taxi' : providerName} quote; check the provider for final price.`,
      rideshareEstimateConfidence: confidence,
      distanceMiles: Math.round(distanceMiles * 10) / 10,
      routeDistanceMeters,
      pickupWaitMinutes: profile.pickupWaitMinutes,
      duration: routeEstimate.duration + profile.pickupWaitMinutes,
      availability: profile.availability,
      trustStatus: 'estimated',
      routeTrustStatus: routeEstimate.trustStatus,
      routeOrigin: args.origin,
      routeDestination: args.destination,
      sourceName: isTaxi ? 'Estimated taxi fare model' : `${providerName} estimate model`,
      sourceLink: providerSourceLink(profile, args),
      mapLink: args.directionsUrl,
      lastUpdated: now,
      assumptions: [
        liveRouteAssumption,
        `${profile.name} fare range estimated from ${distanceMiles.toFixed(1)} mi and ${routeEstimate.duration} min drive time.`,
        `Includes an estimated ${profile.pickupWaitMinutes} min pickup wait.`,
        'Not a live provider quote. Demand, tolls, airport fees, tips, and availability can change final price.',
      ],
    } satisfies RideshareOption;
  });
}
