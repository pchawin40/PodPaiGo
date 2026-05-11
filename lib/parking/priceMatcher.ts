import { ParkingOption } from '../types';
import { mergeParkingRouteStatus, withStableParkingRouteStatus } from './routeStatus';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/airport parking/g, '')
    .replace(/seatac/g, '')
    .replace(/sea tac/g, '')
    .replace(/sea/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(' ')
      .filter((t) => t.length >= 3),
  );
}

function similarity(a: string, b: string): number {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let overlap = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}

export function findBestPriceMatch(
  inventoryOption: ParkingOption,
  pricedOptions: ParkingOption[],
): ParkingOption | null {
  let best: ParkingOption | null = null;
  let bestScore = 0;

  for (const priced of pricedOptions) {
    const score = similarity(inventoryOption.name, priced.name);

    if (score > bestScore) {
      best = priced;
      bestScore = score;
    }
  }

  return bestScore >= 0.6 ? best : null;
}

export function enrichInventoryOptionsWithPrices(args: {
  inventoryOptions: ParkingOption[];
  pricedOptions: ParkingOption[];
}): ParkingOption[] {
  return args.inventoryOptions.map((inventory) => {
    const match = findBestPriceMatch(inventory, args.pricedOptions);

    if (!match) return withStableParkingRouteStatus(inventory);

    return mergeParkingRouteStatus(inventory, {
      ...inventory,

      price: match.price,
      priceDisplay: match.priceDisplay,
      priceUnit: match.priceUnit,
      priceNote: match.priceNote,
      priceSource: match.priceSource,
      priceConfidence: match.priceConfidence,

      bookingProvider: match.bookingProvider,
      sourceName: match.sourceName,
      sourceLink: match.sourceLink ?? inventory.sourceLink,

      trustStatus: match.trustStatus,
      availabilityStatus: match.availabilityStatus,
      isAvailable: match.isAvailable,
      availabilityScore: match.availabilityScore ?? inventory.availabilityScore,

      bestFor: [
        ...(inventory.bestFor ?? []),
        ...(match.bestFor ?? []),
        'Price matched',
      ].filter(Boolean),

      assumptions: [
        ...(inventory.assumptions ?? []),
        `Matched price from ${match.sourceName || match.bookingProvider || 'provider'} option: ${match.name}`,
      ],
    });
  });
}
