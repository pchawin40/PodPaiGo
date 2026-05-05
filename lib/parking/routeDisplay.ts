import { ParkingOption } from '../types';
import { googleMapsDirectionsLink, googleMapsSearchLink } from '../maps';

export function parkingTimeBreakdown(option: ParkingOption): {
  label: string;
  totalMinutes: number;
  parts: Array<{ label: string; minutes: number }>;
} {
  const drive = typeof option.distance === 'number' ? option.distance : 0;
  const park = typeof option.parkingBufferMinutes === 'number' ? option.parkingBufferMinutes : 0;
  const shuttleWait =
    option.transferType === 'shuttle'
      ? typeof option.shuttleWaitMinutes === 'number'
        ? option.shuttleWaitMinutes
        : 8
      : 0;
  const transfer =
    typeof option.transferToTerminalMinutes === 'number'
      ? option.transferToTerminalMinutes
      : 0;
  const walk =
    typeof option.walkingMinutes === 'number'
      ? option.walkingMinutes
      : option.transferType === 'airport-garage'
        ? 5
        : 3;
  const risk =
    typeof option.bufferRiskMinutes === 'number'
      ? option.bufferRiskMinutes
      : option.transferType === 'shuttle'
        ? 5
        : 0;

  const parts = [
    { label: 'Drive', minutes: drive },
    { label: 'Park/check-in', minutes: park },
    ...(shuttleWait > 0 ? [{ label: 'Shuttle wait', minutes: shuttleWait }] : []),
    {
      label:
        option.transferType === 'shuttle'
          ? 'Shuttle'
          : option.transferType === 'airport-garage'
            ? 'Garage to terminal'
            : 'Walk to terminal',
      minutes: transfer,
    },
    ...(walk > 0 ? [{ label: 'Walk inside airport', minutes: walk }] : []),
    ...(risk > 0 ? [{ label: 'Buffer/risk', minutes: risk }] : []),
  ];

  const totalMinutes = parts.reduce((sum, p) => sum + p.minutes, 0);

  return {
    label: parts.map((p) => `${p.label} ${formatMinutes(p.minutes)}`).join(' + '),
    totalMinutes,
    parts,
  };
}

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
  const breakdown = parkingTimeBreakdown(option);

  const drive = breakdown.parts.find((p) => p.label === 'Drive');
  const wait = breakdown.parts.find((p) => p.label === 'Shuttle wait');
  const transfer = breakdown.parts.find((p) =>
    ['Shuttle', 'Garage to terminal', 'Walk to terminal'].includes(p.label)
  );
  const risk = breakdown.parts.find((p) => p.label === 'Buffer/risk');

  return [
    drive ? `Drive ${formatMinutes(drive.minutes)}` : null,
    wait ? `wait ${formatMinutes(wait.minutes)}` : null,
    transfer ? `${transfer.label.toLowerCase()} ${formatMinutes(transfer.minutes)}` : null,
    risk ? `buffer ${formatMinutes(risk.minutes)}` : null,
    `total ${formatMinutes(breakdown.totalMinutes)}`,
  ]
    .filter(Boolean)
    .join(' + ');
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