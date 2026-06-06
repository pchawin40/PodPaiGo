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
import { buildParkingDriveContextFromOption } from '../../lib/parking/routeMinutes';
import { getParkingVisualBadgeLabel } from '../../lib/parking/parkingLabels';
import { resolveTripParkingContext } from '../../lib/trip/tripContext';
import { isParkingRouteUnavailable } from '../../lib/parking/routeStatus';
import {
  getParkingComparableCost,
  parkingRankEvidenceLabel,
  sortParkingOptionsForMode,
  type ParkingSortMode,
} from '../../lib/parking/sortParkingOptions';
import { resolveParkingPriceTrust } from '../../lib/parking/priceTrust';
import { getVisibleParkingFeatureBadges } from '../../lib/parking/featureConfidence';
import {
  buildParkingProviderHandoff,
  formatParkingHandoffDuration,
} from '../../lib/parking/providerHandoff';
import ParkingAvailabilityBadge from './ParkingAvailabilityBadge';
import { WeatherContext, WeatherImpact } from '@/lib/weather/types';
// import ParkingBookingSources from './ParkingBookSources';
import ParkingLotVisual from './ParkingLotVisual';

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

function formatPriceSource(option: ParkingOption): string {
  if (option.priceDisplay === 'live' || option.pricingConfidence === 'live') return 'Live price';
  if (option.priceDisplay === 'from-per-day') return 'From-per-day price';
  if (option.priceDisplay === 'check-live') return 'Check live price';
  if (option.priceDisplay === 'estimated' || option.priceConfidence === 'low') return 'Estimated price';
  if (option.priceSource === 'official-rate') return 'Official posted rate';
  return 'Price estimate';
}

function formatConfidence(option: ParkingOption): string {
  if (option.routeTrustStatus === 'live' || option.trustStatus === 'live') return 'High confidence';
  if (option.trustStatus === 'verified-source' || option.priceConfidence === 'high') {
    return 'Good confidence';
  }
  if (option.trustStatus === 'fallback' || option.priceConfidence === 'low') {
    return 'Lower confidence';
  }
  return 'Medium confidence';
}

