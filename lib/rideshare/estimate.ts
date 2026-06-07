import type { RideshareEstimateConfidence, RideshareOption, TrafficEstimate, TripData } from '../types';

type RideProviderKind = 'uber' | 'lyft' | 'taxi';
type RideTier = 'standard' | 'comfort' | 'xl';

type FareProfile = {
  id: string;
  name: string;
  providerKind: RideProviderKind;
  tier: RideTier;
  baseFare: number;
  perMile: number;
  perMinute: number;
  serviceFee: number;
  airportSurcharge: number;
  airportPickupFee: number;
  airportDropoffFee: number;
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
  departureDateTime?: string;
  airportCode?: string;
  tripData?: TripData;
};

export type RideshareTripScope = 'one-way' | 'round-trip';

type DistanceBand = {
  id: string;
  typicalMiles: number;
  typicalMinutes: number;
  congestion: TrafficEstimate['congestion'];
};

export const RIDESHARE_ESTIMATE_DISCLAIMER = 'Not a live Uber/Lyft quote.';

const METERS_PER_MILE = 1609.344;

const DISTANCE_BANDS: Record<'near' | 'metro' | 'regional' | 'distant', DistanceBand> = {
  near: { id: 'near', typicalMiles: 8, typicalMinutes: 22, congestion: 'medium' },
  metro: { id: 'metro', typicalMiles: 18, typicalMinutes: 38, congestion: 'medium' },
  regional: { id: 'regional', typicalMiles: 32, typicalMinutes: 55, congestion: 'low' },
  distant: { id: 'distant', typicalMiles: 48, typicalMinutes: 72, congestion: 'low' },
};

const FARE_PROFILES: FareProfile[] = [
  {
    id: 'uber',
    name: 'UberX',
    providerKind: 'uber',
    tier: 'standard',
    baseFare: 4.25,
    perMile: 2.15,
    perMinute: 0.44,
    serviceFee: 8.75,
    airportSurcharge: 4,
    airportPickupFee: 3,
    airportDropoffFee: 3,
    minimumFare: 18,
    rangePercent: 0.38,
    pickupWaitMinutes: 5,
    availability: 85,
  },
  {
    id: 'lyft',
    name: 'Lyft',
    providerKind: 'lyft',
    tier: 'standard',
    baseFare: 4.25,
    perMile: 2.25,
    perMinute: 0.46,
    serviceFee: 8.95,
    airportSurcharge: 4,
    airportPickupFee: 3,
    airportDropoffFee: 3,
    minimumFare: 18,
    rangePercent: 0.4,
    pickupWaitMinutes: 5,
    availability: 84,
  },
  {
    id: 'taxi',
    name: 'Taxi',
    providerKind: 'taxi',
    tier: 'standard',
    baseFare: 4,
    perMile: 3.15,
    perMinute: 0.48,
    serviceFee: 4,
    airportSurcharge: 2,
    airportPickupFee: 2,
    airportDropoffFee: 2,
    minimumFare: 18,
    rangePercent: 0.16,
    pickupWaitMinutes: 6,
    availability: 70,
  },
  {
    id: 'premium-xl',
    name: 'Uber Premium / XL',
    providerKind: 'uber',
    tier: 'xl',
    baseFare: 7,
    perMile: 3.05,
    perMinute: 0.62,
    serviceFee: 10,
    airportSurcharge: 5,
    airportPickupFee: 4,
    airportDropoffFee: 4,
    minimumFare: 32,
    rangePercent: 0.42,
    pickupWaitMinutes: 7,
    availability: 72,
  },
];

function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

function estimateMilesFromDuration(durationMinutes: number): number {
  return Math.max(1, (durationMinutes / 60) * 28);
}

function roundFare(value: number): number {
  return Math.max(1, Math.round(value));
}

function formatFareRange(min: number, max: number): string {
  return `$${min}–$${max}`;
}

