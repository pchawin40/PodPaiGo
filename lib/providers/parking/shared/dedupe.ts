import type { ParkingOption } from '../../../types';

export function normalizeLotName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function dedupeParkingOptions(options: ParkingOption[]): ParkingOption[] {
  const seen = new Set<string>();

  return options.filter((option) => {
    const key = normalizeLotName(option.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
