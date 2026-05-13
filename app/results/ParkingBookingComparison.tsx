'use client';

import { withAprLivePrice } from '../../lib/parking/aprLivePrice';
import { ParkingOption, TripData } from '../../lib/types';

type ParkingBookingComparisonProps = {
  parkingOptions: ParkingOption[];
  tripData: TripData | null;
  aprLivePrices?: Record<string, number>;
  aprLiveChecking?: boolean;
};

export default function ParkingBookingComparison({ parkingOptions, aprLivePrices = {} }: ParkingBookingComparisonProps) {
  if (!parkingOptions?.length) return null;
  const options = parkingOptions.map((o) => withAprLivePrice(o, aprLivePrices));

  const rows = options.flatMap((o) => {
    const fromSources = (o.bookingSources || []).map((s) => ({
      lot: o.name,
      provider: s.providerName,
      url: s.url || o.sourceLink,
      status: s.priceConfidence === 'live' ? 'Live' : s.priceConfidence === 'estimated' ? 'Estimated' : 'Check live',
      price: typeof s.pricePerDay === 'number' ? `$${s.pricePerDay.toFixed(2)}/day` : 'Check live price',
    }));

    if (fromSources.length) return fromSources;

    return [{
      lot: o.name,
      provider: o.sourceName || o.bookingProvider || 'Provider',
      url: o.sourceLink,
      status: o.trustStatus === 'live' ? 'Live' : 'Estimated',
      price: o.price ? `$${o.price.toFixed(2)}/day` : 'Check live price',
    }];
  });

  return (
    <details className="w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <summary className="cursor-pointer bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900">Compare booking sources</summary>
      <div className="grid gap-3 p-3 sm:p-4">
        {rows.map((r, i) => (
          <div key={`${r.lot}-${r.provider}-${i}`} className="min-w-0 rounded-2xl border border-zinc-200 p-3 text-sm">
            <div className="break-words font-semibold text-zinc-900">{r.provider}</div>
            <div className="mt-1 break-words text-xs text-zinc-600">{r.lot}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 whitespace-normal">
              <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs text-white">{r.price}</span>
              <span className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-700">{r.status}</span>
            </div>
            <div className="mt-3">
              {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
                  Check live price
                </a>
              ) : (
                <span className="text-xs text-zinc-500">Link unavailable</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
