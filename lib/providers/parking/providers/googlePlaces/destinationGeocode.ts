import { getGoogleMapsServerApiKey } from '../../../../env/googleMapsServerKey';
import {
  cacheGeocode,
  dedupeGeocodeRequest,
  getCachedGeocode,
} from '../../../../apiUsage/geocodeCache';
import { canMakeLiveApiCall, recordApiUsage, type ApiBudgetDecision } from '../../../../apiUsage/guard';
import { isProviderKillSwitchEnabled } from '../../../../apiUsage/config';
import { isGoogleParkingDiscoveryLiveBlocked } from '../../../../parking/googlePlacesGuard';
import { debugLog } from '../../../../utils/debug';

type LatLng = { lat: number; lng: number };
type GeocodeAttempt = {
  coords: LatLng | null;
  blockedReason?: ApiBudgetDecision['reason'];
};

/**
 * Ordered geocode anchor candidates for destination parking discovery, most
 * specific first: venue name + address, then the venue name alone, then the raw
 * destination. Generic across all city/event destinations — never venue
 * specific. For event venues the venue name/address still wins because it is the
 * most specific anchor.
 */
export function buildDestinationGeocodeCandidates(args: {
  destination: string;
  destinationName?: string;
}): string[] {
  const name = (args.destinationName || '').trim();
  const destination = (args.destination || '').trim();

  const candidates: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (
      trimmed &&
      !candidates.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())
    ) {
      candidates.push(trimmed);
    }
  };

  // Most specific: venue name + its address, unless the address already starts
  // with the name (avoids "Lumen Field, Lumen Field, 800 Occidental...").
  if (
    name &&
    destination &&
    name.toLowerCase() !== destination.toLowerCase() &&
    !destination.toLowerCase().startsWith(name.toLowerCase())
  ) {
    push(`${name}, ${destination}`);
  }
  if (name) push(name);
  if (destination) push(destination);

  return candidates;
}

async function geocodeOneAddress(address: string): Promise<GeocodeAttempt> {
  const cached = getCachedGeocode(address);
  if (cached) return { coords: cached };

  // Respect the dedicated geocoding kill switch and key availability before any
  // live call. This is independent of any traffic-provider instance.
  if (isProviderKillSwitchEnabled('geocoding')) return { coords: null, blockedReason: 'kill_switch' };

  const apiKey = getGoogleMapsServerApiKey();
  if (!apiKey) return { coords: null };

  const budget = await canMakeLiveApiCall('geocoding');
  if (!budget.allowed) return { coords: null, blockedReason: budget.reason };

  const coords = await dedupeGeocodeRequest(address, async () => {
    try {
      await recordApiUsage('geocoding');
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address,
      )}&key=${apiKey}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        status?: string;
        results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
      };
      if (data?.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
        const loc = data.results[0]?.geometry?.location;
        if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number') {
          const coords = { lat: loc.lat, lng: loc.lng };
          cacheGeocode(address, coords);
          return coords;
        }
      }
      return null;
    } catch {
      return null;
    }
  });
  return { coords };
}

/**
 * Resolve a destination anchor coordinate for parking distance ranking when the
 * caller did not supply destinationLat/destinationLng (common for fuzzy
 * text-input city/event trips). Uses the server Google key + Geocoding API
 * directly — independent of any traffic-provider instance — and respects the
 * Google parking-discovery kill switch, the geocoding kill switch / budget
 * guard, and key availability. Returns null when geocoding is unavailable so
 * callers degrade to "distance unknown" instead of faking equal distances.
 */
export async function geocodeDestinationForParking(args: {
  destination: string;
  destinationName?: string;
}): Promise<LatLng | null> {
  if (isGoogleParkingDiscoveryLiveBlocked()) return null;

  for (const candidate of buildDestinationGeocodeCandidates(args)) {
    const attempt = await geocodeOneAddress(candidate);
    if (attempt.coords) {
      debugLog('destination_parking_geocode_resolved', { candidate, coords: attempt.coords });
      return attempt.coords;
    }

    if (attempt.blockedReason) {
      debugLog('destination_parking_geocode_anchor_unavailable', {
        destination: args.destination,
        destinationName: args.destinationName ?? null,
        candidate,
        blocked_by_budget: attempt.blockedReason !== 'kill_switch',
        reason: attempt.blockedReason,
      });
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Destination parking] distance anchor unavailable because geocoding is blocked', {
          destination: args.destination,
          destinationName: args.destinationName ?? null,
          candidate,
          blockedByBudget: attempt.blockedReason !== 'kill_switch',
          reason: attempt.blockedReason,
        });
      }
      return null;
    }
  }

  debugLog('destination_parking_geocode_unresolved', {
    destination: args.destination,
    destinationName: args.destinationName ?? null,
  });
  return null;
}
