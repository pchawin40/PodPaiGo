import {
  DRIVE_ROUTE_COPY,
  DRIVE_ROUTE_LABELS,
  buildComputeRoutesRequest,
  buildExpressLaneNote,
  driveRouteProfilesToCompute,
  parseComputeRoutesResponse,
  rankDriveRouteOptions,
  shouldComputeDriveRouteOptions,
  userChoseTollOrHovOption,
} from '../driveRouteProfiles';
import { computeDriveRouteOptions } from '../computeDriveRouteOptions';
import type { DriveRouteOption, DriveRoutePreferences } from '../../types';

const ORIGIN = { lat: 47.6, lng: -122.3 };
const DEST = { lat: 47.9, lng: -122.2 };

function prefs(overrides: Partial<DriveRoutePreferences> = {}): DriveRoutePreferences {
  return {
    avoidTolls: false,
    hasTollPass: false,
    hovEligible: false,
    vehicleOccupancy: 1,
    showExpressLaneNotes: false,
    ...overrides,
  };
}

function tollResponse(durationSeconds: number, tollUnits?: number) {
  return {
    routes: [
      {
        duration: `${durationSeconds}s`,
        staticDuration: `${durationSeconds + 60}s`,
        distanceMeters: 24000,
        ...(tollUnits !== undefined
          ? {
              travelAdvisory: {
                tollInfo: {
                  estimatedPrice: [{ currencyCode: 'USD', units: String(tollUnits), nanos: 0 }],
                },
              },
            }
          : {}),
      },
    ],
  };
}

function basicResponse(durationSeconds: number) {
  return {
    routes: [
      {
        duration: `${durationSeconds}s`,
        staticDuration: `${durationSeconds}s`,
        distanceMeters: 24000,
      },
    ],
  };
}

describe('drive route profiles — request building', () => {
  // Test 1: existing standard route behavior unchanged (no modifiers / no toll fields).
  it('builds a standard request with no toll modifiers or extra computations', () => {
    const req = buildComputeRoutesRequest({
      profile: 'standard',
      origin: ORIGIN,
      destination: DEST,
      apiKey: 'KEY',
    });

    expect(req.url).toContain('directions/v2:computeRoutes');
    expect(req.body.routeModifiers).toBeUndefined();
    expect(req.body.extraComputations).toBeUndefined();
    expect(req.headers['X-Goog-FieldMask']).not.toContain('tollInfo');
  });

  // Test 2: avoidTolls preference sends avoidTolls route modifier.
  it('sends routeModifiers.avoidTolls = true for the avoid_tolls profile', () => {
    const req = buildComputeRoutesRequest({
      profile: 'avoid_tolls',
      origin: ORIGIN,
      destination: DEST,
      apiKey: 'KEY',
    });

    expect(req.body.routeModifiers).toEqual({ avoidTolls: true });
    expect(req.body.extraComputations).toBeUndefined();
  });

  // Test 3: toll-aware route requests TOLLS extra computation and toll field mask.
  it('requests TOLLS extra computation and toll fields for the toll_allowed profile', () => {
    const req = buildComputeRoutesRequest({
      profile: 'toll_allowed',
      origin: ORIGIN,
      destination: DEST,
      apiKey: 'KEY',
    });

    expect(req.body.extraComputations).toEqual(['TOLLS']);
    expect(req.headers['X-Goog-FieldMask']).toContain('routes.travelAdvisory.tollInfo');
    expect(req.body.routeModifiers).toBeUndefined();
  });
});

describe('drive route profiles — parsing', () => {
  it('parses toll cost from a toll-aware response', () => {
    const option = parseComputeRoutesResponse({
      profile: 'toll_allowed',
      json: tollResponse(1200, 6),
      prefs: prefs(),
    });

    expect(option).not.toBeNull();
    expect(option?.profile).toBe('toll_allowed');
    expect(option?.durationMinutes).toBe(20);
    expect(option?.tollEstimated).toBe(true);
    expect(option?.tollCostMin).toBe(6);
    expect(option?.tollCostMax).toBe(6);
  });

  it('marks toll as not estimated when price is missing (consumer shows confirm-in-map copy)', () => {
    const option = parseComputeRoutesResponse({
      profile: 'toll_allowed',
      json: tollResponse(1200),
      prefs: prefs(),
    });

    expect(option?.tollEstimated).toBe(false);
    expect(option?.tollCostMin).toBeUndefined();
  });

  it('returns null for an empty response', () => {
    expect(
      parseComputeRoutesResponse({ profile: 'standard', json: { routes: [] }, prefs: prefs() }),
    ).toBeNull();
  });
});

