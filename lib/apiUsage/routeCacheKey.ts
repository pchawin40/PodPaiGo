import { bucketDepartureTime } from './departureBucket';
import { hashRequestPart, shortRequestKey } from './hashKey';

function normalizeRouteCachePart(value: string): string {
  const raw = String(value || '').trim();
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

  return lower
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildRouteEstimateCacheKey(args: {
  origin: string;
  destination: string;
  dateTime: string;
  mode?: string;
  airportCode?: string | null;
  lotId?: string | null;
}): string {
  const departureBucket = bucketDepartureTime(args.dateTime);

  return [
    args.mode || 'DRIVE',
    normalizeRouteCachePart(args.origin),
    normalizeRouteCachePart(args.destination),
    departureBucket,
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
