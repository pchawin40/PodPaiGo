import type {
  DriveRouteOption,
  DriveRouteProfile,
  DriveRoutePreferences,
  TrustStatus,
} from '../types';

/**
 * Phase 1 drive route intelligence.
 *
 * This module is intentionally provider-agnostic and side-effect free so it can
 * be unit tested without the network. It knows:
 *   - which route profiles to request for a given preference set,
 *   - how to build a Google Routes `computeRoutes` request per profile,
 *   - how to parse a `computeRoutes` response (incl. toll info) into a
 *     `DriveRouteOption`,
 *   - how to rank the resulting options into a cautious comparison.
 *
 * It never claims HOV/express lanes are guaranteed and never changes parking
 * provider logic.
 */

export type RouteLatLng = { lat: number; lng: number };

export const DRIVE_ROUTE_PROFILES: readonly DriveRouteProfile[] = [
  'standard',
  'avoid_tolls',
  'toll_allowed',
  'hov_possible',
  'express_possible',
] as const;

export const DEFAULT_DRIVE_ROUTE_PREFERENCES: DriveRoutePreferences = {
  avoidTolls: false,
  hasTollPass: false,
  hovEligible: false,
  vehicleOccupancy: 1,
  showExpressLaneNotes: false,
};

/**
 * A toll route is only worth surfacing as "Fastest with tolls" when it saves at
 * least this many minutes over the standard route. Below this we prefer the
 * toll-free standard route.
 */
export const MEANINGFUL_TOLL_TIME_SAVINGS_MINUTES = 5;

export const DRIVE_ROUTE_COPY = {
  tollPossible: 'Toll possible',
  avoidsTolls: 'Avoids tolls',
  tollPriceUnavailable: 'Toll price unavailable; confirm in map app.',
  tollMayApply: 'Toll may apply; confirm in map app.',
  hovExpress:
    'HOV/express lanes may be available. Check posted signs, occupancy, pass, and time-of-day rules.',
} as const;

export const DRIVE_ROUTE_LABELS = {
  standard: 'Standard route',
  avoidTolls: 'Avoid tolls',
  fastestWithTolls: 'Fastest with tolls',
  tollAware: 'Toll route',
} as const;

const DRIVE_ROUTE_SOURCE_NAME = 'Google Routes';

/**
 * Feature gate. Drive route options are opt-in so we never make extra route
 * calls by default. Enabled via env flag OR when the caller passes an explicit
 * override (used by tests / future settings).
 */
export function isDriveRouteOptionsFeatureEnabled(
  override?: boolean,
): boolean {
  if (typeof override === 'boolean') return override;
  return process.env.NEXT_PUBLIC_ENABLE_DRIVE_ROUTE_OPTIONS === 'true';
}

/**
 * True when the user explicitly opted into a toll/HOV/express choice. Even when
 * the feature flag is off, an explicit user choice should be honored without a
 * global rollout.
 */
export function userChoseTollOrHovOption(
  prefs?: DriveRoutePreferences | null,
): boolean {
  if (!prefs) return false;
  return Boolean(
    prefs.avoidTolls ||
      prefs.hasTollPass ||
      prefs.hovEligible ||
      prefs.showExpressLaneNotes ||
      prefs.vehicleOccupancy > 1,
  );
}

/**
 * Decide whether to compute drive route options at all. We only spend extra
 * route calls when the feature is enabled OR the user chose a toll/HOV option.
 */
export function shouldComputeDriveRouteOptions(args: {
  prefs?: DriveRoutePreferences | null;
  featureEnabled?: boolean;
}): boolean {
  if (isDriveRouteOptionsFeatureEnabled(args.featureEnabled)) return true;
  return userChoseTollOrHovOption(args.prefs);
}

/**
 * Which route profiles to actually request for a preference set. We always
 * include `standard` as the baseline. We avoid requesting both `avoid_tolls`
 * and `toll_allowed` when the user clearly wants one direction, to keep extra
 * calls bounded.
 */
export function driveRouteProfilesToCompute(
  prefs?: DriveRoutePreferences | null,
): DriveRouteProfile[] {
  const profiles: DriveRouteProfile[] = ['standard'];

  if (prefs?.avoidTolls) {
    profiles.push('avoid_tolls');
    // Still request the toll-aware route so we can show what tolls would cost,
    // but ranking will never make it Best Overall (see rankDriveRouteOptions).
    profiles.push('toll_allowed');
  } else {
    profiles.push('toll_allowed');
  }

  return profiles;
}