describe('drive route profiles — ranking', () => {
  function option(
    profile: DriveRouteOption['profile'],
    durationMinutes: number,
  ): DriveRouteOption {
    return {
      id: `drive-${profile}`,
      label: profile,
      profile,
      durationMinutes,
      tollEstimated: profile === 'toll_allowed',
      trustStatus: 'estimated',
      sourceName: 'Google Routes',
    };
  }

  // Test 4: toll route with meaningful time savings appears as comparison option.
  it('surfaces a meaningfully faster toll route as "Fastest with tolls" and best overall', () => {
    const ranking = rankDriveRouteOptions(
      [option('standard', 30), option('toll_allowed', 20)],
      prefs(),
    );

    expect(ranking).not.toBeNull();
    expect(ranking?.fastestWithTollsId).toBe('drive-toll_allowed');
    expect(ranking?.bestOverallId).toBe('drive-toll_allowed');
    const toll = ranking?.options.find((o) => o.profile === 'toll_allowed');
    expect(toll?.label).toBe(DRIVE_ROUTE_LABELS.fastestWithTolls);
  });

  it('prefers the standard route when toll savings are small', () => {
    const ranking = rankDriveRouteOptions(
      [option('standard', 30), option('toll_allowed', 28)],
      prefs(),
    );

    expect(ranking?.bestOverallId).toBe('drive-standard');
    expect(ranking?.fastestWithTollsId).toBeUndefined();
  });

  // Test 5: avoidTolls user preference prevents toll route from winning.
  it('never makes the toll route best overall when the user chose avoidTolls', () => {
    const ranking = rankDriveRouteOptions(
      [option('standard', 30), option('avoid_tolls', 33), option('toll_allowed', 18)],
      prefs({ avoidTolls: true }),
    );

    expect(ranking?.bestOverallId).not.toBe('drive-toll_allowed');
    expect(ranking?.bestOverallId).toBe('drive-avoid_tolls');
    expect(ranking?.fastestWithTollsId).toBeUndefined();
  });
});

describe('drive route profiles — HOV/express copy', () => {
  // Test 6: HOV/express copy is cautious and does not guarantee eligibility.
  it('produces cautious HOV/express copy that never guarantees eligibility', () => {
    const note = buildExpressLaneNote(prefs({ hovEligible: true }));

    expect(note).toBe(DRIVE_ROUTE_COPY.hovExpress);
    expect(note).toMatch(/may be available/i);
    expect(note?.toLowerCase()).not.toContain('guaranteed');
    expect(note).toMatch(/check posted signs/i);
  });

  it('omits the HOV/express note when the user did not opt in', () => {
    expect(buildExpressLaneNote(prefs())).toBeUndefined();
  });
});

describe('drive route profiles — gating', () => {
  it('detects an explicit toll/HOV choice', () => {
    expect(userChoseTollOrHovOption(prefs())).toBe(false);
    expect(userChoseTollOrHovOption(prefs({ avoidTolls: true }))).toBe(true);
    expect(userChoseTollOrHovOption(prefs({ vehicleOccupancy: 3 }))).toBe(true);
  });

  it('only computes options when enabled or chosen', () => {
    expect(shouldComputeDriveRouteOptions({ prefs: prefs(), featureEnabled: false })).toBe(false);
    expect(shouldComputeDriveRouteOptions({ prefs: prefs(), featureEnabled: true })).toBe(true);
    expect(
      shouldComputeDriveRouteOptions({ prefs: prefs({ hasTollPass: true }), featureEnabled: false }),
    ).toBe(true);
  });

  it('always includes the standard baseline profile', () => {
    expect(driveRouteProfilesToCompute(prefs())).toContain('standard');
    expect(driveRouteProfilesToCompute(prefs({ avoidTolls: true }))).toContain('avoid_tolls');
  });
});

describe('computeDriveRouteOptions — orchestrator', () => {
  // Test 8: no extra route calls when route options are disabled.
  it('makes no route calls when disabled and not chosen', async () => {
    const fetchImpl = jest.fn();

    const result = await computeDriveRouteOptions({
      origin: ORIGIN,
      destination: DEST,
      prefs: prefs(),
      apiKey: 'KEY',
      featureEnabled: false,
      fetchImpl: fetchImpl as never,
    });

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches per-profile and ranks when enabled', async () => {
    const fetchImpl = jest.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      // Standard route is slow; toll route is meaningfully faster.
      const isToll = Array.isArray(body.extraComputations);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(isToll ? tollResponse(1080, 7) : basicResponse(1800)),
      };
    });

    const result = await computeDriveRouteOptions({
      origin: ORIGIN,
      destination: DEST,
      prefs: prefs({ hasTollPass: true }),
      apiKey: 'KEY',
      featureEnabled: false,
      fetchImpl: fetchImpl as never,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result?.fastestWithTollsId).toBe('drive-toll_allowed');
    expect(result?.bestOverallId).toBe('drive-toll_allowed');
  });
});
