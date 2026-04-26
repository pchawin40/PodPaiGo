'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [openDetail, setOpenDetail] = useState<'reviews' | 'availability' | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null); // For closing popovers when clicking outside

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        detailRef.current &&
        !detailRef.current.contains(event.target as Node)
      ) {
        setOpenDetail(null);
      }
    }

    if (openDetail) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDetail]);

  if (!options?.length) return null;

  const days = estimateDays(tripData);
  const official = options.find((p) => p.type === 'official');

  const smartPickCandidates = options.filter((p) => {
    const id = String(p.id || '').toLowerCase();
    const name = String(p.name || '').toLowerCase();

    const isGenericMarketplace =
      id.includes('spothero') ||
      id.includes('way') ||
      id.includes('parkwhiz') ||
      id.includes('airportparkingreservations') ||
      id.includes('cheapairportparking') ||
      id.includes('google-parking-search');

    const hasRealLotSignal =
      !!p.reviewScore ||
      name.includes('wally') ||
      name.includes('masterpark') ||
      name.includes('reserved') ||
      name.includes('general') ||
      name.includes('garage');

    return !isGenericMarketplace && hasRealLotSignal;
  });

  const candidateOptions = smartPickCandidates.length > 0 ? smartPickCandidates : options;

  const sorted = [...candidateOptions].sort((a, b) => {
    const score = (p: ParkingOption) => {
      const price = p.price || 999;
      const transfer = p.shuttleMinutes ?? p.transferToTerminalMinutes ?? 10;
      const walk = p.walkingMinutes ?? 5;
      const reviews = p.reviewScore ? (5 - p.reviewScore) * 8 : 8;
      const availability = p.availabilityScore ?? p.availability ?? 50;
      const coveredPenalty = p.covered ? -4 : 4;
      const trustBonus =
        p.trustStatus === 'live' ? -10 :
          p.trustStatus === 'verified-source' ? -6 :
            0;
      const reviewBonus = p.reviewScore ? -12 : 0;
      const liveBonus = p.trustStatus === 'live' ? -8 : 0;

      return (
        price +
        transfer * 1.8 +
        walk * 0.8 +
        reviews -
        availability * 0.12 +
        coveredPenalty +
        trustBonus +
        reviewBonus +
        liveBonus
      );
    };

    return score(a) - score(b);
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

            {best.covered && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">
                Covered
              </span>
            )}

            {best.reviewScore && (
              <div className="relative inline-flex">
                <button
                  type="button"
                  onClick={() => setOpenDetail(openDetail === 'reviews' ? null : 'reviews')}
                  className="select-none rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700 hover:bg-zinc-200"
                >
                  ⭐ {best.reviewScore} ({best.reviewCount?.toLocaleString() || 0})
                </button>

                {openDetail === 'reviews' && (
                  <div
                    ref={detailRef}
                    className="absolute left-0 top-9 z-20 w-72 rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-700 shadow-lg">
                    <div className="font-semibold text-zinc-900">Review confidence</div>
                    <div className="mt-1">
                      {best.reviewScore}/5 from about {best.reviewCount?.toLocaleString() || 0} reviews.
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      Estimate based on public listing-style data. Verify recent reviews before booking.
                    </div>
                  </div>
                )}
              </div>
            )}

            {best.availabilityScore && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOpenDetail(
                      openDetail === 'availability' ? null : 'availability'
                    )
                  }
                  className="select-none rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700 hover:bg-zinc-200"
                >
                  {best.availabilityScore >= 80
                    ? 'High availability'
                    : best.availabilityScore >= 60
                      ? 'Medium availability'
                      : 'Low availability'}
                </button>

                {openDetail === 'availability' && (
                  <div
                    ref={detailRef}
                    className="absolute right-0 top-12 z-20 w-72 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl"
                  >
                    <div className="font-semibold text-zinc-900">
                      Availability confidence
                    </div>

                    <div className="mt-2 text-sm text-zinc-700">
                      Score: {best.availabilityScore}/100
                    </div>

                    <div className="mt-2 text-sm text-zinc-600">
                      Based on listing activity, estimated capacity,
                      and provider confidence.
                    </div>

                    <div className="mt-2 text-sm text-zinc-600">
                      Actual space may change by arrival time.
                    </div>
                  </div>
                )}
              </div>
            )}

            {best.priceConfidence && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">
                {best.priceConfidence === 'high'
                  ? 'High price confidence'
                  : best.priceConfidence === 'medium'
                    ? 'Medium price confidence'
                    : 'Low price confidence'}
              </span>
            )}
          </div>

          <div className="mt-4 text-2xl font-bold text-zinc-900">
            {best.priceDisplay === 'check-live' && (!best.price || best.price <= 0)
              ? 'Check live price'
              : best.priceUnit === 'total'
                ? formatMoney(best.price)
                : `${formatMoney(best.price)}/day`}
          </div>

          <div className="mt-1 text-sm text-zinc-600">
            {best.transferType === 'shuttle'
              ? `${best.shuttleMinutes ?? best.transferToTerminalMinutes ?? 10} min shuttle`
              : `${best.walkingMinutes ?? best.transferToTerminalMinutes ?? 5} min walk`}
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
                  {p.priceDisplay === 'check-live' && (!p.price || p.price <= 0)
                    ? 'Check live price'
                    : p.priceUnit === 'total'
                      ? formatMoney(p.price)
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