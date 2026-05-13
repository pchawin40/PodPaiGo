'use client';

import { ParkingOption, TripData } from '../../lib/types';
import { estimateParkingDays } from '../../lib/tripTime';
import { formatMoney, formatMoneyCents } from '../utils/formatter';
import {
  canDisplayParkingPrice,
  getParkingDailyPrice,
  getParkingTotalPrice,
} from '../../lib/parking/priceDisplay';

type BookingSourceRow = {
  provider: string;
  pricePerDay: number | null;
  priceDisplay: 'live' | 'estimated' | 'check-live';
  trustLabel: string;
  trustClassName: string;
  type: string;
  notes: string;
  estimatedTripTotal: number | null;
  link: string;
  ctaLabel: string;
};

type ParkingBookingSourcesProps = {
  option: ParkingOption;
  tripData: TripData | null;
};

function buildRows(option: ParkingOption, tripData: TripData | null): BookingSourceRow[] {
  const showStoredPrice = canDisplayParkingPrice(option);
  const pricePerDay = showStoredPrice ? getParkingDailyPrice(option, tripData) : null;
  const estimatedTripTotal = showStoredPrice ? getParkingTotalPrice(option, tripData) : null;
  const isGooglePlacesFallback =
    option.priceSource === 'google-places' || option.sourceName === 'Google Places';

  const link =
    option.sourceLink ||
    option.mapLink ||
    'https://www.google.com/search?q=' +
      encodeURIComponent(`${option.name} airport parking`);

  const trustClassName =
    option.trustStatus === 'live' || option.trustStatus === 'verified-source'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : option.trustStatus === 'estimated'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-zinc-200 bg-zinc-50 text-zinc-700';

  const trustLabel =
    option.trustStatus === 'live' || option.trustStatus === 'verified-source'
      ? 'High'
      : option.trustStatus === 'estimated'
        ? 'Medium'
        : 'Check';

  return [
    {
      provider: `${option.name} (Direct)`,
      pricePerDay,
      priceDisplay: option.trustStatus === 'live' ? 'live' : pricePerDay ? 'estimated' : 'check-live',
      trustLabel,
      trustClassName,
      type: 'direct booking',
      notes: pricePerDay
        ? 'Direct booking'
        : isGooglePlacesFallback
          ? 'Nearby listing found; confirm price with provider.'
          : 'Confirm final price before booking',
      estimatedTripTotal,
      link,
      ctaLabel: 'Check price',
    },
    {
      provider: 'SpotHero',
      pricePerDay: null,
      priceDisplay: 'check-live',
      trustLabel: 'High',
      trustClassName: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      type: 'marketplace',
      notes: 'Major marketplace (check live)',
      estimatedTripTotal: null,
      link: 'https://spothero.com',
      ctaLabel: 'Check price',
    },
  ];
}

function openBookingLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function ParkingBookingSources({
  option,
  tripData,
}: ParkingBookingSourcesProps) {
  const rows = buildRows(option, tripData);
  const days = estimateParkingDays(tripData);

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-zinc-900">
          Compare booking sources
        </div>
        <div className="text-xs text-zinc-500">
          Known/baseline prices are labeled; confirm final rate before booking.
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="w-[26%] py-2">Provider</th>
              <th className="w-[18%] py-2">Price</th>
              <th className="w-[14%] py-2">Trust</th>
              <th className="w-[30%] py-2">Notes</th>
              <th className="w-[12%] py-2 text-right">CTA</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const priceCell =
                r.pricePerDay == null
                  ? 'Check live price'
                  : r.priceDisplay === 'live'
                    ? `Live ${formatMoneyCents(r.pricePerDay)}/day`
                    : `Est. ${formatMoney(r.pricePerDay)}/day`;

              return (
                <tr key={r.provider} className="border-t border-zinc-100">
                  <td className="break-words py-3 font-medium text-zinc-900">
                    {r.provider}
                  </td>

                  <td className="break-words py-3 text-zinc-900">
                    {priceCell}
                  </td>

                  <td className="py-3">
                    <span
                      className={
                        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' +
                        r.trustClassName
                      }
                    >
                      {r.trustLabel}
                    </span>
                  </td>

                  <td className="py-3 text-zinc-700">
                    <div className="flex flex-col gap-1">
                      <div>
                        <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                          {r.type}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-zinc-700">
                        <div>{r.notes}</div>

                        {r.estimatedTripTotal != null && (
                          <div>
                            <span className="font-medium">Trip total:</span>{' '}
                            {formatMoneyCents(r.estimatedTripTotal)} for {days} day(s)
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openBookingLink(r.link)}
                      className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Check price
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
