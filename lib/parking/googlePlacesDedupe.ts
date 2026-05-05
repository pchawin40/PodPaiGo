import { ParkingOption } from '../types';
import { getParkingTotalPrice, getParkingDailyPrice } from './priceDisplay';

type ParkingOptionWithPlace = ParkingOption & {
  googlePlaceId?: string;
  placeId?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  bookingProvider?: string;
  sourceName?: string;
};

function normalizeText(value: string | undefined | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/airportparkingreservations|parkwhiz|spothero|way\.com/g, '')
    .replace(/seatac|sea-tac|seattle tacoma|seattle-tacoma/g, '')
    .replace(/parking|airport|garage|lot|valet|self park|self-park/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPlaceId(option: ParkingOptionWithPlace): string | null {
  return option.googlePlaceId || option.placeId || null;
}

function getLat(option: ParkingOptionWithPlace): number | null {
  if (typeof option.latitude === 'number') return option.latitude;
  if (typeof option.lat === 'number') return option.lat;
  return null;
}

function getLng(option: ParkingOptionWithPlace): number | null {
  if (typeof option.longitude === 'number') return option.longitude;
  if (typeof option.lng === 'number') return option.lng;
  return null;
}

function distanceMeters(a: ParkingOptionWithPlace, b: ParkingOptionWithPlace): number | null {
  const lat1 = getLat(a);
  const lng1 = getLng(a);
  const lat2 = getLat(b);
  const lng2 = getLng(b);

  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;

  const earthRadius = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function sameParkingPlace(a: ParkingOptionWithPlace, b: ParkingOptionWithPlace): boolean {
  const aPlaceId = getPlaceId(a);
  const bPlaceId = getPlaceId(b);

  // Strongest match once Google Places exists.
  if (aPlaceId && bPlaceId && aPlaceId === bPlaceId) return true;

  const aName = normalizeText(a.name);
  const bName = normalizeText(b.name);
  const aAddress = normalizeText(a.address);
  const bAddress = normalizeText(b.address);

  // Address match is pretty strong.
  if (aAddress && bAddress && aAddress === bAddress) return true;

  const meters = distanceMeters(a, b);

  // Same/similar name and very close location.
  if (aName && bName && (aName.includes(bName) || bName.includes(aName))) {
    if (meters != null && meters <= 150) return true;
  }

  // Fallback for providers using slightly different names.
  if (aName && bName && aName === bName) return true;

  return false;
}

function providerPriority(option: ParkingOptionWithPlace): number {
  const provider = `${option.bookingProvider || ''} ${option.sourceName || ''}`.toLowerCase();

  // Lower is better.
  if (provider.includes('parkwhiz')) return 1;
  if (provider.includes('airportparkingreservations')) return 2;
  if (provider.includes('spothero')) return 3;
  if (provider.includes('official')) return 4;

  return 5;
}

function betterParkingOption(
  a: ParkingOptionWithPlace,
  b: ParkingOptionWithPlace,
  tripData: unknown
): ParkingOptionWithPlace {
  const aTotal = getParkingTotalPrice(a, tripData as never);
  const bTotal = getParkingTotalPrice(b, tripData as never);

  // Prefer cheaper trip total if both exist.
  if (typeof aTotal === 'number' && typeof bTotal === 'number') {
    if (Math.abs(aTotal - bTotal) > 1) {
      return aTotal < bTotal ? a : b;
    }
  }

  const aDaily = getParkingDailyPrice(a, tripData as never);
  const bDaily = getParkingDailyPrice(b, tripData as never);

  // Then cheaper daily.
  if (typeof aDaily === 'number' && typeof bDaily === 'number') {
    if (Math.abs(aDaily - bDaily) > 1) {
      return aDaily < bDaily ? a : b;
    }
  }

  // Then prefer known provider priority.
  const aProviderRank = providerPriority(a);
  const bProviderRank = providerPriority(b);

  if (aProviderRank !== bProviderRank) {
    return aProviderRank < bProviderRank ? a : b;
  }

  // Keep first one if basically tied.
  return a;
}

export function dedupeAndSortParkingOptions<T extends ParkingOption>(
  options: T[],
  tripData: unknown
): T[] {
  const winners: ParkingOptionWithPlace[] = [];

  for (const option of options as ParkingOptionWithPlace[]) {
    const existingIndex = winners.findIndex((existing) =>
      sameParkingPlace(existing, option)
    );

    if (existingIndex === -1) {
      winners.push(option);
      continue;
    }

    winners[existingIndex] = betterParkingOption(
      winners[existingIndex],
      option,
      tripData
    );
  }

  return winners
    .sort((a, b) => {
      const aTotal = getParkingTotalPrice(a, tripData as never);
      const bTotal = getParkingTotalPrice(b, tripData as never);

      if (typeof aTotal === 'number' && typeof bTotal === 'number') {
        return aTotal - bTotal;
      }

      if (typeof aTotal === 'number') return -1;
      if (typeof bTotal === 'number') return 1;

      const aDaily = getParkingDailyPrice(a, tripData as never);
      const bDaily = getParkingDailyPrice(b, tripData as never);

      if (typeof aDaily === 'number' && typeof bDaily === 'number') {
        return aDaily - bDaily;
      }

      return providerPriority(a) - providerPriority(b);
    }) as T[];
}