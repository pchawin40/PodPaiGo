import type { ParkingOption } from '../types';

function normalizeMatchText(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeMatchText(value)
    .split(' ')
    .filter((token) => token.length > 2);
}

function matchScore(
  targetName: string,
  targetAddress: string,
  liveName: string,
  liveAddress: string,
): number {
  const target = normalizeMatchText(`${targetName} ${targetAddress}`);
  const candidate = normalizeMatchText(`${liveName} ${liveAddress}`);

  if (!target || !candidate) return 0;
  if (candidate === target) return 100;
  if (candidate.includes(target) || target.includes(candidate)) return 90;

  const targetTokens = new Set(tokenize(`${targetName} ${targetAddress}`));
  const liveTokens = tokenize(`${liveName} ${liveAddress}`);
  if (targetTokens.size === 0 || liveTokens.length === 0) return 0;

  let overlap = 0;
  for (const token of liveTokens) {
    if (targetTokens.has(token)) overlap += 1;
  }

  const ratio = overlap / Math.max(targetTokens.size, liveTokens.length);
  if (ratio >= 0.5) return 70 + Math.round(ratio * 20);

  const brandTokens = ['laz', 'pike', 'place', 'market', 'garage', 'jiffy', 'wally'];
  for (const brand of brandTokens) {
    if (target.includes(brand) && candidate.includes(brand)) {
      return 65;
    }
  }

  return 0;
}

export function findMatchingParkWhizOption(
  option: Pick<ParkingOption, 'name' | 'address' | 'normalizedAddress' | 'lat' | 'lng'>,
  liveOptions: ParkingOption[],
  minScore = 60,
): ParkingOption | undefined {
  const targetName = option.name;
  const targetAddress = option.address || option.normalizedAddress || '';

  let best: ParkingOption | undefined;
  let bestScore = 0;

  for (const live of liveOptions) {
    const score = matchScore(
      targetName,
      targetAddress,
      live.name,
      live.address || live.normalizedAddress || '',
    );

    if (
      typeof option.lat === 'number' &&
      typeof option.lng === 'number' &&
      typeof live.lat === 'number' &&
      typeof live.lng === 'number'
    ) {
      const latDiff = Math.abs(option.lat - live.lat);
      const lngDiff = Math.abs(option.lng - live.lng);
      if (latDiff < 0.002 && lngDiff < 0.002) {
        return live;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = live;
    }
  }

  return bestScore >= minScore ? best : undefined;
}

export function isLiveParkWhizOption(option: Pick<ParkingOption, 'priceDisplay' | 'bookingProvider' | 'sourceName' | 'price'>): boolean {
  const isParkWhiz =
    option.bookingProvider === 'ParkWhiz' || option.sourceName === 'ParkWhiz';

  return isParkWhiz && option.priceDisplay === 'live' && typeof option.price === 'number' && option.price > 0;
}
