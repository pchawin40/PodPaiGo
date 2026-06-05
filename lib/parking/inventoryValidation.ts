import type { ParkingOption } from '../types';

export type ParkingInventoryValidationReason =
  | 'filtered_generic_marketplace'
  | 'filtered_pickup_dropoff'
  | 'filtered_not_parking_lot'
  | 'filtered_transit_station_not_parking';

export type ParkingInventoryValidationResult = {
  valid: boolean;
  reason?: ParkingInventoryValidationReason;
};

function textFor(option: ParkingOption): string {
  return [
    option.name,
    option.address,
    option.normalizedAddress,
    option.routeDestination,
    option.sourceLink,
    option.sourceName,
    option.bookingProvider,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function looksLikeRealParkingLot(option: ParkingOption): boolean {
  const text = textFor(option);
  const knownRealBrands =
    /\b(shuttlepark2|shuttlepark|park n jet|parknjet|masterpark|wallypark|jiffy|doug fox|ajax|mvp|seatac self park|sea-tac parking garage|pike place|garage)\b/.test(text);
  const physicalSignals =
    Boolean(option.address || option.normalizedAddress || option.lat || option.lng || option.googlePlaceId) ||
    /\b(lot|garage|self park|valet|shuttle|parking garage|airport parking garage)\b/.test(text);

  return knownRealBrands || physicalSignals || option.type === 'official';
}

export function validateParkingInventoryOption(option: ParkingOption): ParkingInventoryValidationResult {
  const text = textFor(option);
  const name = String(option.name || '').trim().toLowerCase();
  const source = `${option.sourceName || ''} ${option.bookingProvider || ''}`.toLowerCase();

  if (
    /\b(passenger\s*pick[-\s]*up|passenger\s*pickup|drop[-\s]*off|dropoff|kiss\s*&?\s*ride|cell\s*phone\s*lot|rideshare\s*(pickup|zone))\b/.test(text)
  ) {
    return { valid: false, reason: 'filtered_pickup_dropoff' };
  }

  if (
    /\b(station|transit center|link light rail|platform)\b/.test(text) &&
    /\b(pick[-\s]*up|pickup|drop[-\s]*off|dropoff|passenger)\b/.test(text)
  ) {
    return { valid: false, reason: 'filtered_transit_station_not_parking' };
  }

  const genericMarketplace =
    (source.includes('spothero') || source.includes('way.com') || source.includes('way ')) &&
    (
      /\b(spothero|way)\s+[a-z]{3}\s+parking\b/.test(name) ||
      /\bairport parking\b/.test(name)
    );

  const genericMarketplaceUrl =
    (text.includes('spothero.com/airport-parking') ||
      text.includes('spothero.com/search') ||
      text.includes('way.com/airport-parking')) &&
    !looksLikeRealParkingLot(option);

  if (genericMarketplace || genericMarketplaceUrl) {
    return { valid: false, reason: 'filtered_generic_marketplace' };
  }

  if (!looksLikeRealParkingLot(option)) {
    return { valid: false, reason: 'filtered_not_parking_lot' };
  }

  return { valid: true };
}

export function filterValidParkingInventoryOptions(options: ParkingOption[]): ParkingOption[] {
  return options.filter((option) => validateParkingInventoryOption(option).valid);
}