function transferDirectionLabel(option: ParkingOption, airportTrip: boolean): string {
  if (!airportTrip) return 'Go from parking to your destination';
  if (option.transferType === 'walk' || option.transferType === 'airport-garage') {
    return 'Walk from parking to terminal';
  }
  if (option.transferType === 'transit') return 'Take transit from lot to terminal';
  return 'Take shuttle from parking to terminal';
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
  weatherImpact?: WeatherImpact | null,
  weatherContext?: WeatherContext
): { label: string; className: string } {
  if (!weatherImpact) {
    const unavailableLabel =
      weatherContext === 'forecast-unavailable'
        ? 'Forecast unavailable'
        : weatherContext === 'current-airport-weather'
          ? 'Current weather'
          : 'Weather unavailable';

    return {
      label: unavailableLabel,
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

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
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

  const imageUrl = enriched.imageUrl ?? enriched.images?.[0] ?? option.imageUrl;
  const images = enriched.imageUrl
    ? [enriched.imageUrl]
    : enriched.images ?? option.images;

  return {
    ...option,
    ...enriched,
    imageUrl: imageUrl || undefined,
    images: images?.length ? images : undefined,
  };
}

function isAirportTrip(tripData: TripData | null): boolean {
  return Boolean(
    tripData &&
      (tripData.destinationKind === 'airport' ||
        (tripData as TripData & { airportCode?: string }).airportCode ||
        tripData.type !== 'general-trip'),
  );
}

function isAirportPlausibleParking(option: ParkingOption): boolean {
  const name = String(option.name || '').toLowerCase();
  const source = `${option.sourceName || ''} ${option.bookingProvider || ''}`.toLowerCase();

  if (option.type === 'official' || option.type === 'off-airport') return true;
  if (option.serviceAirportCode) return true;
  if (source.includes('airportparkingreservations') || source.includes('parkwhiz')) return true;
  if (source.includes('airport') && source.includes('parking')) return true;
  if (name.includes('airport') || name.includes('garage')) return true;
  if (name.includes('masterpark') || name.includes('wally') || name.includes('jiffy')) return true;

  return false;
}

function uniqueBadges(labels: Array<string | null | undefined>): string[] {
  return Array.from(new Set(labels.map((label) => String(label || '').trim()).filter(Boolean)));
}

function reasonBadgesForOption(
  option: ParkingOption,
  mode: ParkingSortMode,
  tripData: TripData | null,
): string[] {
  const totalCost = getParkingComparableCost(option, tripData);
  const walkMinutes =
    option.walkingMinutes ??
    option.transferToTerminalMinutes ??
    option.shuttleMinutes ??
    null;

  return uniqueBadges([
    mode === 'cheapest'
      ? 'Lowest total price'
      : mode === 'fastest'
        ? 'Fastest door-to-destination'
        : mode === 'easiest'
          ? 'Best overall'
          : 'Best overall',
    totalCost === 0 ? 'Verified free parking' : null,
    parkingRankEvidenceLabel(option, mode, {
      isUnavailable: isParkingRouteUnavailable,
      totalCost: (parking) => getParkingComparableCost(parking, tripData),
      tripData,
    }),
    typeof walkMinutes === 'number' && walkMinutes > 0 && walkMinutes <= 6
      ? 'Closest walk'
      : null,
    option.priceDisplay === 'live' &&
      option.pricingConfidence === 'live'
      ? 'Live bookable price'
      : null,
    option.priceConfidence === 'high' || option.trustStatus === 'live'
      ? 'High confidence'
      : null,
  ]);
}

function explanationForOption(
  option: ParkingOption,
  mode: ParkingSortMode,
  tripData: TripData | null,
): string {
  const price = getParkingTotalPrice(option, tripData);
  const time = parkingTimeBreakdown(
    option,
    buildParkingDriveContextFromOption(option),
    tripData ? resolveTripParkingContext(tripData) : 'airport_trip',
  ).totalMinutes;
  const priceText = typeof price === 'number' ? `${formatMoneyWhole(price)} total` : 'a usable price signal';
  const timeText = formatCompactMinutes(time);

  if (mode === 'cheapest') {
    if (getParkingComparableCost(option, tripData) === 0) {
      return 'Picked because it is verified free parking and still has a usable route.';
    }
    return `Picked because it has the lowest comparable total price (${priceText}) among route-available options.`;
  }

  if (mode === 'fastest') {
    return `Picked because it has the shortest door-to-destination time (${timeText}) without using an unavailable or zero-minute route fallback.`;
  }

  if (mode === 'easiest') {
    return `Picked because it combines low-effort access, route confidence, and a short total path (${timeText}).`;
  }

  return `Picked because it balances price, route time, availability, and confidence (${priceText}, ${timeText}).`;
}

export default function ParkingSmartPick({
  options,
  tripData,
  selectedOption,
  sortMode = 'easiest',
  leaveByTime,
  aprLivePrices = {},
  weatherImpact,
  weatherContext,
  onShowReviews,
  googleEnrichedParking = {},
}: {
  options: ParkingOption[];
  tripData: TripData | null;
  selectedOption?: ParkingOption | null;
  sortMode?: ParkingSortMode;
  leaveByTime?: string | null;
  aprLivePrices?: Record<string, number>;
  aprLiveChecking?: boolean;
  weatherImpact?: WeatherImpact | null;
  weatherContext?: WeatherContext;
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
  const airportTrip = isAirportTrip(tripData);

  const selectedOptionWithAprLivePrice = selectedOption
    ? (withAprLivePrice(
      mergeGoogleEnrichedParking(selectedOption, googleEnrichedParking),
      aprLivePrices
    ) as ParkingOption)
    : undefined;

  const smartPickCandidates = routeAvailableOptions.filter((p) => {
    if (airportTrip && !isAirportPlausibleParking(p)) return false;

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
    smartPickCandidates.length > 0
      ? smartPickCandidates
      : routeAvailableOptions.length > 0
        ? routeAvailableOptions
        : optionsWithAprLivePrice.filter((option) => !airportTrip || isAirportPlausibleParking(option));

  if (candidateOptions.length === 0) return null;

  const modeSortedCandidates =
    routeAvailableOptions.length > 0
      ? sortParkingOptionsForMode(candidateOptions, sortMode, {
          isUnavailable: isParkingRouteUnavailable,
          totalCost: (option) => getParkingComparableCost(option, tripData),
          tripData,
        })
      : candidateOptions;

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
    selectedOptionWithAprLivePrice &&
      (!airportTrip || isAirportPlausibleParking(selectedOptionWithAprLivePrice))
      && (!isParkingRouteUnavailable(selectedOptionWithAprLivePrice) || routeAvailableOptions.length === 0)
      ? selectedOptionWithAprLivePrice
      : null;

  const best =
    selectedSmartPick ||
    modeSortedCandidates[0] ||
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
  const priceTrust = resolveParkingPriceTrust(best, tripData);
  const routeTimingUnavailable = isParkingRouteUnavailable(best);

  const parkingTripContext = tripData
    ? resolveTripParkingContext(tripData)
    : 'airport_trip';

  const bestTime = routeTimingUnavailable
    ? { totalMinutes: 0, parts: [] as Array<{ label: string; minutes: number; display?: string }> }
    : parkingTimeBreakdown(
        best,
        buildParkingDriveContextFromOption(best),
        parkingTripContext,
      );
  const bestTimeLabel = routeTimingUnavailable
    ? 'Route timing unavailable'
    : `${formatCompactMinutes(bestTime.totalMinutes)} total`;

  const weatherBadge = weatherParkingBadge(best, weatherImpact, weatherContext);
  const modeBadges = reasonBadgesForOption(best, sortMode, tripData);
  const pickExplanation = routeTimingUnavailable
    ? 'Showing best available parking estimate. Open directions to confirm route timing.'
    : explanationForOption(best, sortMode, tripData);
  const customerOnlyWarning =
    best.accessType === 'customer_only' || best.accessType === 'validated_customer'
      ? 'Customer-only parking may require shopping, validation, or posted-lot compliance.'
      : null;

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
  const handoff = buildParkingProviderHandoff(best, tripData, best.sourceLink);

  const bestWithMeta = best as ParkingOption & {
    updatedAt?: string;
  };

  return (
    <section className="travel-card overflow-hidden rounded-3xl p-4 shadow-[0_18px_50px_rgba(14,116,144,0.12)] sm:p-5">
      <div className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase text-primary">
        Smart parking pick
      </div>

      <div className="mt-4">
        <ParkingLotVisual
          option={best}
          tripContext={parkingTripContext}
          airportCode={(tripData as { airportCode?: string } | null)?.airportCode ?? null}
        />
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">{best.name}</h2>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {modeBadges.map((badge) => (
              <span
                key={badge}
                className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-100"
              >
                {badge}
              </span>
            ))}

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
              {parkingTripContext === 'city_destination_trip'
                ? getParkingVisualBadgeLabel(best, parkingTripContext)
                : best.transferType === 'walk'
                  ? 'Walk'
                  : best.transferType === 'airport-garage'
                    ? 'Airport garage'
                    : 'Shuttle'}
            </span>

            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">
              {best.trustStatus === 'live' ? 'Live Price' : 'Verified Link'}
            </span>

            {getVisibleParkingFeatureBadges(best).slice(0, 3).map((meta) => (
              <span
                key={`${meta.key}-${meta.confidence}`}
                title={`Source: ${meta.sourceLabel}. Confidence: ${meta.confidence.replace('_', ' ')}.`}
                className={
                  'rounded-full px-2.5 py-1 ring-1 ' +
                  (meta.confidence === 'verified'
                    ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
                    : meta.confidence === 'provider_claimed'
                      ? 'bg-blue-50 text-blue-800 ring-blue-100'
                      : 'bg-amber-50 text-amber-900 ring-amber-100')
                }
              >
                {meta.label}
              </span>
            ))}

            <span className={`rounded-full px-2.5 py-1 font-medium ${weatherBadge.className}`}>
              {weatherBadge.label}
            </span>

            {weatherImpact && weatherImpact.riskLevel !== 'low' && (
              <div className="mt-2 text-xs font-medium text-sky-800">
                Weather factor: {weatherImpact.summary}. Covered or close-in parking gets a boost in this weather.
              </div>
            )}
          </div>

          <div className="mt-4 text-2xl font-bold text-slate-950">
            {bestPriceDisplay.primary}
          </div>

          {bestPriceDisplay.secondary && (
            <div className="mt-1 text-sm font-semibold text-zinc-700">
              {bestPriceDisplay.secondary}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${priceTrust.badgeClassName}`}>
              {priceTrust.label}
            </span>
            <span className="text-xs font-medium text-zinc-600">
              Provider controls final price.
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-700">
            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
              {bestTimeLabel}
            </span>

            {bestTime.parts.slice(0, 4).map((part) => (
              <span
                key={`${part.label}-${part.minutes}`}
                className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700"
              >
                {part.label} {part.display ?? formatCompactMinutes(part.minutes)}
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
              <>{pickExplanation}</>
            )}
          </div>

          {savings ? (
            <div className="mt-2 text-sm text-zinc-700">{pickExplanation}</div>
          ) : null}

          {customerOnlyWarning ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950">
              {customerOnlyWarning}
            </div>
          ) : null}

          {routeTimingUnavailable ? (
            <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm font-medium text-foreground">
              Showing best available parking estimate. Open directions to confirm route timing.
            </div>
          ) : null}

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="font-semibold text-slate-950">Booking helper</div>
              <button
                type="button"
                onClick={() => void copyText(handoff.copySummary)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                Copy times
              </button>
            </div>
            {handoff.window ? (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <div className="text-xs font-medium text-slate-500">Check-in</div>
                  <div className="font-semibold text-slate-900">
                    {handoff.window.checkInDate} {handoff.window.checkInTime}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Check-out</div>
                  <div className="font-semibold text-slate-900">
                    {handoff.window.checkOutDate} {handoff.window.checkOutTime}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Duration</div>
                  <div className="font-semibold text-slate-900">
                    {formatParkingHandoffDuration(handoff.window.durationMinutes)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-2 font-medium text-slate-900">Check selected trip dates/times</div>
            )}
            <div className="mt-2 text-xs text-slate-600">
              {handoff.providerUrlSupportsPrefill
                ? 'Verify these times at provider checkout.'
                : 'Open provider and enter these times.'}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm text-foreground">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-base font-semibold text-foreground">
                  Full route plan
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Drive to the lot first, then follow the{' '}
                  {airportTrip ? 'parking-to-terminal' : 'walk-to-destination'} step.
                </p>
              </div>
              <div className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-foreground">
                {routeTimingUnavailable ? 'Route timing unavailable' : `${formatCompactMinutes(bestTime.totalMinutes)} total trip`}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  1. Origin to parking lot
                </div>
                <div className="mt-2 font-semibold text-foreground">
                  {routeTimingUnavailable
                    ? 'Check route'
                    : formatCompactMinutes(
                        best.originToParkingMinutes ??
                          best.routeToParkingMinutes ??
                          best.driveMinutes ??
                          best.duration ??
                          bestTime.parts[0]?.minutes ??
                          0,
                      )}
                </div>
                <div className="mt-2 text-muted-foreground">
                  {best.address || best.canonicalAddress || best.routeDestination || best.name}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {bestRouteLinks.routeToParkingUrl ? (
                    <a
                      href={bestRouteLinks.routeToParkingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      Directions to lot
                    </a>
                  ) : null}
                  {(best.address || best.canonicalAddress) ? (
                    <button
                      type="button"
                      onClick={() => void copyText(best.address || best.canonicalAddress || '')}
                      className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      Copy address
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  2. Parking to {airportTrip ? 'terminal' : 'destination'}
                </div>
                <div className="mt-2 font-semibold text-foreground">
                  {formatCompactMinutes(
                    best.transferToTerminalMinutes ??
                      best.shuttleMinutes ??
                      best.walkingMinutes ??
                      bestTime.parts[1]?.minutes ??
                      0,
                  )}
                </div>
                <div className="mt-2 text-muted-foreground">
                  {transferDirectionLabel(best, airportTrip)}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {bestRouteLinks.parkingToDestinationUrl ? (
                    <a
                      href={bestRouteLinks.parkingToDestinationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      Directions from lot
                    </a>
                  ) : null}
                  {bestRouteLinks.parkingToAirportUrl ? (
                    <a
                      href={bestRouteLinks.parkingToAirportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      Terminal step
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  3. Total trip summary
                </div>
                <div className="mt-2 font-semibold text-foreground">
                  {bestPriceDisplay.primary}
                </div>
                <dl className="mt-2 space-y-1 text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <dt>Price label</dt>
                    <dd className="font-medium text-foreground">{formatPriceSource(best)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Confidence</dt>
                    <dd className="font-medium text-foreground">{formatConfidence(best)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Weather</dt>
                    <dd className="font-medium text-foreground">
                      {weatherImpact?.riskLevel === 'high'
                        ? 'High impact'
                        : weatherImpact?.riskLevel === 'medium'
                          ? 'Moderate impact'
                          : 'Low impact'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Coverage</dt>
                    <dd className="font-medium text-foreground">
                      {best.covered ? 'Covered' : 'Uncovered or unknown'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Provider</dt>
                    <dd className="font-medium text-foreground">
                      {best.bookingProvider || best.sourceName || 'Parking source'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          <div className="mt-2 text-xs font-medium text-emerald-700">
            Smart pick for {airportTrip ? 'this airport' : 'this destination'}
          </div>

          {/* <ParkingBookingSources option={best} tripData={tripData} /> */}

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
                      {airportTrip
                        ? 'From your origin to being inside the airport terminal.'
                        : 'From your origin to destination arrival.'}
                    </div>
                  </div>

                  <div className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-900">
                    {routeTimingUnavailable ? 'Check route' : formatCompactMinutes(bestTime.totalMinutes)}
                  </div>
                </div>

                {routeTimingUnavailable ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    Route timing is unavailable for this lot. Price, provider, and access details are shown so you can compare, but directions should be confirmed in Maps.
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {bestTime.parts.map((part) => (
                      <div
                        key={`${part.label}-${part.minutes}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span>{part.label}</span>
                        <span className="font-medium text-zinc-900">
                          {part.display ?? formatCompactMinutes(part.minutes)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 border-t border-zinc-200 pt-3">
                  <div className="flex items-center justify-between gap-3 font-semibold text-zinc-900">
                    <span>{airportTrip ? 'Total to terminal' : 'Total to destination'}</span>
                    <span>{routeTimingUnavailable ? 'Check route' : formatCompactMinutes(bestTime.totalMinutes)}</span>
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
                    Price label:{' '}
                    <span className="font-medium">{formatPriceSource(best)}</span>
                  </div>
                )}

                {best.trustStatus && (
                  <div>
                    Overall confidence:{' '}
                    <span className="font-medium">{formatConfidence(best)}</span>
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

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-40">
          {handoff.providerUrl && (
            <a
              href={handoff.providerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700"
            >
              {ctaLabel}
            </a>
          )}

          {bestRouteLinks.routeToParkingUrl && (
            <a
              href={bestRouteLinks.routeToParkingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Route to parking
            </a>
          )}

          {bestRouteLinks.parkingToDestinationUrl && (
            <a
              href={bestRouteLinks.parkingToDestinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              {bestRouteLinks.transferLinkLabel}
            </a>
          )}

          {bestRouteLinks.parkingToAirportUrl && (
            <a
              href={bestRouteLinks.parkingToAirportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              {airportTrip ? 'Parking to terminal' : 'Parking to destination'}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
