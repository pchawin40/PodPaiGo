'use client';

import { useEffect, useRef, useState } from 'react';
import { ParkingOption, TripData } from '../../lib/types';
import { withAprLivePrice } from '../../lib/parking/aprLivePrice';
import { formatMoneyWhole } from '../utils/formatter';
import {
  getParkingDailyPrice,
  getParkingTotalPrice,
  parkingPriceLine,
} from '../../lib/parking/priceDisplay';
import {
  parkingKey,
  parkingRouteLinks,
  parkingTimeBreakdown,
} from '../../lib/parking/routeDisplay';
import { isParkingRouteUnavailable } from '../../lib/parking/routeStatus';
import ParkingAvailabilityBadge from './ParkingAvailabilityBadge';
import { WeatherImpact } from '@/lib/weather/types';
import ParkingBookingSources from './ParkingBookSources';

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

function formatCompactMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';

  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function getWeatherScoreAdjustment(
  option: ParkingOption,
  weatherImpact?: WeatherImpact | null
): number {
  if (!weatherImpact) return 0;

  const adj = weatherImpact.parkingScoreAdjustments;
  let score = 0;

  if (option.covered) score += adj.coveredBonus;
  if (option.type === 'official') score += adj.officialGarageBonus;
  if (option.transferType === 'shuttle') score += adj.shuttlePenalty;
  if (!option.covered && option.type === 'off-airport') score += adj.uncoveredPenalty;

  return score;
}

function weatherParkingBadge(
  option: ParkingOption,
  weatherImpact?: WeatherImpact | null
): { label: string; className: string } {
  if (!weatherImpact) {
    return {
      label: 'Weather: normal',
      className: 'bg-white text-zinc-700 border border-zinc-200',
    };
  }

  const { riskLevel } = weatherImpact;

  // Base label
  let label = 'Weather: normal';

  if (riskLevel === 'medium') label = 'Weather: moderate impact';
  if (riskLevel === 'high') label = 'Weather: high impact';

  // More contextual override
  if (riskLevel !== 'low') {
    if (option.covered) label = 'Best for weather';
    else if (option.transferType === 'shuttle') label = 'Shuttle may be affected';
  }

  // Dynamic colors
  let className =
    'bg-white text-zinc-700 border border-zinc-200'; // default

  if (riskLevel === 'medium') {
    className = 'bg-amber-50 text-amber-800 border border-amber-200';
  }

  if (riskLevel === 'high') {
    className = 'bg-red-50 text-red-800 border border-red-200';
  }

  return { label, className };
}

function mergeGoogleEnrichedParking(
  option: ParkingOption,
  googleEnrichedParking: Record<string, Partial<ParkingOption>>
): ParkingOption {
  const enriched =
    googleEnrichedParking[parkingKey(option)] ||
    googleEnrichedParking[String(option.id || '')] ||
    googleEnrichedParking[String(option.name || '')];

  if (!enriched) return option;

  return {
    ...option,
    ...enriched,
  };
}

