'use client';

import { useEffect, useRef, useState } from 'react';
import { ParkingGoogleReview, ParkingOption, TripData } from '../../lib/types';
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
import {
  buildParkingDriveContextFromOption,
  resolveWalkToDestinationMinutes,
} from '../../lib/parking/routeMinutes';
import { getParkingVisualBadgeLabel } from '../../lib/parking/parkingLabels';
import { resolveTripParkingContext } from '../../lib/trip/tripContext';
import { isParkingRouteUnavailable } from '../../lib/parking/routeStatus';
import {
  getParkingComparableCost,
  parkingRankEvidenceLabel,
  parkingRankExplanation,
  sortParkingOptionsForMode,
  type ParkingSortMode,
} from '../../lib/parking/sortParkingOptions';
import {
  buildParkingPriorityBadges,
  getParkingRatingReviewBadgeSemanticKey,
  type ParkingPriorityBadge,
} from '../../lib/parking/priorityBadges';
import { resolveParkingPriceTrust } from '../../lib/parking/priceTrust';
import { getVisibleParkingFeatureBadges } from '../../lib/parking/featureConfidence';
import {
  buildParkingProviderHandoff,
  formatParkingHandoffDuration,
} from '../../lib/parking/providerHandoff';
import { resolveOfficialSeaGarageCtas } from '../../lib/parking/officialAirportGarageGroup';
import {
  buildDestinationParkingIntelligence,
  isPaidParkingOption,
} from '../../lib/parking/destinationParkingIntelligence';
import ParkingAvailabilityBadge from './ParkingAvailabilityBadge';
import CachedParkingNotice, { isCachedParkingOption } from './CachedParkingNotice';
import { WeatherContext, WeatherImpact } from '@/lib/weather/types';
import { getParkingAvailabilityDisplay } from '../../lib/parking/availabilityDisplay';
// import ParkingBookingSources from './ParkingBookSources';
import ParkingLotVisual from './ParkingLotVisual';
import { logParkingPhotoReviewTrace } from '../../lib/parking/photoReviewDebug';
import { selectBestParkingPhotoFields } from '../../lib/parking/parkingLotPhotoShared';
import { isPodPaiGoDebugUIEnabled } from '../../lib/utils/debug';
import {
  getParkingReviewSummary,
  normalizeParkingReviewSummary,
} from '../../lib/parking/reviewSummary';
import ExpandableSection from '../components/ui/ExpandableSection';

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
  if (option.priceSource === 'official-rate' || option.pricingConfidence === 'official') {
    return 'Official published rate';
  }
  if (option.priceDisplay === 'live' || option.pricingConfidence === 'live') return 'Live price';
  if (option.priceDisplay === 'from-per-day') return 'From-per-day price';
  if (option.priceDisplay === 'check-live') return 'Check live price';
  if (option.priceDisplay === 'estimated' || option.priceConfidence === 'low') return 'Estimated price';
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