export function isRideshareRoundTripEstimate(tripData?: TripData | null): boolean {
  if (!tripData) return false;

  if (tripData.type === 'round-trip') {
    return true;
  }

  if (tripData.type === 'one-way-departure') {
    if (tripData.parkingCheckInDate && tripData.parkingCheckOutDate) {
      return tripData.parkingCheckOutDate !== tripData.parkingCheckInDate;
    }

    if (tripData.parkingCheckOutDate) {
      return true;
    }

    if (typeof tripData.parkingDuration === 'number' && tripData.parkingDuration >= 18 * 60) {
      return true;
    }
  }

  return false;
}

export function formatRidesharePriceDisplay(
  option: Pick<
    RideshareOption,
    | 'priceMin'
    | 'priceMax'
    | 'oneWayPriceMin'
    | 'oneWayPriceMax'
    | 'rideshareTripScope'
    | 'priceRangeLabel'
    | 'priceDisplay'
    | 'rideshareEstimateConfidence'
  > & {
    price?: number;
  },
): { primary: string; secondary: string | null } {
  const min = option.priceMin;
  const max = option.priceMax;

  if (typeof min === 'number' && typeof max === 'number') {
    if (option.rideshareTripScope === 'round-trip') {
      const eachWayMin = option.oneWayPriceMin ?? Math.round(min / 2);
      const eachWayMax = option.oneWayPriceMax ?? Math.round(max / 2);

      return {
        primary: `Estimated $${min}–$${max} round trip`,
        secondary: `~$${eachWayMin}–$${eachWayMax} each way`,
      };
    }

    return {
      primary: `Estimated $${min}–$${max} one way`,
      secondary: null,
    };
  }

  if (option.priceRangeLabel) {
    return {
      primary: `Estimated ${option.priceRangeLabel}`,
      secondary: null,
    };
  }

  if (option.priceDisplay === 'check-live') {
    return {
      primary: 'Open app for live price',
      secondary: 'PodPaiGo does not have a live Uber/Lyft quote.',
    };
  }

  if (option.rideshareEstimateConfidence === 'unavailable') {
    return {
      primary: 'Fare estimate unavailable',
      secondary: 'Open the rideshare app for current pricing.',
    };
  }

  if (typeof option.price === 'number' && option.price > 0) {
    return {
      primary: `Estimated $${option.price}`,
      secondary: null,
    };
  }

  return {
    primary: 'Fare estimate unavailable',
    secondary: 'Open app for live price.',
  };
}

function longDistanceAirportMultiplier(distanceMiles: number): number {
  if (distanceMiles >= 40) return 1.05;
  if (distanceMiles >= 28) return 1.04;
  if (distanceMiles >= 18) return 1.03;
  return 1;
}

function longTripFareFloor(distanceMiles: number, profile: FareProfile): number {
  if (profile.providerKind === 'taxi' || distanceMiles < 30) {
    return profile.minimumFare;
  }

  return Math.max(
    profile.minimumFare,
    Math.round(distanceMiles * 2.2 + profile.baseFare + profile.serviceFee * 0.6),
  );
}

function longDistanceAirportFare(args: {
  profile: FareProfile;
  durationMinutes: number;
  distanceMiles: number;
  airportFees: number;
}): number {
  const { profile, durationMinutes, distanceMiles, airportFees } = args;

  return (
    profile.baseFare +
    profile.serviceFee * 0.75 +
    airportFees +
    distanceMiles * (profile.providerKind === 'taxi' ? 2.95 : 1.3) +
    durationMinutes * profile.perMinute * 0.85
  );
}