type ComputeRoutesRequest = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

function waypointFor(point: RouteLatLng | string) {
  if (typeof point === 'string') {
    return { address: point };
  }
  return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
}

const TOLL_FIELD_MASK_PARTS = [
  'routes.travelAdvisory.tollInfo',
  'routes.legs.travelAdvisory.tollInfo',
];

const BASE_FIELD_MASK_PARTS = [
  'routes.duration',
  'routes.staticDuration',
  'routes.distanceMeters',
];

/**
 * Build a Google Routes `computeRoutes` request for a profile.
 *
 * - standard: no modifiers (matches existing behavior intent).
 * - avoid_tolls: routeModifiers.avoidTolls = true.
 * - toll_allowed: extraComputations: ["TOLLS"] + toll fields in the field mask.
 */
export function buildComputeRoutesRequest(args: {
  profile: DriveRouteProfile;
  origin: RouteLatLng | string;
  destination: RouteLatLng | string;
  departureTime?: string;
  apiKey: string;
}): ComputeRoutesRequest {
  const { profile, origin, destination, departureTime, apiKey } = args;

  const body: Record<string, unknown> = {
    origin: { waypoint: waypointFor(origin) },
    destination: { waypoint: waypointFor(destination) },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    regionCode: 'US',
  };

  if (departureTime) {
    body.departureTime = new Date(departureTime).toISOString();
  }

  const fieldMaskParts = [...BASE_FIELD_MASK_PARTS];

  if (profile === 'avoid_tolls') {
    body.routeModifiers = { avoidTolls: true };
  }

  if (profile === 'toll_allowed') {
    body.extraComputations = ['TOLLS'];
    fieldMaskParts.push(...TOLL_FIELD_MASK_PARTS);
  }

  return {
    url: 'https://routes.googleapis.com/directions/v2:computeRoutes',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMaskParts.join(','),
    },
    body,
  };
}

function parseDurationSeconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/^(\d+(?:\.\d+)?)s$/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

type Money = { currencyCode?: string; units?: string | number; nanos?: number };

function moneyToNumber(money: Money | undefined | null): number | undefined {
  if (!money) return undefined;
  const units =
    typeof money.units === 'string'
      ? Number(money.units)
      : typeof money.units === 'number'
        ? money.units
        : 0;
  const nanos = typeof money.nanos === 'number' ? money.nanos : 0;
  const total = units + nanos / 1e9;
  return Number.isFinite(total) ? total : undefined;
}

type ComputeRoutesElement = {
  duration?: unknown;
  staticDuration?: unknown;
  distanceMeters?: number;
  travelAdvisory?: {
    tollInfo?: { estimatedPrice?: Money[] };
  };
};

type ComputeRoutesResponse = {
  routes?: ComputeRoutesElement[];
  error?: { message?: string };
};

/**
 * Parse a `computeRoutes` response into a `DriveRouteOption`. Returns null when
 * the response has no usable route so callers can fall back gracefully.
 */
export function parseComputeRoutesResponse(args: {
  profile: DriveRouteProfile;
  json: ComputeRoutesResponse | null | undefined;
  prefs?: DriveRoutePreferences | null;
}): DriveRouteOption | null {
  const { profile, json, prefs } = args;
  const route = json?.routes?.[0];
  if (!route) return null;

  const durationSeconds = parseDurationSeconds(route.duration);
  if (durationSeconds === undefined) return null;

  const staticSeconds = parseDurationSeconds(route.staticDuration);

  const tollPrices = route.travelAdvisory?.tollInfo?.estimatedPrice ?? [];
  const tollNumbers = tollPrices
    .map((money) => moneyToNumber(money))
    .filter((n): n is number => typeof n === 'number');

  // For the toll-aware profile, the presence of a tollInfo block (even with no
  // priced entries) tells us a toll applies. For other profiles we never claim
  // a toll estimate.
  const tollInfoPresent = Boolean(route.travelAdvisory?.tollInfo);
  const tollAware = profile === 'toll_allowed';

  const tollEstimated = tollAware && tollNumbers.length > 0;
  const tollCostMin = tollEstimated ? Math.min(...tollNumbers) : undefined;
  const tollCostMax = tollEstimated ? Math.max(...tollNumbers) : undefined;

  // A toll route where tollInfo exists but no price could be resolved gets the
  // cautious "confirm in map app" note via the consumer; we still mark it as a
  // toll route so the UI can label it.
  const expressLaneNote = buildExpressLaneNote(prefs);

  // We only know a toll applies on the toll-aware route. We never assert a pass
  // is required when the user already told us they have one.
  const tollApplies = tollAware && (tollInfoPresent || tollEstimated);
  const tollPassRequired =
    tollApplies && !prefs?.hasTollPass ? true : undefined;

  return {
    id: `drive-${profile}`,
    label: labelForProfile(profile),
    profile,
    durationMinutes: Math.round(durationSeconds / 60),
    staticDurationMinutes:
      staticSeconds !== undefined ? Math.round(staticSeconds / 60) : undefined,
    distanceMeters:
      typeof route.distanceMeters === 'number' ? route.distanceMeters : undefined,
    tollEstimated,
    tollCostMin,
    tollCostMax,
    tollPassRequired,
    expressLaneNote,
    trustStatus: 'estimated' as TrustStatus,
    sourceName: DRIVE_ROUTE_SOURCE_NAME,
  };
}

