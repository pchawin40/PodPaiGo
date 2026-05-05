'use client';

import { withAprLivePrice } from '../../lib/parking/aprLivePrice';
import { ParkingOption, TripData } from '../../lib/types';

type ParkingBookingComparisonProps = {
  parkingOptions: ParkingOption[];
  tripData: TripData | null;
  aprLivePrices?: Record<string, number>;
  aprLiveChecking?: boolean;
};

export default function ParkingBookingComparison({
  parkingOptions,
  aprLivePrices = {},
  aprLiveChecking = false,
}: ParkingBookingComparisonProps) {
  if (!parkingOptions || parkingOptions.length === 0) return null;

  const parkingOptionsWithLive = parkingOptions.map((option) => withAprLivePrice(option, aprLivePrices));

  // Build a list of known booking rows based on providers present.
  // For safety, do not invent live prices.
  const rows: Array<{ provider: string; price: string; notes: string; link?: string; sortOrder: number }> = [];

  // Helper to push unique provider rows
  function pushRow(provider: string, price: string, notes: string, link?: string, sortOrder = 2) {
    if (!rows.find(r => r.provider === provider)) rows.push({ provider, price, notes, link, sortOrder });
  }

  // Find if SEA official present
  const seaReserved = parkingOptionsWithLive.find(p => p.id === 'sea-reserved' || p.name?.toLowerCase().includes('reserved'));
  const seaGeneral = parkingOptionsWithLive.find(p => p.id === 'sea-general' || p.name?.toLowerCase().includes('general'));

  if (seaReserved) {
    const isLiveSelected = seaReserved.trustStatus === 'live' && String(seaReserved.priceNote || '').toLowerCase().includes('selected-date');
    const price = isLiveSelected
      ? `Live ${seaReserved.price ? `$${seaReserved.price}/day` : 'Check live'}`
      : seaReserved.priceDisplay === 'from-per-day'
        ? `From ${seaReserved.price ? `$${seaReserved.price}/day` : 'Check live'}`
        : 'Check live';
    pushRow(
      'Official SEA (Reserved)',
      price,
      isLiveSelected ? 'Live selected-date' : 'Official',
      seaReserved.sourceLink,
      isLiveSelected ? 0 : 1
    );
  }

  if (seaGeneral) {
    const isLiveSelected = seaGeneral.trustStatus === 'live' && String(seaGeneral.priceNote || '').toLowerCase().includes('selected-date');
    const price = isLiveSelected
      ? `Live ${seaGeneral.price ? `$${seaGeneral.price}/day` : 'Check live'}`
      : seaGeneral.priceDisplay === 'from-per-day'
        ? `From ${seaGeneral.price ? `$${seaGeneral.price}/day` : 'Check live'}`
        : 'Check live';
    pushRow(
      'Official SEA (General)',
      price,
      isLiveSelected ? 'Live selected-date' : 'Official',
      seaGeneral.sourceLink,
      isLiveSelected ? 0 : 1
    );
  }

  // Offsite lots - for each one, add direct site + marketplace rows
  const offsites = parkingOptionsWithLive.filter((p) => {
    const unavailable =
      p.availabilityStatus === 'unavailable' ||
      p.isAvailable === false ||
      p.priceDisplay === 'unavailable' ||
      String(p.priceNote || '').toLowerCase().includes('sold out');

    return p.type === 'off-airport' && !unavailable;
  });
  offsites.forEach(p => {
    const baseProviderName = p.name;
    const isSelectedPrice = String(p.priceNote || '').toLowerCase().includes('selected-date');
    const hasLivePrice = p.trustStatus === 'live' && isSelectedPrice;
    const isAwaitingApr = aprLiveChecking && p.bookingProvider === 'AirportParkingReservations' && !hasLivePrice;
    const directPrice = hasLivePrice
      ? `Live ${p.price ? `$${p.price}/day` : 'Check live'}`
      : p.priceDisplay === 'from-per-day'
        ? p.price
          ? `From $${p.price}/day`
          : 'Check live'
        : p.priceDisplay === 'estimated'
          ? `Est. $${p.price}`
          : 'Check live';

    pushRow(
      `${baseProviderName} (Direct)`,
      directPrice,
      hasLivePrice
        ? 'Live selected-date'
        : isAwaitingApr
          ? 'Checking latest price...'
          : directPrice.startsWith('From')
            ? 'Listed rate'
            : 'Check live',
      p.sourceLink,
      hasLivePrice ? 0 : 2
    );
    // Marketplace rows (SpotHero, Way.com)
    pushRow('SpotHero', 'Check live', 'Marketplace', 'https://spothero.com', 3);
    pushRow('Way.com', 'Check live', 'Marketplace', 'https://way.com', 3);
  });

  // If no offsites, still show marketplace examples
  if (offsites.length === 0) {
    pushRow('SpotHero', 'Check live', 'Marketplace', 'https://spothero.com', 3);
    pushRow('Way.com', 'Check live', 'Marketplace', 'https://way.com', 3);
  }

  const sortedRows = [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.provider.localeCompare(b.provider));

  return (
    <details className="w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <summary className="w-full cursor-pointer bg-zinc-50 px-5 py-4 text-base font-semibold text-zinc-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Parking prices
            </div>
            <div className="mt-1">Compare booking options</div>
            <div className="mt-1 text-sm font-normal text-zinc-600">
              Official, direct, and marketplace links with price confidence.
            </div>
          </div>
          <span className="text-sm text-zinc-500">Open</span>
        </div>
      </summary>

      <div className="border-t border-zinc-100 px-4 pb-4 pt-3">
        <div className="space-y-3">
          {sortedRows.map((r) => (
            <div
              key={r.provider}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-900">
                    {r.provider}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white">
                      {r.price}
                    </span>

                    <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600">
                      {r.notes}
                    </span>
                  </div>
                </div>

                {r.link ? (
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Open
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-zinc-500">Unavailable</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
