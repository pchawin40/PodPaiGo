import { ParkingOption } from '../types';
import { googleMapsDirectionsLink, googleMapsSearchLink } from '../maps';

export function parkingKey(v: Pick<ParkingOption, 'id' | 'name'>): string {
  const raw = String(v.id || v.name || '')
    .toLowerCase()
    .replace(/parking/g, '')
    .replace(/official/g, '')
    .replace(/[^a-z0-9]/g, '');

  if (raw.includes('doubletree')) return 'doubletree';
  if (raw.includes('wally')) return 'wallypark';
  if (raw.includes('master')) return 'masterpark';
  if (raw.includes('jiffy')) return 'jiffy';
  if (raw.includes('general')) return 'officialgeneral';
  if (raw.includes('reserved')) return 'officialreserved';

  return raw;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;

  const days = Math.floor(min / (60 * 24));
  const hours = Math.floor((min % (60 * 24)) / 60);
  const minutes = min % 60;

  return [
    days > 0 ? `${days}d` : null,
    hours > 0 || days > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

export function parkingRouteBreakdown(option: ParkingOption): string {
  const drive = option.distance ? `Drive ${formatMinutes(option.distance)}` : null;

  const transfer =
    option.transferType === 'shuttle'
      ? `shuttle ${formatMinutes(option.shuttleMinutes ?? option.transferToTerminalMinutes ?? 12)}`
      : `walk ${formatMinutes(option.walkingMinutes ?? option.transferToTerminalMinutes ?? 5)}`;

  return [drive, transfer].filter(Boolean).join(' + ');
}

export function parkingDailyCost(option: ParkingOption, formatMoney: (n: number) => string): string {
  if (typeof option.price !== 'number' || option.price <= 0) return 'Check live price';
  return `${formatMoney(option.price)}/day`;
}

export function routeUrlForOption(
  option: Pick<ParkingOption, 'routeDestination' | 'mapLink'>,
  origin: string | null
): string | null {
  const routeDestination = option.routeDestination;
  const mapLink = option.mapLink;

  if (routeDestination) {
    if (routeDestination.startsWith('http')) return routeDestination;
    if (origin) return googleMapsDirectionsLink(origin, routeDestination, 'driving');
    return googleMapsSearchLink(routeDestination);
  }

  return mapLink || null;
}

export function googleMapsParkingRouteLink(
  option: Pick<ParkingOption, 'routeDestination' | 'mapLink' | 'name'>,
  origin: string | null
): string | null {
  const parkingLot = option.routeDestination || option.mapLink || option.name;
  if (!parkingLot) return null;

  if (!origin) return googleMapsSearchLink(parkingLot);

  return googleMapsDirectionsLink(origin, parkingLot, 'driving');
}

export function costOf(option: { cost?: number }): number {
  return typeof option.cost === 'number' ? option.cost : 999;
}


export function parkingKeySafe(option: { id?: string; name?: string } | null | undefined): string | null {
  if (!option?.name) return null;
  return parkingKey({
    id: option.id || option.name,
    name: option.name,
  });
}