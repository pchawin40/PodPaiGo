import type { ParkingOption } from '../../types';
import { isAprOption } from './providers/apr/buildOptions';

export function applyLegacyDisplayOrder(options: ParkingOption[]): ParkingOption[] {
  return [...options].sort((a, b) => {
    const rank = (p: ParkingOption) => {
      const name = p.name.toLowerCase();

      if (p.type === 'official') return 0;
      if (p.sourceName === 'Google Places' || p.sourceName === 'Parking inventory') return 1;
      if (p.bookingProvider === 'ParkWhiz' || p.sourceName === 'ParkWhiz') return 2;
      if (isAprOption(p)) return 3;
      if (name.includes('wally')) return 4;
      if (name.includes('master')) return 5;
      return 6;
    };

    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;

    return (a.price ?? 999) - (b.price ?? 999);
  });
}
