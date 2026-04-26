'use client';

import { useEffect, useRef, useState } from 'react';
import { ParkingOption, TripData } from '../../lib/types';

function formatMoney(n: number) {
  const rounded = Math.round(n * 100) / 100;
  return rounded % 1 === 0 ? `$${rounded.toFixed(0)}` : `$${rounded.toFixed(2)}`;
}

// For savings display, we want to round to whole dollars to avoid implying false precision
function formatMoneyWhole(n: number) {
  const rounded = Math.round(n);
  return `$${rounded.toLocaleString()}`;
}

function formatTimeFriendly(time24: string) {
  const m = time24.match(/^([0-2]\d):([0-5]\d)$/);
  if (!m) return time24;

  let hours = Number(m[1]);
  const minutes = m[2];

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes} ${ampm}`;
}

function estimateDays(tripData: TripData | null) {
  const mins = (tripData as any)?.parkingDuration;
  if (!mins) return 1;
  return Math.max(1, Math.ceil(mins / 60 / 24));
}

export default function ParkingSmartPick({
  options,
  tripData,
  selectedOption,
  leaveByTime,
}: {
  options: ParkingOption[];
  tripData: TripData | null;
  selectedOption?: ParkingOption | null;
  leaveByTime?: string | null;
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

  const smartPickCandidates = options.filter((p) => {
    const id = String(p.id || '').toLowerCase();
    const name = String(p.name || '').toLowerCase();

    const isAprLiveLot = p.bookingProvider === 'AirportParkingReservations';

    const isGenericMarketplace =
      id.includes('spothero') ||
      id.includes('way') ||
      id.includes('parkwhiz') ||
      id.includes('cheapairportparking') ||
      id.includes('google-parking-search');

    const hasRealLotSignal =
      isAprLiveLot ||
      !!p.reviewScore ||
      name.includes('wally') ||
      name.includes('masterpark') ||
      name.includes('reserved') ||
      name.includes('general') ||
      name.includes('garage') ||
      name.includes('parking');

    return !isGenericMarketplace && hasRealLotSignal;
  });

  const candidateOptions = smartPickCandidates.length > 0 ? smartPickCandidates : options;

  const cheapestOfficial = [...options]
    .filter((p) => p.type === 'official')
    .sort((a, b) => (a.price ?? 999) - (b.price ?? 999))[0];

  const cheapest = [...candidateOptions].sort(
    (a, b) => (a.price ?? 999) - (b.price ?? 999)
  )[0];

  const lowestStress = [...candidateOptions].sort((a, b) => {
    const stressScore = (p: ParkingOption) => {
      const isWalk = p.transferType !== 'shuttle';
      const transfer = p.shuttleMinutes ?? p.walkingMinutes ?? p.transferToTerminalMinutes ?? 15;
      const confidence =
        p.priceConfidence === 'high' ? 20 :
          p.priceConfidence === 'medium' ? 10 :
            0;

      return (
        (isWalk ? 40 : 0) +
        confidence +
        (p.covered ? 10 : 0) -
        transfer * 2 -
        (p.price ?? 999) * 0.25
      );
    };

    return stressScore(b) - stressScore(a);
  })[0];

  const bestValue = [...candidateOptions].sort((a, b) => {
    const valueScore = (p: ParkingOption) => {
      const price = p.price ?? 999;
      const transfer = p.shuttleMinutes ?? p.walkingMinutes ?? p.transferToTerminalMinutes ?? 15;
      const review = p.reviewScore ? p.reviewScore * 8 : 0;
      const liveBonus = p.trustStatus === 'live' ? 12 : 0;
      const confidenceBonus =
        p.priceConfidence === 'high' ? 12 :
          p.priceConfidence === 'medium' ? 8 :
            0;

      return review + liveBonus + confidenceBonus - price * 1.8 - transfer * 1.1;
    };

    return valueScore(b) - valueScore(a);
  })[0];

  const best =
    selectedOption ||
    bestValue ||
    cheapest ||
    lowestStress ||
    candidateOptions[0];

  const bestTotal = (best.price ?? 0) * days;
  const officialTotal = cheapestOfficial ? (cheapestOfficial.price ?? 0) * days : null;

  const savings =
    officialTotal && officialTotal > bestTotal
      ? officialTotal - bestTotal
      : null;

  const savingsPercent =
    savings && officialTotal
      ? Math.round((savings / officialTotal) * 100)
      : null;

  const displayLeaveByTime = leaveByTime
  ? formatTimeFriendly(leaveByTime)
  : null;

  const ctaLabel =
    best.trustStatus === 'live'
      ? 'Reserve now'
      : best.priceDisplay === 'check-live'
        ? 'View rates'
        : 'Check price';

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
              Best Overall
            </span>

            {savings && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
                Save {formatMoneyWhole(savings)}
              </span>
            )}

            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">
              {best.transferType === 'shuttle' ? 'Shuttle' : 'Walk'}
            </span>

            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">
              {best.trustStatus === 'live' ? 'Live Price' : 'Verified Link'}
            </span>

            {best.covered && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">
                Covered
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
            {savings ? ` · ${formatMoneyWhole(savings)} cheaper than official parking` : ''}
          </div>

          {displayLeaveByTime && (
            <div className="mt-2 text-sm font-semibold text-emerald-700">
              Leave by {displayLeaveByTime} to arrive on time
            </div>
          )}

          <div className="mt-3 text-sm text-zinc-700">
            {savings ? (
              <>
                Save {' '}
                <span className="font-semibold text-emerald-800">
                  {formatMoneyWhole(savings)}
                </span>{' '}
                {savingsPercent ? `(${savingsPercent}%) ` : ''}
                vs official parking with similar timing.
              </>
            ) : (
              <>Recommended because it balances price, convenience, and booking confidence.</>
            )}
          </div>
        </div>

        {best.sourceLink && (
          <a
            href={best.sourceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {ctaLabel}
          </a>
        )}
      </div>
    </section>
  );
}