export default function ParkingSmartPick({
  options,
  tripData,
  selectedOption,
  leaveByTime,
  aprLivePrices = {},
  weatherImpact,
  onShowReviews,
  googleEnrichedParking = {},
}: {
  options: ParkingOption[];
  tripData: TripData | null;
  selectedOption?: ParkingOption | null;
  leaveByTime?: string | null;
  aprLivePrices?: Record<string, number>;
  aprLiveChecking?: boolean;
  weatherImpact?: WeatherImpact | null;
  onShowReviews?: (parking: ParkingOption) => void;
  googleEnrichedParking?: Record<string, Partial<ParkingOption>>;
}) {
  const [openDetail, setOpenDetail] = useState<'reviews' | 'availability' | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (detailRef.current && !detailRef.current.contains(event.target as Node)) {
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

  const optionsWithAprLivePrice = options.map((option) => {
    const enrichedOption = mergeGoogleEnrichedParking(option, googleEnrichedParking);
    return withAprLivePrice(enrichedOption, aprLivePrices);
  }) as ParkingOption[];

  const routeAvailableOptions = optionsWithAprLivePrice.filter((option) => !isParkingRouteUnavailable(option));

  const selectedOptionWithAprLivePrice = selectedOption
    ? (withAprLivePrice(
      mergeGoogleEnrichedParking(selectedOption, googleEnrichedParking),
      aprLivePrices
    ) as ParkingOption)
    : undefined;

  const smartPickCandidates = routeAvailableOptions.filter((p) => {
    const id = String(p.id || '').toLowerCase();
    const name = String(p.name || '').toLowerCase();

    const isAprLiveLot =
      p.bookingProvider === 'AirportParkingReservations' &&
      (p.availabilityScore ?? 0) >= 50;

    const isGenericMarketplace =
      id.includes('spothero') ||
      id.includes('way') ||
      id.includes('cheapairportparking') ||
      id.includes('google-parking-search');

    const hasRealLotSignal =
      isAprLiveLot ||
      p.bookingProvider === 'ParkWhiz' ||
      p.sourceName === 'ParkWhiz' ||
      !!p.reviewScore ||
      name.includes('reserved') ||
      name.includes('general') ||
      name.includes('garage') ||
      name.includes('parking');

    return !isGenericMarketplace && hasRealLotSignal;
  });

  const candidateOptions =
    smartPickCandidates.length > 0 ? smartPickCandidates : routeAvailableOptions;

  if (candidateOptions.length === 0) return null;

  const cheapestOfficial = [...routeAvailableOptions]
    .filter((p) => p.type === 'official')
    .sort(
      (a, b) =>
        (getParkingTotalPrice(a, tripData) ?? 999999) -
        (getParkingTotalPrice(b, tripData) ?? 999999)
    )[0];

  const cheapest = [...candidateOptions].sort(
    (a, b) =>
      (getParkingTotalPrice(a, tripData) ?? 999999) -
      (getParkingTotalPrice(b, tripData) ?? 999999)
  )[0];

  const lowestStress = [...candidateOptions].sort((a, b) => {
    const stressScore = (p: ParkingOption) => {
      const isWalk = p.transferType !== 'shuttle';
      const transfer =
        p.shuttleMinutes ??
        p.walkingMinutes ??
        p.transferToTerminalMinutes ??
        15;

      const confidence =
        p.priceConfidence === 'high'
          ? 20
          : p.priceConfidence === 'medium'
            ? 10
            : 0;

      return (
        (isWalk ? 40 : 0) +
        confidence +
        (p.covered ? 10 : 0) +
        getWeatherScoreAdjustment(p, weatherImpact) -
        transfer * 2 -
        (getParkingDailyPrice(p, tripData) ?? 999) * 0.25
      );
    };

    return stressScore(b) - stressScore(a);
  })[0];

  const bestValue = [...candidateOptions].sort((a, b) => {
    const valueScore = (p: ParkingOption) => {
      const price = getParkingDailyPrice(p, tripData) ?? 999;
      const transfer =
        p.shuttleMinutes ??
        p.walkingMinutes ??
        p.transferToTerminalMinutes ??
        15;

      const review = p.reviewScore ? p.reviewScore * 8 : 0;
      const liveBonus = p.trustStatus === 'live' ? 12 : 0;
      const confidenceBonus =
        p.priceConfidence === 'high'
          ? 12
          : p.priceConfidence === 'medium'
            ? 8
            : 0;

      const aprUnknownPenalty =
        p.bookingProvider === 'AirportParkingReservations' &&
          (p.availabilityScore ?? 0) < 50
          ? 50
          : 0;

      return (
        review +
        liveBonus +
        confidenceBonus +
        getWeatherScoreAdjustment(p, weatherImpact) -
        price * 1.8 -
        transfer * 1.1 -
        aprUnknownPenalty
      );
    };

    return valueScore(b) - valueScore(a);
  })[0];

  const weatherAwareBest = [...candidateOptions].sort((a, b) => {
    const score = (p: ParkingOption) => {
      const price = getParkingDailyPrice(p, tripData) ?? 999;
      const transfer =
        p.shuttleMinutes ??
        p.walkingMinutes ??
        p.transferToTerminalMinutes ??
        15;

      const review = p.reviewScore ? p.reviewScore * 8 : 0;
      const confidence =
        p.priceConfidence === 'high'
          ? 14
          : p.priceConfidence === 'medium'
            ? 8
            : 0;

      const walkBonus = p.transferType !== 'shuttle' ? 20 : 0;
      const coveredBonus = p.covered ? 8 : 0;
      const officialBonus = p.type === 'official' ? 6 : 0;

      return (
        review +
        confidence +
        walkBonus +
        coveredBonus +
        officialBonus +
        getWeatherScoreAdjustment(p, weatherImpact) -
        price * 1.4 -
        transfer * 1.2
      );
    };

    return score(b) - score(a);
  })[0];

  const selectedSmartPick =
    selectedOptionWithAprLivePrice && !isParkingRouteUnavailable(selectedOptionWithAprLivePrice)
      ? selectedOptionWithAprLivePrice
      : null;

  const best =
    selectedSmartPick ||
    weatherAwareBest ||
    cheapest ||
    bestValue ||
    lowestStress ||
    candidateOptions[0];

  if (!best) return null;

  const bestTotal = getParkingTotalPrice(best, tripData) ?? 0;
  const officialTotal = cheapestOfficial
    ? getParkingTotalPrice(cheapestOfficial, tripData)
    : null;

  const bestPriceDisplay = parkingPriceLine(best, tripData);

  const bestTime = parkingTimeBreakdown(best);

  const weatherBadge = weatherParkingBadge(best, weatherImpact);

  const savings =
    officialTotal && officialTotal > bestTotal
      ? officialTotal - bestTotal
      : null;

  const savingsPercent =
    savings && officialTotal ? Math.round((savings / officialTotal) * 100) : null;

  const displayLeaveByTime = leaveByTime ? formatTimeFriendly(leaveByTime) : null;

  const ctaLabel =
    best.bookingProvider === 'AirportParkingReservations'
      ? 'View deal'
      : best.type === 'official'
        ? 'Book official'
        : 'Check price';

  const bestRouteLinks = parkingRouteLinks(best, tripData);

  const bestWithMeta = best as ParkingOption & {
    updatedAt?: string;
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
        Smart parking pick
      </div>

      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">{best.name}</h2>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
              Best Overall
            </span>

            <ParkingAvailabilityBadge option={best} />
            <button
              type="button"
              onClick={() => onShowReviews?.(best)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              title="See Google review details"
            >
              {typeof best.reviewScore === "number" ? (
                <>
                  <span>⭐ {best.reviewScore.toFixed(1)}</span>
                  {typeof best.reviewCount === "number" ? (
                    <span className="text-amber-700/70">
                      ({best.reviewCount.toLocaleString()} reviews)
                    </span>
                  ) : null}
                </>
              ) : (
                <span>⭐ Check reviews</span>
              )}
            </button>

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

            <span className={`rounded-full px-2.5 py-1 font-medium ${weatherBadge.className}`}>
              {weatherBadge.label}
            </span>

            {weatherImpact && weatherImpact.riskLevel !== 'low' && (
              <div className="mt-2 text-xs font-medium text-sky-800">
                Weather factor: {weatherImpact.summary}. Covered or close-in parking gets a boost today.
              </div>
            )}
          </div>

          <div className="mt-4 text-2xl font-bold text-zinc-900">
            {bestPriceDisplay.primary}
          </div>

          {bestPriceDisplay.secondary && (
            <div className="mt-1 text-sm font-semibold text-zinc-700">
              {bestPriceDisplay.secondary}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-700">
            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
              {formatCompactMinutes(bestTime.totalMinutes)} total
            </span>

            {bestTime.parts.slice(0, 4).map((part) => (
              <span
                key={`${part.label}-${part.minutes}`}
                className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700"
              >
                {part.label} {formatCompactMinutes(part.minutes)}
              </span>
            ))}
          </div>

          {displayLeaveByTime && (
            <div className="mt-2 text-sm font-semibold text-emerald-700">
              Leave by {displayLeaveByTime} based on your timing choice
            </div>
          )}

          <div className="mt-3 text-sm text-zinc-700">
            {savings ? (
              <>
                Save{' '}
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

          <div className="mt-2 text-xs font-medium text-emerald-700">
            Smart pick for this airport today
          </div>

          <ParkingBookingSources option={best} tripData={tripData} />

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:text-blue-800">
              Details & evidence
            </summary>

            <div className="mt-3 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700">
              <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-900">Time breakdown</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      From your origin to being inside the airport terminal.
                    </div>
                  </div>

                  <div className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-900">
                    {formatCompactMinutes(bestTime.totalMinutes)}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {bestTime.parts.map((part) => (
                    <div
                      key={`${part.label}-${part.minutes}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span>{part.label}</span>
                      <span className="font-medium text-zinc-900">
                        {formatCompactMinutes(part.minutes)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 border-t border-zinc-200 pt-3">
                  <div className="flex items-center justify-between gap-3 font-semibold text-zinc-900">
                    <span>Total to terminal</span>
                    <span>{formatCompactMinutes(bestTime.totalMinutes)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {best.sourceName && (
                  <div>
                    Source: <span className="font-medium">{best.sourceName}</span>
                  </div>
                )}

                {bestWithMeta.updatedAt && (
                  <div>
                    Updated: <span className="font-medium">{bestWithMeta.updatedAt}</span>
                  </div>
                )}

                {best.priceConfidence && (
                  <div>
                    Price confidence:{' '}
                    <span className="font-medium capitalize">{best.priceConfidence}</span>
                  </div>
                )}

                {best.trustStatus && (
                  <div>
                    Trust status:{' '}
                    <span className="font-medium capitalize">{best.trustStatus}</span>
                  </div>
                )}

                {best.assumptions && best.assumptions.length > 0 && (
                  <div>
                    <div className="mt-3 font-medium text-zinc-900">Assumptions</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {best.assumptions.slice(0, 6).map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </details>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {best.sourceLink && (
            <a
              href={best.sourceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {ctaLabel}
            </a>
          )}

          {bestRouteLinks.routeToParkingUrl && (
            <a
              href={bestRouteLinks.routeToParkingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Route to parking
            </a>
          )}

          {bestRouteLinks.parkingToAirportUrl && (
            <a
              href={bestRouteLinks.parkingToAirportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Parking to terminal
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
