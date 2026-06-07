import { bucketDepartureTime } from './departureBucket';
import { hashRequestPart, shortRequestKey } from './hashKey';

function normalizeGenericRouteCachePart(value: string): string {
  const raw = String(value || '').trim();

  return raw
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9.,+-]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isCoordinateCachePart(value: string): boolean {
  return /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value.trim());
}

function normalizeRouteCachePart(value: string, routePurpose?: string | null): string {
  const raw = String(value || '').trim();

  if (isCoordinateCachePart(raw)) {
    return raw;
  }

  if (routePurpose === 'parking_origin_to_lot') {
    return normalizeGenericRouteCachePart(raw);
  }

  const lower = raw.toLowerCase();

  if (
    raw.toUpperCase() === 'SEA' ||
    lower.includes('seattle-tacoma international airport') ||
    lower.includes('seatac airport') ||
    lower.includes('sea-tac airport') ||
    lower.includes('17801 international blvd')
  ) {
    return 'sea airport';
  }

  return normalizeGenericRouteCachePart(raw);
}

export function buildRouteEstimateCacheKey(args: {
  origin: string;
  destination: string;
  dateTime: string;
  mode?: string;
  routePurpose?: string | null;
  tripType?: string | null;
  airportCode?: string | null;
  lotId?: string | null;
}): string {
  const departureBucket = bucketDepartureTime(args.dateTime);

  const routePurpose = args.routePurpose?.trim() || '';

  return [
    args.mode || 'DRIVE',
    normalizeRouteCachePart(args.origin, routePurpose),
    normalizeRouteCachePart(args.destination, routePurpose),
    departureBucket,
    routePurpose,
    args.tripType?.trim() || '',
    args.airportCode?.trim().toUpperCase() || '',
    args.lotId?.trim() || '',
  ].join('|');
}

export function buildRouteSnapshotHashes(args: {
  origin: string;
  destination: string;
}): { originHash: string; destinationHash: string; requestKey: string } {
  const originHash = hashRequestPart(args.origin);
  const destinationHash = hashRequestPart(args.destination);
  const requestKey = shortRequestKey(`${originHash}|${destinationHash}`);

  return { originHash, destinationHash, requestKey };
}

export { normalizeRouteCachePart, shortRequestKey };