function parkingToDestinationTimeLabel(
  option: ParkingOption,
  airportTrip: boolean,
  fallbackMinutes?: number,
): string {
  if (!airportTrip) {
    const walkMinutes = resolveWalkToDestinationMinutes(option);
    return walkMinutes != null
      ? formatCompactMinutes(walkMinutes)
      : 'Walk time not confirmed';
  }

  const transferMinutes =
    option.transferToTerminalMinutes ??
    option.shuttleMinutes ??
    option.walkingMinutes ??
    fallbackMinutes;

  return typeof transferMinutes === 'number' && Number.isFinite(transferMinutes)
    ? formatCompactMinutes(transferMinutes)
    : 'Transfer time not confirmed';
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

  if (!enriched) return normalizeParkingReviewSummary(option);

  const photoFields = selectBestParkingPhotoFields(enriched, option);

  return normalizeParkingReviewSummary({
    ...option,
    ...enriched,
    bookingProvider: option.bookingProvider ?? enriched.bookingProvider,
    sourceName:
      option.bookingProvider || option.sourceName === 'ParkWhiz'
        ? option.sourceName ?? enriched.sourceName
        : enriched.sourceName ?? option.sourceName,
    sourceLink: option.sourceLink ?? enriched.sourceLink,
    ...photoFields,
  } as ParkingOption);
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

function parkingReviewSnippets(option: ParkingOption): ParkingGoogleReview[] {
  return (option.googleReviews || [])
    .filter((review) => Boolean(review.text?.trim()))
    .slice(0, 3);
}

function hasParkingReviewSource(option: ParkingOption): boolean {
  const summary = getParkingReviewSummary(option);
  return Boolean(
    typeof summary.reviewScore === 'number' ||
      typeof summary.reviewCount === 'number' ||
      parkingReviewSnippets(option).length > 0 ||
      option.googlePlaceId ||
      option.googleMapsUri,
  );
}

function parkingReviewLabel(option: ParkingOption): string {
  const summary = getParkingReviewSummary(option);

  if (typeof summary.reviewScore === 'number') {
    const rating = summary.reviewScore.toFixed(1);
    if (typeof summary.reviewCount === 'number') {
      return `★ ${rating} · ${summary.reviewCount.toLocaleString()} reviews`;
    }
    return `★ ${rating}`;
  }

  if (typeof summary.reviewCount === 'number') {
    return `${summary.reviewCount.toLocaleString()} reviews`;
  }

  return 'Check reviews';
}

function parkingReviewSummaryLabel(option: ParkingOption): string | null {
  const summary = getParkingReviewSummary(option);
  if (
    typeof summary.reviewScore !== 'number' &&
    typeof summary.reviewCount !== 'number'
  ) {
    return null;
  }

  return parkingReviewLabel(option);
}

function visualSourceFromParkingOption(option: ParkingOption): {
  selectedVisualSource: 'google photo' | 'provider image' | 'illustration';
  illustrationReason: string | null;
} {
  if (option.googlePhotoName || option.googlePhotoNames?.length) {
    return { selectedVisualSource: 'google photo', illustrationReason: null };
  }

  if (option.imageUrl || option.images?.length) {
    return { selectedVisualSource: 'provider image', illustrationReason: null };
  }

  return {
    selectedVisualSource: 'illustration',
    illustrationReason: 'no_google_or_provider_photo_metadata_at_smart_pick_selection',
  };
}

function ParkingPhotoReviewTrace({
  stage,
  option,
  stageNote,
}: {
  stage: string;
  option: ParkingOption;
  stageNote: string;
}) {
  const visualSource = visualSourceFromParkingOption(option);

  useEffect(() => {
    logParkingPhotoReviewTrace(stage, option, {
      stageNote,
      ...visualSource,
    });
  }, [
    option.id,
    option.name,
    option.providerLotId,
    option.googlePlaceId,
    option.googlePhotoName,
    option.googlePhotoNames?.length,
    option.imageUrl,
    option.images?.length,
    option.reviewScore,
    option.reviewCount,
    option.googleReviews?.length,
    stage,
    stageNote,
    visualSource.illustrationReason,
    visualSource.selectedVisualSource,
  ]);

  return null;
}

function shouldLogRenderedReviewDebug(option: ParkingOption): boolean {
  return /securities building garage/i.test(option.name || '');
}

function ParkingRenderedReviewDebug({
  component,
  option,
  badges,
  canShowReviewAction,
}: {
  component: string;
  option: ParkingOption;
  badges: ParkingPriorityBadge[];
  canShowReviewAction: boolean;
}) {
  const loggedRef = useRef(new Set<string>());

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return;
    if (!shouldLogRenderedReviewDebug(option)) return;

    const key = JSON.stringify({
      component,
      id: option.id || option.name,
      googlePlaceId: option.googlePlaceId ?? null,
      reviewScore: option.reviewScore ?? null,
      reviewCount: option.reviewCount ?? null,
      badges: badges.map((badge) => badge.label),
    });
    if (loggedRef.current.has(key)) return;
    loggedRef.current.add(key);

    const raw = option as ParkingOption & Record<string, unknown>;
    console.warn('[parking-results] rendered parking option review debug', {
      component,
      id: option.id,
      name: option.name,
      provider: option.bookingProvider || option.providerSource || option.sourceName,
      address: option.address || option.normalizedAddress || option.canonicalAddress,
      googlePlaceId: option.googlePlaceId,
      googleRating: raw.googleRating,
      googleReviewCount: raw.googleReviewCount,
      reviewScore: option.reviewScore,
      reviewCount: option.reviewCount,
      placeRating: raw.placeRating,
      userRatingsTotal: raw.userRatingsTotal,
      reviewsSummary: raw.reviewsSummary,
      normalizedReviewSummary: getParkingReviewSummary(option),
      canShowReviewAction,
      reviewActionLabel: canShowReviewAction ? parkingReviewLabel(option) : null,
      badgesGenerated: badges.map((badge) => ({
        key: badge.key,
        semanticKey: badge.semanticKey ?? null,
        label: badge.label,
      })),
      availabilityBadge: getParkingAvailabilityDisplay(option).label,
    });
  }, [badges, canShowReviewAction, component, option]);

  return null;
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
          ? 'Easiest'
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
  sortMode = 'best',
  listSortMode,
  leaveByTime,
  leaveByReason,
  aprLivePrices = {},
  weatherImpact,
  weatherContext,
  onShowReviews,
  googleEnrichedParking = {},
  showInternalDebug = isPodPaiGoDebugUIEnabled(),
}: {
  options: ParkingOption[];
  tripData: TripData | null;
  selectedOption?: ParkingOption | null;
  /** Weighted best-overall lens for Smart Pick selection. */
  sortMode?: ParkingSortMode;
  /** Active tab lens used to sort the surrounding parking list. */
  listSortMode?: ParkingSortMode;
  leaveByTime?: string | null;
  leaveByReason?: string | null;
  aprLivePrices?: Record<string, number>;
  aprLiveChecking?: boolean;
  weatherImpact?: WeatherImpact | null;
  weatherContext?: WeatherContext;
  onShowReviews?: (parking: ParkingOption) => void;
  googleEnrichedParking?: Record<string, Partial<ParkingOption>>;
  showInternalDebug?: boolean;
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

  const sortContext = {
    isUnavailable: isParkingRouteUnavailable,
    totalCost: (option: ParkingOption) => getParkingComparableCost(option, tripData),
    tripData,
    peers: candidateOptions,
  };

  const bestOverallCandidates =
    routeAvailableOptions.length > 0
      ? sortParkingOptionsForMode(candidateOptions, 'best', sortContext)
      : candidateOptions;

  const cheapestWinner =
    routeAvailableOptions.length > 0
      ? sortParkingOptionsForMode(candidateOptions, 'cheapest', sortContext)[0]
      : null;
  const fastestWinner =
    routeAvailableOptions.length > 0
      ? sortParkingOptionsForMode(candidateOptions, 'fastest', sortContext)[0]
      : null;
  const easiestWinner =
    routeAvailableOptions.length > 0
      ? sortParkingOptionsForMode(candidateOptions, 'easiest', sortContext)[0]
      : null;

  const activeListMode = listSortMode || sortMode;

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
    bestOverallCandidates[0] ||
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
    ? {
        totalMinutes: 0,
        parts: [] as Array<{ label: string; minutes: number; display?: string }>,
        isPartial: false,
      }
    : parkingTimeBreakdown(
        best,
        buildParkingDriveContextFromOption(best),
        parkingTripContext,
      );
  const bestTimeIsPartial = !routeTimingUnavailable && bestTime.isPartial === true;
  const bestTimeLabel = routeTimingUnavailable
    ? 'Route timing unavailable'
    : bestTimeIsPartial
      ? `${formatCompactMinutes(bestTime.totalMinutes)} partial`
      : `${formatCompactMinutes(bestTime.totalMinutes)} total`;

  const weatherBadge = weatherParkingBadge(best, weatherImpact, weatherContext);
  const parkingReviewActionSemanticKey =
    hasParkingReviewSource(best) && (onShowReviews || best.googleMapsUri)
      ? getParkingRatingReviewBadgeSemanticKey(best)
      : null;
  const modeBadges = buildParkingPriorityBadges({
    option: best,
    mode: 'best',
    tripData,
    peers: candidateOptions,
    maxBadges: 3,
    excludeSemanticKeys: [parkingReviewActionSemanticKey],
  });
  const pickExplanation = routeTimingUnavailable
    ? 'Showing best available parking estimate. Open directions to confirm route timing.'
    : parkingRankExplanation(best, 'best', tripData, candidateOptions);
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
  const canShowReviewAction = hasParkingReviewSource(best);
  const visibleReviewBadgeLabel = parkingReviewSummaryLabel(best);
  const visibleModeBadges = modeBadges.filter(
    (badge) => badge.key !== 'mode-best' && badge.key !== 'reviews',
  );

  const bestRouteLinks = parkingRouteLinks(best, tripData);
  const officialCtas = resolveOfficialSeaGarageCtas(best);
  const handoff = buildParkingProviderHandoff(
    best,
    tripData,
    officialCtas.bookingUrl || best.sourceLink,
  );

  const ctaLabel = officialCtas.reserveLabel;

  const bestWithMeta = best as ParkingOption & {
    updatedAt?: string;
  };
  const destinationIntelligence =
    !airportTrip && tripData
      ? buildDestinationParkingIntelligence({
          destination: tripData.destinationName || tripData.destination,
          destinationKind: tripData.destinationKind,
          airportCode: tripData.airportCode,
          parkingOptions: optionsWithAprLivePrice,
        })
      : null;
  const smartPickBadgeLabel =
    destinationIntelligence && isPaidParkingOption(best)
      ? destinationIntelligence.customerCandidate
        ? destinationIntelligence.paidOptionBackupLabel
        : destinationIntelligence.paidOptionBestLabel
      : 'Best overall';

  return (
    <section className="travel-card overflow-hidden rounded-2xl border border-border p-3 shadow-sm sm:p-4">
      {showInternalDebug ? (
        <>
          <ParkingPhotoReviewTrace
            stage="after_smart_pick_selection"
            option={best}
            stageNote="ParkingSmartPick selected final best parking option"
          />
          <ParkingRenderedReviewDebug
            component="ParkingSmartPick"
            option={best}
            badges={modeBadges}
            canShowReviewAction={canShowReviewAction}
          />
        </>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="h-24 w-full shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-36">
          {showInternalDebug ? (
            <ParkingPhotoReviewTrace
              stage="parking_smart_pick_visual_handoff"
              option={best}
              stageNote="ParkingSmartPick props passed into ParkingLotVisual"
            />
          ) : null}
          <ParkingLotVisual
            option={best}
            tripContext={parkingTripContext}
            airportCode={(tripData as { airportCode?: string } | null)?.airportCode ?? null}
            photoPriority="smart-pick"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-primary">
              {smartPickBadgeLabel}
            </span>
            {visibleModeBadges.slice(0, 2).map((badge) => (
              <span
                key={badge.key}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
              >
                {badge.label}
              </span>
            ))}
            <ParkingAvailabilityBadge option={best} />
            {visibleReviewBadgeLabel ? (
              onShowReviews ? (
                <button
                  type="button"
                  onClick={() => onShowReviews(best)}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100"
                >
                  {visibleReviewBadgeLabel}
                </button>
              ) : best.googleMapsUri ? (
                <a
                  href={best.googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100"
                >
                  {visibleReviewBadgeLabel}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100">
                  {visibleReviewBadgeLabel}
                </span>
              )
            ) : null}
          </div>

          <h2 className="mt-2 text-lg font-semibold leading-tight text-foreground">{best.name}</h2>

          <div className="mt-2 text-xl font-bold text-foreground">{bestPriceDisplay.primary}</div>
          {bestPriceDisplay.badge ? (
            <div className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
              {bestPriceDisplay.badge}
            </div>
          ) : null}
          {bestPriceDisplay.secondary ? (
            <div className="mt-0.5 text-xs font-medium text-muted-foreground">
              {bestPriceDisplay.secondary}
            </div>
          ) : null}

          <p className="mt-2 text-sm text-muted-foreground">
            {bestTimeLabel}
            {airportTrip && !routeTimingUnavailable
              ? ` · ${parkingToDestinationTimeLabel(best, airportTrip, bestTime.parts[1]?.minutes)} to terminal`
              : ''}
            {' · '}
            {formatPriceSource(best)}
          </p>

          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{pickExplanation}</p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {handoff.providerUrl ? (
              <a
                href={handoff.providerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                {ctaLabel}
              </a>
            ) : null}
            {bestRouteLinks.routeToParkingUrl ? (
              <a
                href={bestRouteLinks.routeToParkingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted/80"
              >
                Route to parking
              </a>
            ) : null}
          </div>

          <ExpandableSection title="Details" className="mt-3" contentClassName="space-y-4">
            <section className="space-y-2">
              <div className="text-sm font-semibold text-foreground">Booking</div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="text-right font-medium text-foreground">
                    {handoff.providerName || best.bookingProvider || best.sourceName || 'Parking provider'}
                  </dd>
                </div>
                {handoff.window ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Check-in</dt>
                      <dd className="text-right font-medium text-foreground">
                        {handoff.window.checkInDate} {handoff.window.checkInTime}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Check-out</dt>
                      <dd className="text-right font-medium text-foreground">
                        {handoff.window.checkOutDate} {handoff.window.checkOutTime}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Duration</dt>
                      <dd className="text-right font-medium text-foreground">
                        {formatParkingHandoffDuration(handoff.window.durationMinutes)}
                      </dd>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start justify-between gap-3 sm:col-span-2">
                    <dt className="text-muted-foreground">Parking window</dt>
                    <dd className="text-right font-medium text-foreground">
                      Check selected trip dates/times
                    </dd>
                  </div>
                )}
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void copyText(handoff.copySummary)}
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Copy times
                </button>
                {handoff.providerUrl ? (
                  <a
                    href={handoff.providerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    {officialCtas.isInfoOnly ? 'Check official parking' : 'View provider'}
                  </a>
                ) : null}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Confirm final price and parking window at provider checkout.
              </p>
            </section>

            <section className="space-y-2 border-t border-border pt-4">
              <div className="text-sm font-semibold text-foreground">Timing</div>
              {routeTimingUnavailable ? (
                <p className="text-sm text-muted-foreground">
                  Showing best available parking estimate. Open directions to confirm route timing.
                </p>
              ) : (
                <dl className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-3 font-semibold text-foreground">
                    <dt>
                      {bestTimeIsPartial
                        ? airportTrip
                          ? 'Partial to terminal'
                          : 'Partial to destination'
                        : airportTrip
                          ? 'Total to terminal'
                          : 'Total to destination'}
                    </dt>
                    <dd>
                      {bestTimeIsPartial
                        ? `${formatCompactMinutes(bestTime.totalMinutes)} partial`
                        : formatCompactMinutes(bestTime.totalMinutes)}
                    </dd>
                  </div>
                  {bestTime.parts.map((part) => (
                    <div
                      key={`${part.label}-${part.minutes}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <dt>{part.label}</dt>
                      <dd className="font-medium text-foreground">
                        {part.display ?? formatCompactMinutes(part.minutes)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {displayLeaveByTime ? (
                <p className="text-xs leading-relaxed text-emerald-700">
                  Leave by {displayLeaveByTime}. {leaveByReason || 'Based on your timing choice.'}
                </p>
              ) : null}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Timing includes drive time, parking/check-in time, and walking or transfer time when available.
              </p>
            </section>

            <section className="space-y-2 border-t border-border pt-4">
              <div className="text-sm font-semibold text-foreground">Why this option</div>
              <p className="text-sm leading-relaxed text-muted-foreground">{pickExplanation}</p>
              {savings ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Saves <span className="font-semibold text-emerald-800">{formatMoneyWhole(savings)}</span>{' '}
                  {savingsPercent ? `(${savingsPercent}%) ` : ''}
                  vs official parking with similar timing.
                </p>
              ) : null}
              {customerOnlyWarning ? (
                <p className="text-xs leading-relaxed text-amber-800">{customerOnlyWarning}</p>
              ) : null}
            </section>

            <section className="space-y-2 border-t border-border pt-4">
              <div className="text-sm font-semibold text-foreground">Price/source</div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {priceTrust.disclosure}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Price source:{' '}
                <span className="font-medium text-foreground">
                  {best.bookingProvider || best.sourceName || priceTrust.label}
                </span>
              </p>
            </section>

            <details className="border-t border-border pt-4">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                Data source details
              </summary>
              <div className="mt-3 space-y-3 text-xs leading-relaxed text-muted-foreground">
                {canShowReviewAction && !visibleReviewBadgeLabel && onShowReviews ? (
                  <button
                    type="button"
                    onClick={() => onShowReviews(best)}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100"
                  >
                    {parkingReviewLabel(best)}
                  </button>
                ) : canShowReviewAction && !visibleReviewBadgeLabel && best.googleMapsUri ? (
                  <a
                    href={best.googleMapsUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100"
                  >
                    {parkingReviewLabel(best)}
                  </a>
                ) : null}

                {isCachedParkingOption(best) ? <CachedParkingNotice option={best} /> : null}

                {Array.isArray(best.officialGarageSubOptions) && best.officialGarageSubOptions.length > 0 ? (
                  <div>
                    <div className="font-semibold text-foreground">Official SEA garage products</div>
                    <ul className="mt-2 space-y-2">
                      {best.officialGarageSubOptions.map((sub) => (
                        <li key={sub.id}>
                          <div className="font-medium text-foreground">{sub.label}</div>
                          <div>{sub.detail}</div>
                          <div>Provider: SEA Airport / Port of Seattle · Source: Official published rate</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {getVisibleParkingFeatureBadges(best).slice(0, 6).map((meta) => (
                    <span
                      key={`smart-detail-${meta.key}`}
                      className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      {meta.label}
                    </span>
                  ))}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${weatherBadge.className}`}>
                    {weatherBadge.label}
                  </span>
                </div>

                <div>
                  {best.sourceName ? (
                    <div>
                      Source: <span className="font-medium text-foreground">{best.sourceName}</span>
                    </div>
                  ) : null}
                  {bestWithMeta.updatedAt ? (
                    <div className="mt-1">
                      Updated: <span className="font-medium text-foreground">{bestWithMeta.updatedAt}</span>
                    </div>
                  ) : null}
                  {best.priceConfidence ? (
                    <div className="mt-1">
                      Price label: <span className="font-medium text-foreground">{formatPriceSource(best)}</span>
                    </div>
                  ) : null}
                  {best.trustStatus ? (
                    <div className="mt-1">
                      Overall confidence: <span className="font-medium text-foreground">{formatConfidence(best)}</span>
                    </div>
                  ) : null}
                </div>

                {best.assumptions && best.assumptions.length > 0 ? (
                  <div>
                    <div className="font-semibold text-foreground">Assumptions</div>
                    <p className="mt-1">{best.assumptions.slice(0, 3).join(' ')}</p>
                  </div>
                ) : null}

                {showInternalDebug ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                    <div className="font-semibold text-slate-950">Sort lenses</div>
                    <div className="mt-2 space-y-1">
                      <div>
                        <span className="font-semibold text-slate-900">Best overall:</span>{' '}
                        {best.name}
                      </div>
                      {cheapestWinner ? (
                        <div>
                          <span className="font-semibold text-slate-900">Cheapest:</span>{' '}
                          {cheapestWinner.name}
                        </div>
                      ) : null}
                      {fastestWinner ? (
                        <div>
                          <span className="font-semibold text-slate-900">Fastest:</span>{' '}
                          {fastestWinner.name}
                        </div>
                      ) : null}
                      {easiestWinner ? (
                        <div>
                          <span className="font-semibold text-slate-900">Easiest:</span>{' '}
                          {easiestWinner.name}
                        </div>
                      ) : null}
                      {activeListMode !== 'best' ? (
                        <div className="pt-1 text-slate-500">
                          Current tab ({activeListMode}) reorders the list; Smart Pick stays on best overall.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          </ExpandableSection>
        </div>
      </div>
    </section>
  );
}