function labelForProfile(profile: DriveRouteProfile): string {
  switch (profile) {
    case 'standard':
      return DRIVE_ROUTE_LABELS.standard;
    case 'avoid_tolls':
      return DRIVE_ROUTE_LABELS.avoidTolls;
    case 'toll_allowed':
      return DRIVE_ROUTE_LABELS.tollAware;
    case 'hov_possible':
    case 'express_possible':
      return DRIVE_ROUTE_LABELS.standard;
    default:
      return DRIVE_ROUTE_LABELS.standard;
  }
}

/**
 * Cautious HOV/express copy. Never guarantees eligibility. Returns undefined
 * when the user has not opted into express-lane notes and is not HOV eligible.
 */
export function buildExpressLaneNote(
  prefs?: DriveRoutePreferences | null,
): string | undefined {
  if (!prefs) return undefined;
  const wantsNote =
    prefs.showExpressLaneNotes || prefs.hovEligible || prefs.vehicleOccupancy > 1;
  if (!wantsNote) return undefined;
  return DRIVE_ROUTE_COPY.hovExpress;
}

export type DriveRouteRanking = {
  /** Options ordered with Best Overall first. */
  options: DriveRouteOption[];
  bestOverallId: string;
  /** Set when the toll route is meaningfully faster than the standard route. */
  fastestWithTollsId?: string;
};

/**
 * Rank drive route options into a cautious comparison.
 *
 * Rules:
 *  - If the user chose avoidTolls, the toll route can never be Best Overall.
 *  - Otherwise, if the toll route saves >= MEANINGFUL_TOLL_TIME_SAVINGS_MINUTES
 *    over standard, surface it as "Fastest with tolls" and make it Best Overall.
 *  - Otherwise prefer the toll-free standard route.
 */
export function rankDriveRouteOptions(
  options: DriveRouteOption[],
  prefs?: DriveRoutePreferences | null,
): DriveRouteRanking | null {
  if (options.length === 0) return null;

  const standard = options.find((o) => o.profile === 'standard');
  const avoid = options.find((o) => o.profile === 'avoid_tolls');
  const toll = options.find((o) => o.profile === 'toll_allowed');

  // Baseline best is the standard route, falling back to whatever exists.
  const baseline = standard ?? avoid ?? options[0];

  let bestOverallId = baseline.id;
  let fastestWithTollsId: string | undefined;

  if (prefs?.avoidTolls) {
    // Prefer an explicit avoid-tolls route when present; never let tolls win.
    bestOverallId = (avoid ?? standard ?? baseline).id;
  } else if (standard && toll) {
    const savings = standard.durationMinutes - toll.durationMinutes;
    if (savings >= MEANINGFUL_TOLL_TIME_SAVINGS_MINUTES) {
      toll.label = DRIVE_ROUTE_LABELS.fastestWithTolls;
      fastestWithTollsId = toll.id;
      bestOverallId = toll.id;
    } else {
      bestOverallId = standard.id;
    }
  }

  const ordered = [...options].sort((a, b) => {
    if (a.id === bestOverallId) return -1;
    if (b.id === bestOverallId) return 1;
    return a.durationMinutes - b.durationMinutes;
  });

  return { options: ordered, bestOverallId, fastestWithTollsId };
}
