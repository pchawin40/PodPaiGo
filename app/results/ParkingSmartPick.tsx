'use client';

import { ParkingOption, TripData } from '../../lib/types';

function formatMoney(n: number) {
  return `$${Math.round(n)}`;
}

function estimateDays(tripData: TripData | null) {
  const mins = (tripData as any)?.parkingDuration;
  if (!mins) return 1;
  return Math.max(1, Math.ceil(mins / 60 / 24));
}

export default function ParkingSmartPick({
  options,
  tripData,
}: {
  options: ParkingOption[];
  tripData: TripData | null;
}) {
  if (!options?.length) return null;

  const days = estimateDays(tripData);
  const official = options.find((p) => p.type === 'official');
  const sorted = [...options].sort((a, b) => {
    const aScore =
      (a.price || 999) +
      ((a.transferToTerminalMinutes || 10) * 2) -
      (a.trustStatus === 'live' ? 10 : 0) -
      (a.trustStatus === 'verified-source' ? 6 : 0);

    const bScore =
      (b.price || 999) +
      ((b.transferToTerminalMinutes || 10) * 2) -
      (b.trustStatus === 'live' ? 10 : 0) -
      (b.trustStatus === 'verified-source' ? 6 : 0);

    return aScore - bScore;
  });

  const best = sorted[0];
  const alternatives = sorted.slice(1, 4);

  const bestTotal = best.price * days;
  const officialTotal = official ? official.price * days : null;
  const savings =
    officialTotal && officialTotal > bestTotal
      ? officialTotal - bestTotal
      : null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
        Smart parking pick
      </div>

      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">
            {best.name}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
              Best value
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">
              {best.transferType === 'shuttle' ? 'Shuttle' : 'Walk'}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">
              {best.trustStatus === 'live' ? 'Live listing' : 'Verified link'}
            </span>
          </div>

          <div className="mt-4 text-2xl font-bold text-zinc-900">
            {best.priceDisplay === 'check-live'
              ? 'Check live price'
              : `${formatMoney(best.price)}/day`}
          </div>

          <div className="mt-1 text-sm text-zinc-600">
            {best.transferToTerminalMinutes || 10} min to terminal
            {savings ? ` · Save about ${formatMoney(savings)} vs official parking` : ''}
          </div>

          <div className="mt-3 text-sm text-zinc-700">
            Recommended because it balances price, convenience, and booking confidence.
          </div>
        </div>

        {best.sourceLink && (
          <a
            href={best.sourceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Reserve / Check price
          </a>
        )}
      </div>

      {alternatives.length > 0 && (
        <div className="mt-5 border-t border-zinc-100 pt-4">
          <div className="text-sm font-semibold text-zinc-900">
            Quick alternatives
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {alternatives.map((p) => (
              <a
                key={p.id}
                href={p.sourceLink || p.mapLink || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50"
              >
                <div className="truncate text-sm font-medium text-zinc-900">
                  {p.name}
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {p.priceDisplay === 'check-live'
                    ? 'Check live price'
                    : `${formatMoney(p.price)}/day`}
                </div>
                <div className="mt-1 text-xs text-blue-700">
                  View option →
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}