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

// export default function ParkingBookingSources({
//   option,
//   tripData,
// }: ParkingBookingSourcesProps) {
//   const rows = buildRows(option, tripData);
//   const days = estimateParkingDays(tripData);

//   return (
//     <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
//       <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
//         <div className="text-sm font-medium text-zinc-900">
//           Compare booking sources
//         </div>
//         <div className="text-xs text-zinc-500">
//           Known/baseline prices are labeled; confirm final rate before booking.
//         </div>
//       </div>

//       <div className="mt-3 space-y-3">
//         {rows.map((r) => {
//           const priceCell =
//             r.pricePerDay == null
//               ? 'Check live price'
//               : r.priceDisplay === 'live'
//                 ? `Live ${formatMoneyCents(r.pricePerDay)}/day`
//                 : `Est. ${formatMoney(r.pricePerDay)}/day`;

//           return (
//             <div
//               key={r.provider}
//               className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
//             >
//               <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
//                 <div className="min-w-0 space-y-2">
//                   <div className="text-sm font-medium text-zinc-900">
//                     {r.provider}
//                   </div>

//                   <div className="flex flex-wrap gap-2">
//                     <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700">
//                       {r.type}
//                     </span>

//                     <span
//                       className={
//                         'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' +
//                         r.trustClassName
//                       }
//                     >
//                       {r.trustLabel}
//                     </span>
//                   </div>
//                 </div>

//                 <div className="flex flex-col items-start gap-3 sm:items-end">
//                   <div className="text-sm font-semibold text-zinc-900">
//                     {priceCell}
//                   </div>

//                   <button
//                     type="button"
//                     onClick={() => openBookingLink(r.link)}
//                     className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:w-auto"
//                   >
//                     {r.ctaLabel}
//                   </button>
//                 </div>
//               </div>

//               <div className="mt-3 space-y-2 text-xs text-zinc-700">
//                 <div>{r.notes}</div>

//                 {r.estimatedTripTotal != null && (
//                   <div>
//                     <span className="font-medium">Trip total:</span>{' '}
//                     {formatMoneyCents(r.estimatedTripTotal)} for {days} day(s)
//                   </div>
//                 )}
//               </div>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }
