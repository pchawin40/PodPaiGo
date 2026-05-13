import type { ParkingOption } from '../types';
import type { NormalizedParkingOption } from './types';
import { airportOfficialProvider } from './providers/airportOfficial';
import { cheapestAirportParkingProvider } from './providers/cheapestAirportParking';
import { staticFallbackProvider } from './providers/staticFallback';

const categoryImage: Record<string, string> = {
  'airport-garage': '/parking/seatac-garage.jpg',
  'offsite-shuttle': '/parking/offsite-parking.jpg',
  'park-and-ride': '/parking/park-and-ride.jpg',
  'hotel-parking': '/parking/hotel-parking.jpg',
  marketplace: '/parking/offsite-parking.jpg',
  unknown: '/parking/offsite-parking.jpg',
};

function cleanNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\W_]+/g, ' ')
    .replace(/\b(airport parking|airport|seatac|sea tac|seattle tacoma)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeDedupe(options: NormalizedParkingOption[]): NormalizedParkingOption[] {
  const map = new Map<string, NormalizedParkingOption>();
  for (const option of options) {
    const key = `${cleanNameKey(option.name)}|${(option.address || '').toLowerCase()}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, option);
      continue;
    }
    const preferred = existing.priceConfidence === 'live' ? existing : option.priceConfidence === 'live' ? option : (existing.pricePerDay ?? 999) <= (option.pricePerDay ?? 999) ? existing : option;
    map.set(key, {
      ...preferred,
      bookingSources: [...(existing.bookingSources || []), ...(option.bookingSources || []), ...(existing.providerName ? [{ providerName: existing.providerName, url: existing.bookingUrl, pricePerDay: existing.pricePerDay, priceConfidence: existing.priceConfidence }] : []), ...(option.providerName ? [{ providerName: option.providerName, url: option.bookingUrl, pricePerDay: option.pricePerDay, priceConfidence: option.priceConfidence }] : [])],
      notes: Array.from(new Set([...(existing.notes || []), ...(option.notes || [])])),
    });
  }
  return [...map.values()];
}

export async function getDynamicParkingOptions(airportId: string): Promise<ParkingOption[]> {
  const providers = [airportOfficialProvider, cheapestAirportParkingProvider, staticFallbackProvider];
  const results = await Promise.all(providers.map((p) => p({ airportId })));
  const normalized = mergeDedupe(results.flatMap((r) => r.options));

  return normalized.map((o, idx) => ({
    id: o.id || `${airportId.toLowerCase()}-dyn-${idx}`,
    name: o.name,
    type: o.category === 'airport-garage' ? 'official' : 'off-airport',
    price: o.pricePerDay ?? 0,
    priceDisplay: o.priceConfidence === 'live' ? 'live' : o.pricePerDay ? 'from-per-day' : 'check-live',
    priceUnit: 'per-day',
    priceNote: o.priceConfidence === 'live' ? 'Live' : o.priceConfidence === 'estimated' ? 'Estimated' : 'Check live price',
    distance: o.driveMinutes ?? 15,
    availability: 60,
    trustStatus: o.priceConfidence === 'live' ? 'live' : 'estimated',
    sourceName: o.providerName || 'Parking provider',
    sourceLink: o.bookingUrl || o.sourceUrl,
    lastUpdated: new Date().toISOString(),
    assumptions: o.notes || ['Check live price.'],
    transferType: o.shuttleMinutes ? 'shuttle' : 'walk',
    transferToTerminalMinutes: o.shuttleMinutes ?? o.walkMinutes ?? 8,
    shuttleMinutes: o.shuttleMinutes,
    walkingMinutes: o.walkMinutes,
    covered: o.covered,
    address: o.address,
    imageUrl: (o.images && o.images[0]) || categoryImage[o.category],
    imageAlt: o.imageAlt,
    tags: o.tags,
    bookingSources: o.bookingSources,
  } as ParkingOption));
}
