import type { ParkingOption } from '../types';

type ResolvedLotIdentity = {
  placeId?: string;
  canonicalName: string;
  normalizedName: string;
};

type ParkingOptionWithIdentity = ParkingOption & {
  placeId?: string;
  googlePlaceId?: string;
  canonicalLotName?: string;
  bookingProvider?: string;
  sourceName?: string;
};

function normalizeLotName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(sea|seatac|sea-tac|seattle|airport|parking|lot|self|uncovered|covered|garage)\b/g, ' ')
    .replace(/\bby\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripProviderNoise(name: string): string {
  return name
    .replace(/\s+-\s+self\s+uncovered/i, '')
    .replace(/\s+-\s+self\s+covered/i, '')
    .replace(/\s+lot$/i, '')
    .trim();
}

export function resolveLocalLotIdentity(option: ParkingOptionWithIdentity): ResolvedLotIdentity {
  const rawName = option.canonicalLotName || option.name || '';
  const canonicalName = stripProviderNoise(rawName);
  const normalizedName = normalizeLotName(canonicalName);

  return {
    placeId: option.googlePlaceId || option.placeId,
    canonicalName,
    normalizedName,
  };
}

export function lotIdentityKey(option: ParkingOptionWithIdentity): string {
  const identity = resolveLocalLotIdentity(option);

  if (identity.placeId) {
    return `place:${identity.placeId}`;
  }

  return `name:${identity.normalizedName}`;
}

export function parkingOptionTotal(option: ParkingOptionWithIdentity, days: number): number | null {
  if (typeof option.price !== 'number' || option.price <= 0) return null;

  if (option.priceUnit === 'total') {
    return option.price;
  }

  return Math.round(option.price * days * 100) / 100;
}

function confidenceRank(option: ParkingOptionWithIdentity): number {
  if (option.trustStatus === 'live') return 3;
  if (option.trustStatus === 'verified-source') return 2;
  if (option.trustStatus === 'estimated') return 1;
  return 0;
}

export function dedupeParkingLotsByCheapest<T extends ParkingOptionWithIdentity>(
  options: T[],
  days: number
): T[] {
  const bestByKey = new Map<string, T>();

  for (const option of options) {
    const key = lotIdentityKey(option);
    const existing = bestByKey.get(key);

    if (!existing) {
      bestByKey.set(key, option);
      continue;
    }

    const currentTotal = parkingOptionTotal(option, days);
    const existingTotal = parkingOptionTotal(existing, days);

    if (currentTotal != null && existingTotal != null) {
      if (currentTotal < existingTotal) {
        bestByKey.set(key, option);
      }
      continue;
    }

    if (currentTotal != null && existingTotal == null) {
      bestByKey.set(key, option);
      continue;
    }

    if (currentTotal == null && existingTotal == null) {
      if (confidenceRank(option) > confidenceRank(existing)) {
        bestByKey.set(key, option);
      }
    }
  }

  return Array.from(bestByKey.values());
}