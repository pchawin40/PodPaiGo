import type { DriveRouteOption, DriveRoutePreferences } from '../types';
import {
  buildComputeRoutesRequest,
  driveRouteProfilesToCompute,
  parseComputeRoutesResponse,
  rankDriveRouteOptions,
  shouldComputeDriveRouteOptions,
  type DriveRouteRanking,
  type RouteLatLng,
} from './driveRouteProfiles';

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export type ComputeDriveRouteOptionsArgs = {
  origin: RouteLatLng | string;
  destination: RouteLatLng | string;
  departureTime?: string;
  prefs?: DriveRoutePreferences | null;
  apiKey: string;
  /** Feature flag override; when omitted falls back to the env flag. */
  featureEnabled?: boolean;
  /** Injectable fetch for testing. Defaults to global fetch. */
  fetchImpl?: FetchLike;
};

/**
 * Orchestrate the per-profile `computeRoutes` calls and rank them.
 *
 * Returns null when drive route options are not enabled / not chosen so callers
 * can cheaply skip without making any extra route calls.
 */
export async function computeDriveRouteOptions(
  args: ComputeDriveRouteOptionsArgs,
): Promise<DriveRouteRanking | null> {
  if (
    !shouldComputeDriveRouteOptions({
      prefs: args.prefs,
      featureEnabled: args.featureEnabled,
    })
  ) {
    return null;
  }

  if (!args.apiKey) return null;

  const fetchImpl: FetchLike =
    args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  if (typeof fetchImpl !== 'function') return null;

  const profiles = driveRouteProfilesToCompute(args.prefs);

  const results = await Promise.all(
    profiles.map(async (profile) => {
      const request = buildComputeRoutesRequest({
        profile,
        origin: args.origin,
        destination: args.destination,
        departureTime: args.departureTime,
        apiKey: args.apiKey,
      });

      try {
        const res = await fetchImpl(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify(request.body),
        });
        if (!res.ok) return null;
        const text = await res.text();
        if (!text) return null;
        const json = JSON.parse(text);
        return parseComputeRoutesResponse({ profile, json, prefs: args.prefs });
      } catch {
        return null;
      }
    }),
  );

  const options = results.filter((o): o is DriveRouteOption => o !== null);
  return rankDriveRouteOptions(options, args.prefs);
}