export function congestionMultiplier(congestion: TrafficEstimate['congestion']): number {
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

export function timeOfDayMultiplier(departureDateTime?: string): {
  multiplier: number;
  label: string;
} {
  if (!departureDateTime) {
    return { multiplier: 1, label: 'standard' };
  }

  const date = new Date(departureDateTime);
  if (Number.isNaN(date.getTime())) {
    return { multiplier: 1, label: 'standard' };
  }

  const hour = date.getHours();
  const day = date.getDay();
  const isWeekday = day >= 1 && day <= 5;

  if (isWeekday && ((hour >= 7 && hour < 9) || (hour >= 16 && hour < 19))) {
    return { multiplier: 1.22, label: 'peak commute' };
  }

  if (hour >= 22 || hour < 5) {
    return { multiplier: 1.1, label: 'late night' };
  }

  if (hour >= 4 && hour < 7) {
    return { multiplier: 1.12, label: 'early airport departure' };
  }

  return { multiplier: 1, label: 'standard' };
}

export function resolveOriginDistanceBand(origin: string, airportCode?: string): DistanceBand {
  const normalized = origin.toLowerCase().trim();
  const code = (airportCode || 'SEA').toUpperCase();

  if (
    normalized.includes('airport') ||
    normalized.includes('terminal') ||
    normalized.includes(code.toLowerCase()) ||
    normalized.includes('seatac')
  ) {
    return DISTANCE_BANDS.near;
  }

  if (code === 'SEA') {
    if (
      normalized.includes('capitol hill') ||
      normalized.includes('downtown seattle') ||
      normalized.includes('belltown') ||
      normalized.includes('university district') ||
      normalized.includes('fremont')
    ) {
      return DISTANCE_BANDS.metro;
    }

    if (
      normalized.includes('northgate') ||
      normalized.includes('bellevue') ||
      normalized.includes('tacoma') ||
      normalized.includes('everett')
    ) {
      return DISTANCE_BANDS.regional;
    }

    if (
      normalized.includes('monroe') ||
      normalized.includes('snohomish') ||
      normalized.includes('marysville') ||
      normalized.includes('enumclaw') ||
      normalized.includes('snoqualmie') ||
      normalized.includes('cle elum')
    ) {
      return DISTANCE_BANDS.distant;
    }
  }

  if (normalized.length <= 24) {
    return DISTANCE_BANDS.metro;
  }

  return DISTANCE_BANDS.regional;
}

export function buildDistanceBandRouteEstimate(
  origin: string,
  destination: string,
  band: DistanceBand,
): TrafficEstimate {
  return {
    route: `${origin} -> ${destination}`,
    duration: band.typicalMinutes,
    distanceMeters: Math.round(band.typicalMiles * METERS_PER_MILE),
    congestion: band.congestion,
    trustStatus: 'estimated',
    routeUnavailable: false,
    sourceName: 'Distance band model',
    lastUpdated: new Date().toISOString(),
    assumptions: [
      `Route data unavailable; using ${band.id} airport distance band (${band.typicalMiles} mi / ${band.typicalMinutes} min).`,
    ],
  };
}

export function resolveEffectiveRouteEstimate(args: {
  routeEstimate: TrafficEstimate;
  origin: string;
  destination: string;
  airportCode?: string;
}): {
  route: TrafficEstimate;
  confidence: RideshareEstimateConfidence;
  usedFallback: boolean;
} {
  const hasUsableRoute =
    !args.routeEstimate.routeUnavailable && args.routeEstimate.duration > 0;

  if (hasUsableRoute) {
    const hasDistance =
      typeof args.routeEstimate.distanceMeters === 'number' &&
      args.routeEstimate.distanceMeters > 0;

    return {
      route: args.routeEstimate,
      confidence:
        hasDistance && args.routeEstimate.trustStatus === 'live'
          ? 'live-route-estimate'
          : 'baseline-estimate',
      usedFallback: false,
    };
  }

  const band = resolveOriginDistanceBand(args.origin, args.airportCode);

  return {
    route: buildDistanceBandRouteEstimate(args.origin, args.destination, band),
    confidence: 'baseline-estimate',
    usedFallback: true,
  };
}

function confidenceLabel(confidence: RideshareEstimateConfidence): string {
  switch (confidence) {
    case 'live-route-estimate':
    case 'baseline-estimate':
      return 'Estimated';
    case 'unavailable':
      return 'Unavailable';
  }
}

function providerSourceLink(
  profile: FareProfile,
  args: BuildRideshareEstimateOptionsArgs,
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

export function estimateFareRange(args: {
  profile: FareProfile;
  durationMinutes: number;
  distanceMiles: number;
  congestion: TrafficEstimate['congestion'];
  confidence: RideshareEstimateConfidence;
  departureDateTime?: string;
}): { min: number; max: number; midpoint: number } {
  const { profile, durationMinutes, distanceMiles, congestion, confidence, departureDateTime } =
    args;

  const trafficMultiplier =
    profile.providerKind === 'taxi' ? 1 : congestionMultiplier(congestion);
  const timeMultiplier = timeOfDayMultiplier(departureDateTime).multiplier;
  const tierMultiplier = profile.tier === 'xl' ? 1.08 : profile.tier === 'comfort' ? 1.05 : 1;

  const airportFees =
    profile.airportSurcharge + profile.airportPickupFee + profile.airportDropoffFee;

  const baseline =
    profile.baseFare +
    profile.serviceFee +
    airportFees +
    distanceMiles * profile.perMile +
    durationMinutes * profile.perMinute;

  const adjustedBaseline = baseline * tierMultiplier;
  const distanceMultiplier = longDistanceAirportMultiplier(distanceMiles);
  const modeledLongDistanceFare =
    distanceMiles >= 35
      ? longDistanceAirportFare({
          profile,
          durationMinutes,
          distanceMiles,
          airportFees,
        }) * longDistanceAirportMultiplier(distanceMiles)
      : null;
  const fareBeforeFloor =
    modeledLongDistanceFare ?? adjustedBaseline * trafficMultiplier * timeMultiplier * distanceMultiplier;
  const fare = Math.max(
    longTripFareFloor(distanceMiles, profile),
    fareBeforeFloor,
  );
  const confidenceRangeExtra =
    confidence === 'baseline-estimate'
      ? distanceMiles >= 35
        ? 0.06
        : 0.12
      : 0.06;
  const baseRangePercent = profile.rangePercent + confidenceRangeExtra;
  const rangePercent =
    distanceMiles >= 40
      ? Math.min(0.13, baseRangePercent)
      : distanceMiles >= 35
        ? Math.min(0.18, baseRangePercent)
        : Math.min(0.5, baseRangePercent);
  const min = roundFare(fare * (1 - rangePercent));
  const max = Math.max(min + 8, roundFare(fare * (1 + rangePercent)));

  return {
    min,
    max,
    midpoint: roundFare((min + max) / 2),
  };
}

export function buildRideshareEstimateOptions(
  args: BuildRideshareEstimateOptionsArgs,
): RideshareOption[] {
  const { routeEstimate } = args;
  const effective = resolveEffectiveRouteEstimate({
    routeEstimate,
    origin: args.origin,
    destination: args.destination,
    airportCode: args.airportCode,
  });

  const resolvedRoute = effective.route;
  const confidence = effective.confidence;
  const hasRouteDistance =
    typeof resolvedRoute.distanceMeters === 'number' && resolvedRoute.distanceMeters > 0;
  const distanceMiles = hasRouteDistance
    ? metersToMiles(resolvedRoute.distanceMeters!)
    : estimateMilesFromDuration(resolvedRoute.duration);
  const routeDistanceMeters = hasRouteDistance ? resolvedRoute.distanceMeters : undefined;
  const now = new Date().toISOString();
  const timeOfDay = timeOfDayMultiplier(args.departureDateTime);
  const estimateLabel = confidenceLabel(confidence);
  const tripScope: RideshareTripScope = isRideshareRoundTripEstimate(args.tripData)
    ? 'round-trip'
    : 'one-way';

  return FARE_PROFILES.map((profile) => {
    const oneWayFare = estimateFareRange({
      profile,
      durationMinutes: resolvedRoute.duration,
      distanceMiles,
      congestion: resolvedRoute.congestion,
      confidence,
      departureDateTime: args.departureDateTime,
    });
    const fare =
      tripScope === 'round-trip'
        ? {
            min: oneWayFare.min * 2,
            max: oneWayFare.max * 2,
            midpoint: oneWayFare.midpoint * 2,
          }
        : oneWayFare;
    const isTaxi = profile.providerKind === 'taxi';
    const providerName = sourceName(profile);
    const scopeLabel = tripScope === 'round-trip' ? 'round trip' : 'one way';
    const routeBasis = effective.usedFallback
      ? `Estimated ${scopeLabel} rideshare range from ${resolveOriginDistanceBand(args.origin, args.airportCode).id} airport distance band`
      : hasRouteDistance
        ? `Estimated ${scopeLabel} rideshare range from route distance and drive time`
        : `Estimated ${scopeLabel} rideshare range from route drive time`;
    const display = formatRidesharePriceDisplay({
      priceMin: fare.min,
      priceMax: fare.max,
      oneWayPriceMin: oneWayFare.min,
      oneWayPriceMax: oneWayFare.max,
      rideshareTripScope: tripScope,
      price: fare.midpoint,
    });

    return {
      id: profile.id,
      name: profile.name,
      price: fare.midpoint,
      priceMin: fare.min,
      priceMax: fare.max,
      oneWayPriceMin: oneWayFare.min,
      oneWayPriceMax: oneWayFare.max,
      rideshareTripScope: tripScope,
      priceRangeLabel: formatFareRange(fare.min, fare.max),
      priceDisplay: 'estimated',
      priceUnit: 'total',
      priceNote: `${routeBasis}. ${display.secondary ? `${display.secondary}. ` : ''}${RIDESHARE_ESTIMATE_DISCLAIMER}`,
      rideshareEstimateConfidence: confidence,
      distanceMiles: Math.round(distanceMiles * 10) / 10,
      routeDistanceMeters,
      pickupWaitMinutes: profile.pickupWaitMinutes,
      driveMinutes: resolvedRoute.duration,
      duration:
        (resolvedRoute.duration + profile.pickupWaitMinutes) *
        (tripScope === 'round-trip' ? 2 : 1),
      totalOptionMinutes:
        (resolvedRoute.duration + profile.pickupWaitMinutes) *
        (tripScope === 'round-trip' ? 2 : 1),
      timingBreakdown: {
        driveMinutes: resolvedRoute.duration,
        parkingBufferMinutes: null,
        walkToDestinationMinutes: null,
        pickupWaitMinutes: profile.pickupWaitMinutes,
        totalOptionMinutes:
          (resolvedRoute.duration + profile.pickupWaitMinutes) *
          (tripScope === 'round-trip' ? 2 : 1),
      },
      availability: profile.availability,
      trustStatus: 'estimated',
      routeTrustStatus: resolvedRoute.trustStatus,
      routeOrigin: args.origin,
      routeDestination: args.destination,
      sourceName: isTaxi ? 'Estimated taxi fare model' : `${providerName} estimate model`,
      sourceLink: providerSourceLink(profile, args),
      mapLink: args.directionsUrl,
      lastUpdated: now,
      assumptions: [
        `${estimateLabel} ${profile.name} ${scopeLabel} estimate (${formatFareRange(fare.min, fare.max)}).`,
        tripScope === 'round-trip'
          ? `Includes estimated outbound and return rides (${formatFareRange(oneWayFare.min, oneWayFare.max)} each way).`
          : 'Includes a single origin-to-airport ride estimate.',
        effective.usedFallback
          ? 'Route data was unavailable; estimate uses a typical airport distance band.'
          : hasRouteDistance
            ? 'Route distance and traffic-aware drive time informed this estimate.'
            : 'Drive time informed this estimate; distance was approximated from duration.',
        `Includes estimated airport surcharge, pickup fee, and dropoff fee.`,
        `Time-of-day factor: ${timeOfDay.label} (${timeOfDay.multiplier.toFixed(2)}x).`,
        `Traffic/congestion factor: ${resolvedRoute.congestion}.`,
        `${profile.name} fare range estimated from ${distanceMiles.toFixed(1)} mi and ${resolvedRoute.duration} min drive time.`,
        `Includes an estimated ${profile.pickupWaitMinutes} min pickup wait per ride.`,
        RIDESHARE_ESTIMATE_DISCLAIMER,
      ],
    } satisfies RideshareOption;
  });
}
