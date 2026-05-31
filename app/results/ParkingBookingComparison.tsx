'use client';

import { withAprLivePrice } from '../../lib/parking/aprLivePrice';
import { formatParkingPriceLine } from '../../lib/access/pricingLadder';
import { ParkingOption, TripData } from '../../lib/types';

type ParkingBookingComparisonProps = {
  parkingOptions: ParkingOption[];
  tripData: TripData | null;
  aprLivePrices?: Record<string, number>;
  aprLiveChecking?: boolean;
};

function formatParkingRowPrice(option: ParkingOption, tripData: TripData | null): string {
  return formatParkingPriceLine(option, tripData).primary;
}

export default function ParkingBookingComparison({
  parkingOptions,
  tripData,
  aprLivePrices = {},
  aprLiveChecking = false,
}: ParkingBookingComparisonProps) {
  if (!parkingOptions || parkingOptions.length === 0) return null;

  const parkingOptionsWithLive = parkingOptions.map((option) => withAprLivePrice(option, aprLivePrices));

  const rows: Array<{
    provider: string;
    price: string;
    notes: string;
    link?: string;
    sortOrder: number;
    imageUrl?: string;
    imageAlt?: string;
  }> = [];

  function pushRow(
    provider: string,
    price: string,
    notes: string,
    link?: string,
    sortOrder = 2,
    imageUrl?: string,
    imageAlt?: string
  ) {
    if (!rows.find(r => r.provider === provider)) {
      rows.push({ provider, price, notes, link, sortOrder, imageUrl, imageAlt });
    }
  }

  const airportCode = ((tripData as (TripData & { airportCode?: string }) | null)?.airportCode || 'Airport').toUpperCase();

  function trustedLink(option: ParkingOption): string | undefined {
    const provider = `${option.bookingProvider || ''} ${option.sourceName || ''}`.toLowerCase();
    const link = option.sourceLink;
    const url = String(link || '').toLowerCase();

    if (provider.includes('way.com') || /\bway\b/.test(provider)) return undefined;

    if (provider.includes('parkwhiz')) {
      if (!link) return undefined;
      if (
        url === 'https://www.parkwhiz.com' ||
        url === 'https://parkwhiz.com' ||
        url.includes('/airport-parking') ||
        url.includes('/search')
      ) {
        return undefined;
      }
      if (option.trustStatus !== 'live' && option.trustStatus !== 'verified-source') return undefined;
    }

    return link;
  }

  const seaReserved = parkingOptionsWithLive.find(p => p.id === 'sea-reserved' || p.name?.toLowerCase().includes('reserved'));
  const seaGeneral = parkingOptionsWithLive.find(p => p.id === 'sea-general' || p.name?.toLowerCase().includes('general'));

  if (seaReserved) {
    const isLiveSelected = seaReserved.trustStatus === 'live' && String(seaReserved.priceNote || '').toLowerCase().includes('selected-date');
    pushRow(
      `Official ${airportCode} (Reserved)`,
      formatParkingRowPrice(seaReserved, tripData),
      isLiveSelected ? 'Live selected-date' : 'Official',
      trustedLink(seaReserved),
      isLiveSelected ? 0 : 1,
      seaReserved.images?.[0] || seaReserved.imageUrl,
      seaReserved.name
    );
  }

  if (seaGeneral) {
    const isLiveSelected = seaGeneral.trustStatus === 'live' && String(seaGeneral.priceNote || '').toLowerCase().includes('selected-date');
    pushRow(
      `Official ${airportCode} (General)`,
      formatParkingRowPrice(seaGeneral, tripData),
      isLiveSelected ? 'Live selected-date' : 'Official',
      trustedLink(seaGeneral),
      isLiveSelected ? 0 : 1,
      seaGeneral.images?.[0] || seaGeneral.imageUrl,
      seaGeneral.name
    );
  }

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
    const directPrice = formatParkingRowPrice(p, tripData);

    pushRow(
      `${baseProviderName} (Direct)`,
      directPrice,
      hasLivePrice
        ? 'Live selected-date'
        : isAwaitingApr
          ? 'Updating provider price…'
          : directPrice.includes('Final price on provider')
            ? 'Final price on provider'
            : 'Estimated range',
      trustedLink(p),
      hasLivePrice ? 0 : 2,
      p.images?.[0] || p.imageUrl,
      p.name
    );
    pushRow('SpotHero', 'Estimated $20–$35/day', 'Marketplace', 'https://spothero.com', 3);
  });

  if (offsites.length === 0) {
    pushRow('SpotHero', 'Estimated $20–$35/day', 'Marketplace', 'https://spothero.com', 3);
  }

  rows.sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-zinc-900">Compare booking sources</div>
        <div className="text-xs text-zinc-500">Prices show estimates or provider anchors; confirm final rate before booking.</div>
      </div>

      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div
            key={row.provider}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="text-sm font-medium text-zinc-900">{row.provider}</div>
                <div className="text-sm font-semibold text-zinc-800">{row.price}</div>
                <div className="text-xs text-zinc-500">{row.notes}</div>
              </div>

              {row.link ? (
                <a
                  href={row.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  Open provider
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
