'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  rankRecommendations,
  sortRankedRecommendations,
  RecommendationSortMode,
  calculateParkingDuration,
} from '../../lib/domain';
import { RankedRecommendation } from '../../lib/domain';
import { resolveSeatacCheckinZone } from '../../lib/airports/seatacCheckin';
import { PROVIDER_LINKS } from '../../lib/providerCatalog';
import { AddressInput } from '../trip/AddressInput';
import { getAirportById } from '../../lib/airports/catalog';
import AirportSearchPicker from '../components/AirportSearchPicker';
import ParkingSmartPick from './ParkingSmartPick';
import { withAprLivePrice, getAprLivePrice } from '../../lib/parking/aprLivePrice';
import { formatMinutes, parkingKeySafe, parkingTimeBreakdown } from '../../lib/parking/routeDisplay';
import { parseLocalDate } from '../../lib/tripTime';
import { googleMapsSearchLink, googleMapsDirectionsLink } from '../../lib/maps';
import { dedupeAndSortParkingOptions } from '../../lib/parking/googlePlacesDedupe';
import ParkingLotsMap from './ParkingLotsMap';
import AirportTerminalMap from './AirportTerminalMap';
import ParkingLotVisual from './ParkingLotVisual';
import { calculateAirportReadinessBuffer } from '../../lib/airports/airportReadiness';
import {
  parkingPriceLine,
  getParkingTotalPrice,
  getParkingDailyPrice,
} from '../../lib/parking/priceDisplay';
import {
  parkingRouteLinks,
  routeUrlForOption,
  hasRealParkingPrice
} from '../../lib/parking/routeDisplay';
import {
  isParkingRouteUnavailable,
  mergeParkingRouteStatus,
  parkingRouteUnavailableReason,
  withStableParkingRouteStatus,
} from '../../lib/parking/routeStatus';
import { RIDESHARE_ESTIMATE_DISCLAIMER } from '../../lib/rideshare/estimate';

import {
  parseHHMMToMinutes,
  minutesToHHMM,
  formatTimeFriendly,
  estimateParkingDays,
  buildLocalDateTime,
  formatLocalYYYYMMDD,
} from '../../lib/tripTime';
import {
  PriceDisplay,
  PriceUnit,
  CabinClass,
  FlightType,
  SecurityOption,
  TransportAvailability,
  Recommendation,
  TripData,
  TrustStatus,
  ParkingOption,
  RideshareEstimateConfidence,
  TransitPaymentOption,
  TransitOption,
  RideshareOption
} from '../../lib/types';
import {
  costOf,
  formatMoney,
  formatMoneyCents
} from '../utils/formatter';
import { getAirportSecurityEstimate } from '@/lib/airports/airportSecurity';
import ParkingReviewsModal from './ParkingReviewsModal';
import { attachGooglePlaceToParking } from '@/lib/parking/googlePlaceMatch';
import {
  shouldAttemptGooglePlaceMatch,
} from '../../lib/parking/googlePlaceMatchUtils';
import {
  resolveParkingFreshness,
} from '../../lib/parking/freshnessDisplay';
import type { AccessStrategyOption } from '../../lib/access/types';
import {
  PARK_AND_RIDE_UI_COPY,
  isOvernightAirportParkingTrip,
  partitionParkAndRideAccessOptions,
} from '../../lib/access/parkAndRideAccess';
import {
  formatParkingPriceLine,
  formatPricingConfidenceLabel,
  pricingConfidenceBadgeClass,
} from '../../lib/access/pricingLadder';
import type { WeatherContext, WeatherImpact } from '@/lib/weather/types';
import TransitPaymentPicker from '../components/TransitPaymenPicker';
import {
  buildResultsPathFromSearchParams,
  parseTripDataFromSearchParams,
  tripDataToSearchParams,
} from '../../lib/trip/searchParams';

type PriceableOption = {
  id?: string;
  name: string;
  price?: number;
  priceDisplay?: PriceDisplay;
  priceUnit?: PriceUnit;
  priceNote?: string;
  priceMin?: number;
  priceMax?: number;
  priceRangeLabel?: string;
  rideshareEstimateConfidence?: RideshareEstimateConfidence;
  distanceMiles?: number;
  trustStatus?: TrustStatus;
  sourceLink?: string;
  mapLink?: string;
  bestFor?: string[];
};

type AppOption = PriceableOption & {
  type?: string;
  sourceName?: string;
  bookingProvider?: string;
  searchQuery?: string;
  distance?: number;
  parkingBufferMinutes?: number;
  transferType?: string;
  transferToTerminalMinutes?: number;
  lastUpdated?: string;
  assumptions?: string[];
  availabilityStatus?: string;
  isAvailable?: boolean;
  routeUnavailable?: boolean;
  routeUnavailableReason?: string;
  routeTrustStatus?: TrustStatus;
  googlePlaceId?: string;
  reviewScore?: number;
  reviewCount?: number;
};

type TripDataWithExtras = TripData & {
  airportCode?: string;
  parkingCheckInDate?: string;
  parkingCheckOutDate?: string;
  parkingCheckOutTime?: string;
  timeAnchor?: 'flight-departure' | 'airport-arrival';
  transitPayment?: TransitPaymentOption;
  checkingBags?: boolean;
  securityOption?: SecurityOption;
  flightType?: FlightType;
  cabin?: CabinClass;
  checkedInAtAirport?: boolean;
  parkingDuration?: number;
};

type BestTooLateSummary = {
  flightDeparts: string;
  recommendedBy: string;
  bestArrival: string;
  bestLatestSafeLeave: string;
  shortByMinutes: number;
} | null;

type ProviderLinkItem = PriceableOption;

type ParkingWeatherItem = {
  key: string;
  label: string;
  date: string;
  context: WeatherContext;
  weatherImpact: WeatherImpact | null;
};


type SortTab = RecommendationSortMode;

function isSelectedDatePrice(option: { bestFor?: string[]; priceNote?: string }) {
  return (
    option.bestFor?.includes('Selected-date price') ||
    option.bestFor?.includes('APR listed price') ||
    option.priceNote?.toLowerCase().includes('selected-date') ||
    option.priceNote?.toLowerCase().includes('apr listed')
  );
}

function formatParkingDailyPrice(option: { price: number; bestFor?: string[]; priceNote?: string }) {
  return isSelectedDatePrice(option)
    ? `${formatMoney(option.price)}/day`
    : `From ${formatMoney(option.price)}/day`;
}

function formatMiniMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';

  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function parkingTimeParts(option: ParkingOption) {
  const breakdown = parkingTimeBreakdown(option);
  return {
    total: breakdown.totalMinutes,
    parts: breakdown.parts,
  };
}

function ParkingTimeSummary({
  option,
  compact = false,
  routeUnavailable = false,
}: {
  option: ParkingOption;
  compact?: boolean;
  routeUnavailable?: boolean;
}) {
  const unavailable = routeUnavailable || isParkingRouteUnavailable(option);

  if (unavailable) {
    if (compact) {
      return (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          Route unavailable from this origin.
        </div>
      );
    }

    return (
      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <div className="font-semibold text-red-800">
          Route unavailable from this origin
        </div>
        <div className="mt-1">
          We could not calculate a real route from your origin to this parking option.
          Try an origin near the airport, rideshare, taxi, or another transportation option.
        </div>
      </div>
    );
  }

  const breakdown = parkingTimeParts(option);

  if (compact) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-zinc-900">
          Total time {formatMiniMinutes(breakdown.total)}
        </span>

        {breakdown.parts.slice(0, 3).map((part) => (
          <span
            key={`${part.label}-${part.minutes}`}
            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700"
          >
            {part.label} {formatMiniMinutes(part.minutes)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs font-medium text-zinc-500">
          Total time to terminal
        </span>
        <span className="text-base font-bold text-zinc-900">
          {formatMiniMinutes(breakdown.total)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {breakdown.parts.map((part) => (
          <span
            key={`${part.label}-${part.minutes}`}
            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700"
          >
            {part.label} {formatMiniMinutes(part.minutes)}
          </span>
        ))}
      </div>
    </div>
  );
}

function isAprOption(
  option: PriceableOption & { bookingProvider?: string }
): boolean {
  return option?.bookingProvider === 'AirportParkingReservations' && !!option?.sourceLink;
}

function InlinePriceLoading() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-blue-300 bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-900 shadow-sm">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
      Updating live price
    </span>
  );
}

function isOneOf<T extends readonly string[]>(
  value: string,
  allowed: T
): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

function confidenceFromTrust(trust: TrustStatus): { label: string; className: string } {
  switch (trust) {
    case 'verified-source':
      return { label: 'High confidence', className: 'bg-blue-50 text-blue-800 border-blue-200' };
    case 'live':
      return { label: 'Live', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    case 'estimated':
      return { label: 'Medium confidence', className: 'bg-amber-50 text-amber-900 border-amber-200' };
    case 'fallback':
    default:
      return { label: 'Low confidence', className: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
  }
}

function rideshareConfidenceMeta(
  confidence?: RideshareEstimateConfidence
): { label: string; className: string } | null {
  switch (confidence) {
    case 'live-route-estimate':
    case 'baseline-estimate':
      return {
        label: 'Estimated',
        className: 'bg-amber-50 text-amber-900 border-amber-200',
      };
    case 'unavailable':
      return {
        label: 'Unavailable',
        className: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      };
    default:
      return null;
  }
}

function ridesharePricePrimary(option: AppOption): string | null {
  if (typeof option.priceMin === 'number' && typeof option.priceMax === 'number') {
    return `Estimated $${option.priceMin}–$${option.priceMax} rideshare range`;
  }

  if (option.priceRangeLabel) {
    return `Estimated ${option.priceRangeLabel} rideshare range`;
  }

  if (typeof option.price === 'number' && option.price > 0) {
    return `Estimated ${formatMoney(option.price)} rideshare range`;
  }

  return null;
}

function getTripAirportCode(tripData: TripData | null): string {
  return ((tripData as TripDataWithExtras | null)?.airportCode || 'SEA').toUpperCase();
}

function formatWeatherDateLabel(date: string): string {
  const parsed = parseLocalDate(date);
  if (!parsed) return date;

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildWeatherTargetDateTime(date: string, time?: string): string {
  return `${date}T${time || '12:00'}`;
}

function weatherRiskText(weather: WeatherImpact): string {
  if (weather.riskLevel === 'low') return 'Normal travel conditions';
  if (weather.riskLevel === 'medium') return 'May impact comfort';
  return 'Plan for weather impact';
}

function weatherRiskClass(weather: WeatherImpact): string {
  if (weather.riskLevel === 'high') return 'border-red-200 bg-red-50 text-red-800';
  if (weather.riskLevel === 'medium') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-zinc-200 bg-zinc-50 text-zinc-800';
}

function weatherSectionTitle(context?: WeatherContext): string {
  if (context === 'travel-time-forecast') return 'Weather for your travel time';
  if (context === 'current-airport-weather') return 'Current airport weather';
  if (context === 'forecast-unavailable') return 'Forecast not available yet';
  return 'Weather unavailable';
}

function weatherSectionDetail(context?: WeatherContext): string {
  if (context === 'forecast-unavailable') {
    return 'Weather check becomes available closer to your trip date.';
  }

  if (context === 'current-airport-weather') {
    return 'Showing current conditions because a valid travel time was not provided.';
  }

  if (context === 'invalid-travel-time') {
    return 'We could not read the selected travel date/time for weather.';
  }

  return 'Weather data is currently unavailable.';
}

async function copyTextThenOpen(text: string, url: string) {
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

  window.open(url, '_blank', 'noopener,noreferrer');
}

function typeLabel(type: RankedRecommendation['type']): string {
  if (type === 'rideshare') return 'Ride';
  if (type === 'parking') return 'Parking';
  return 'Transit';
}

function bestLink(option: PriceableOption): string | null {
  return option.sourceLink || option.mapLink || null;
}

function parkingProviderSourceText(option: {
  sourceName?: string;
  bookingProvider?: string;
}): string {
  return `${option.bookingProvider || ''} ${option.sourceName || ''}`.toLowerCase();
}

function isUnreliableGeneratedParkingBookingLink(
  option: {
    sourceName?: string;
    bookingProvider?: string;
    name?: string;
    trustStatus?: TrustStatus;
    priceDisplay?: PriceDisplay;
  },
  link?: string | null
): boolean {
  const provider = parkingProviderSourceText(option);
  const url = String(link || '').toLowerCase();

  if (provider.includes('way.com') || /\bway\b/.test(provider)) {
    return true;
  }

  if (!provider.includes('parkwhiz')) {
    return false;
  }

  if (!url) return true;

  const isGenericParkWhizUrl =
    url === 'https://www.parkwhiz.com' ||
    url === 'https://parkwhiz.com' ||
    url.includes('/airport-parking') ||
    url.includes('/search');

  return (
    isGenericParkWhizUrl ||
    (option.trustStatus !== 'live' && option.trustStatus !== 'verified-source')
  );
}

function trustedParkingBookingLink<T extends {
  sourceName?: string;
  bookingProvider?: string;
  name?: string;
  trustStatus?: TrustStatus;
  priceDisplay?: PriceDisplay;
  sourceLink?: string;
}>(option: T): string | null {
  const link = option.sourceLink || null;
  if (!link) return null;

  return isUnreliableGeneratedParkingBookingLink(option, link) ? null : link;
}

function pricingKindLabel(kind?: string): string {
  switch (kind) {
    case 'live':
      return 'Live';
    case 'estimated':
      return 'Estimated';
    case 'mock':
      return 'Mock data';
    case 'check-live':
    case 'from-per-day':
      return 'Final price on provider';
    default:
      return 'Estimated';
  }
}

function formatProviderPrice(it: PriceableOption): { primary: string; secondary?: string } {
  const line = formatParkingPriceLine(it as ParkingOption, null);
  return {
    primary: line.primary,
    secondary: line.secondary || it.priceNote,
  };
}

function PriceLegend() {
  return (
    <div className="rounded-2xl border border-sky-100 bg-white/90 p-4 text-sm text-slate-700 shadow-sm shadow-sky-900/5">
      <div className="font-semibold text-zinc-900">Price legend</div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <div className="font-medium">Live</div>
          <div className="text-xs text-zinc-600">Pulled from provider/API for selected dates</div>
        </div>
        <div>
          <div className="font-medium">Recent</div>
          <div className="text-xs text-zinc-600">Cached or snapshot within the last week</div>
        </div>
        <div>
          <div className="font-medium">Official</div>
          <div className="text-xs text-zinc-600">Published airport or agency rate</div>
        </div>
        <div>
          <div className="font-medium">Estimated</div>
          <div className="text-xs text-zinc-600">Modelled or curated estimate with assumptions</div>
        </div>
        <div className="sm:col-span-2">
          <div className="font-medium">Final price on provider</div>
          <div className="text-xs text-zinc-600">Numeric anchor shown; confirm final rate at checkout</div>
        </div>
      </div>
    </div>
  );
}

function HiddenAccessOptionsSection({
  options,
}: {
  options: AccessStrategyOption[];
}) {
  const hiddenGems = options.filter((option) => option.isHiddenGem);

  if (hiddenGems.length === 0) return null;

  const renderOption = (option: AccessStrategyOption) => (
    <div
      key={option.id}
      className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-bold text-zinc-900">{option.displayName}</div>
          <div className="mt-1 text-base font-semibold text-zinc-800">
            {option.pricing.displayPrimary}
          </div>
          <div className="mt-1 text-sm text-zinc-600">
            {option.pricing.displaySecondary}
          </div>
          <div className="mt-2 text-sm text-zinc-700">{option.explanation}</div>
          {option.overnightCaveat ? (
            <div className="mt-2 text-sm text-amber-900">{option.overnightCaveat}</div>
          ) : null}
          {option.parkAndRideRules?.ruleNote ? (
            <div className="mt-2 text-sm text-amber-900">{option.parkAndRideRules.ruleNote}</div>
          ) : null}
          {option.recommendedForTrip === false ? (
            <div className="mt-2 text-sm font-medium text-amber-950">
              {option.notRecommendedReason || PARK_AND_RIDE_UI_COPY.notRecommendedOvernight}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${pricingConfidenceBadgeClass(option.pricing.confidence)}`}
          >
            {formatPricingConfidenceLabel(option.pricing.confidence)}
          </span>
          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
            {option.timing.terminalReadyMinutes} min to terminal-ready
          </span>
        </div>
      </div>

      {option.bestFor?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {option.bestFor.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {option.mapLink ? (
          <a
            href={option.mapLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            View on map
          </a>
        ) : null}
        {option.sourceLink ? (
          <a
            href={option.sourceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Transit info
          </a>
        ) : null}
      </div>
    </div>
  );

  return (
    <div id="hidden-access-options" className="mt-6 scroll-mt-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold">Hidden access options</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Realistic airport access strategies that are easy to miss in standard parking searches.
        </p>
      </div>
      <div className="space-y-3">{hiddenGems.map(renderOption)}</div>
    </div>
  );
}

function TransitParkAndRideCards({
  options,
  isOvernightTrip = false,
}: {
  options: AccessStrategyOption[];
  isOvernightTrip?: boolean;
}) {
  const [showNotRecommended, setShowNotRecommended] = useState(false);

  if (options.length === 0) return null;

  const { recommended, notRecommendedForOvernight } =
    partitionParkAndRideAccessOptions(options, isOvernightTrip);

  const renderCard = (option: AccessStrategyOption, forOvernightWarning = false) => (
    <div
      key={option.id}
      className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-900">{option.displayName}</div>
          {forOvernightWarning || option.recommendedForTrip === false ? (
            <>
              <div className="mt-2 text-sm font-medium text-amber-950">
                {PARK_AND_RIDE_UI_COPY.notRecommendedOvernight}
              </div>
              <div className="mt-1 text-xs leading-5 text-amber-900">
                {option.parkAndRideRules?.ruleNote || PARK_AND_RIDE_UI_COPY.unknownRulesNote}
              </div>
              <div className="mt-1 text-xs text-zinc-600">
                {PARK_AND_RIDE_UI_COPY.verifyRules}
              </div>
            </>
          ) : (
            <>
              <div className="mt-1 text-sm font-medium text-zinc-800">
                {option.pricing.displayPrimary}
              </div>
              <div className="mt-1 text-xs text-zinc-600">{option.pricing.displaySecondary}</div>
              <div className="mt-2 text-xs text-amber-900">
                {PARK_AND_RIDE_UI_COPY.sameDayCaveat}. {PARK_AND_RIDE_UI_COPY.verifyRules}
              </div>
              {option.parkAndRideRules?.ruleNote ? (
                <div className="mt-1 text-xs text-zinc-600">{option.parkAndRideRules.ruleNote}</div>
              ) : null}
            </>
          )}
        </div>
        <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
          {option.timing.terminalReadyMinutes} min
        </span>
      </div>
      {option.mapLink ? (
        <a
          href={option.mapLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800"
        >
          View on map →
        </a>
      ) : null}
    </div>
  );

  return (
    <div className="mt-4 space-y-3 border-t border-zinc-200 pt-4">
      {recommended.length > 0 ? (
        <>
          <div>
            <div className="text-sm font-semibold text-zinc-900">Park & ride options</div>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              {PARK_AND_RIDE_UI_COPY.sameDayCaveat}. {PARK_AND_RIDE_UI_COPY.verifyRules}
            </p>
          </div>
          {recommended.map((option) => renderCard(option))}
        </>
      ) : null}

      {notRecommendedForOvernight.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <button
            type="button"
            onClick={() => setShowNotRecommended((open) => !open)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="text-sm font-semibold text-amber-950">
              Not recommended for overnight parking ({notRecommendedForOvernight.length})
            </span>
            <span className="text-xs font-semibold text-amber-900">
              {showNotRecommended ? 'Hide' : 'Show'}
            </span>
          </button>
          <p className="mt-2 text-xs leading-5 text-amber-900">
            {PARK_AND_RIDE_UI_COPY.unknownRulesNote}
          </p>
          {showNotRecommended ? (
            <div className="mt-3 space-y-3">
              {notRecommendedForOvernight.map((option) => renderCard(option, true))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function providerIcon(providerName: string): string {
  const name = providerName.toLowerCase();

  if (name.includes('lyft')) return 'lyft';
  if (name.includes('uber')) return 'uber';
  if (name.includes('taxi')) return 'taxi';
  if (name.includes('sound transit')) return '🚆';
  if (name.includes('google maps')) return '🗺️';

  return '🚗';
}

function PricingLinksSection({
  title,
  items,
  transitPayment,
}: {
  title: string;
  items: ProviderLinkItem[];
  transitPayment?: TransitPaymentOption;
}) {
  if (!items || items.length === 0) return null;

  const isRideSection = title.toLowerCase().includes('ride');
  const isTransitSection = title.toLowerCase().includes('transit');

  return (
    <div className="divide-y divide-slate-100 bg-white">
      {items.map((it: ProviderLinkItem) => {
        const trust = confidenceFromTrust((it.trustStatus || 'estimated') as TrustStatus);
        const rideshareConfidence = rideshareConfidenceMeta(it.rideshareEstimateConfidence);
        const price = formatProviderPrice(it);
        const link = bestLink(it);
        const kind = it.priceDisplay as string | undefined;

        const isTransitUtility =
          isTransitSection &&
          (it.id === 'soundtransit-planner' || it.id === 'google-maps-transit');

        const shouldShowPrice = !isTransitUtility;

        const shouldShowPriceKindBadge =
          kind && !(isTransitSection && kind === 'check-live');

        const primaryPrice =
          isTransitSection && transitPayment === 'orca-pass'
            ? '$0'
            : isRideSection
              ? ridesharePricePrimary(it as AppOption) || `Est. ${it.priceRangeLabel || formatMoney(it.price || 0)}`
              : price.primary;

        const secondaryPrice =
          isTransitSection && transitPayment === 'orca-pass'
            ? 'Covered by ORCA pass'
            : isRideSection
              ? it.priceNote || RIDESHARE_ESTIMATE_DISCLAIMER
              : it.priceNote || price.secondary;

        const primaryCta =
          it.id === 'soundtransit-planner'
            ? 'Official website'
            : isTransitSection
              ? 'View route'
              : isRideSection
                ? String(it.name || '').toLowerCase().includes('taxi')
                  ? 'Find taxi'
                  : 'Open app'
                : 'View deal';

        const sourceAndMapSame = Boolean(link && it.mapLink && link === it.mapLink);

        return (
          <div key={it.id || it.name} className="px-3 py-3 sm:px-5 sm:py-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-sky-200 hover:shadow-md sm:p-4">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sm font-bold text-slate-900 ring-1 ring-sky-100 sm:h-12 sm:w-12">
                  {providerIcon(it.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-base font-semibold leading-snug text-zinc-900">
                        {it.name}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + trust.className}>
                          {trust.label}
                        </span>

                        {shouldShowPriceKindBadge && (
                          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
                            {pricingKindLabel(kind)}
                          </span>
                        )}

                        {rideshareConfidence && (
                          <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + rideshareConfidence.className}>
                            {rideshareConfidence.label}
                          </span>
                        )}
                      </div>
                    </div>

                    {shouldShowPrice && (
                      <div className="shrink-0 text-left sm:text-right">
                        <div className="text-lg font-bold text-zinc-900">
                          {primaryPrice}
                        </div>

                        {isTransitSection && typeof it.price === 'number' && (
                          <div className="text-xs font-medium text-zinc-500">
                            {transitPayment === 'orca-pass' ? 'pass applied' : 'fare estimate'}
                          </div>
                        )}

                        {isRideSection && typeof it.price === 'number' && (
                          <div className="text-xs font-medium text-zinc-500">
                            ride estimate
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {secondaryPrice && (
                    <div className="mt-2 text-xs leading-relaxed text-zinc-500">
                      {secondaryPrice}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {it.mapLink && !sourceAndMapSame && (
                      <a
                        href={it.mapLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                      >
                        View route
                      </a>
                    )}

                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        {primaryCta}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SortTabs({ value, onChange }: { value: SortTab; onChange: (v: SortTab) => void }) {
  const tabs: Array<{ key: SortTab; label: string; sub: string }> = [
    { key: 'easiest', label: 'Easiest', sub: 'Lowest stress' },
    { key: 'cheapest', label: 'Cheapest', sub: 'Lowest cost' },
    { key: 'fastest', label: 'Fastest', sub: 'Shortest time' },
  ];

  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl border border-sky-100 bg-white/95 p-1.5 shadow-sm sm:gap-2 sm:p-2">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={
              'rounded-xl px-2 py-2 text-left transition sm:px-3 ' +
              (active ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'bg-white text-zinc-900 hover:bg-sky-50')
            }
          >
            <div className="text-sm font-semibold">{t.label}</div>
            <div className={active ? 'text-xs text-blue-100' : 'text-xs text-zinc-500'}>{t.sub}</div>
          </button>
        );
      })}
    </div>
  );
}

function optionPriceSummary(
  option: PriceableOption & {
    bookingProvider?: string;
    sourceName?: string;
    priceConfidence?: string;
  },
  computedTotal: number,
  tripData: TripData | null
): { primary: string; secondary?: string; badge?: string } {
  const kind = option?.priceDisplay as string | undefined;
  const unit = option?.priceUnit as string | undefined;
  const days = Math.max(1, estimateParkingDays(tripData));
  const isSelectedAprPrice = isSelectedDatePrice(option);

  const isAprParking =
    option?.bookingProvider === 'AirportParkingReservations' ||
    option?.sourceName === 'AirportParkingReservations';

  // ParkWhiz / any provider returning selected-trip TOTAL
  // Example: option.price = 112.48 total for 7 days => $16.07/day
  if (unit === 'total' && typeof option?.price === 'number' && option.price > 0) {
    const daily = option.price / days;

    return {
      primary: `${formatMoney(daily)}/day`,
      secondary: `Total: ${formatMoney(option.price)} for ${days} day(s)`,
    };
  }

  // Provider returning PER-DAY rate
  // Example: option.price = 30/day => total = 30 * days
  if (unit === 'per-day' && typeof option?.price === 'number' && option.price > 0) {
    return {
      primary: `${formatMoney(option.price)}/day`,
      secondary: `Est. total: ${formatMoney(option.price * days)} for ${days} day(s)`,
    };
  }

  // APR currently behaves like per-day in your app
  if (isAprParking && typeof option?.price === 'number' && option.price > 0) {
    return {
      primary: `${formatMoney(option.price)}/day`,
      secondary: `Est. total: ${formatMoney(option.price * days)} for ${days} day(s) · Check final price with provider`,
    };
  }

  if (kind === 'check-live') {
    const ladderLine = formatParkingPriceLine(option as ParkingOption, tripData);
    return {
      primary: ladderLine.primary,
      secondary: ladderLine.secondary || option?.priceNote,
      badge: formatPricingConfidenceLabel(ladderLine.confidence),
    };
  }

  if (kind === 'from-per-day' && unit === 'per-day' && typeof option?.price === 'number') {
    const primary = isSelectedAprPrice
      ? `${formatMoney(option.price)}/day`
      : `From ${formatMoney(option.price)}/day`;

    return {
      primary,
      secondary: option?.priceNote,
    };
  }

  if (kind === 'mock') {
    return {
      primary: `Mock estimate: ${formatMoney(computedTotal)}`,
      secondary: option?.priceNote,
      badge: 'Mock data',
    };
  }

  if (kind === 'estimated') {
    return {
      primary: `Est. ${formatMoney(computedTotal)}`,
      secondary: option?.priceNote,
    };
  }

  return {
    primary: formatMoney(computedTotal),
    secondary: option?.priceNote,
  };
}

type BookingTrust = 'high' | 'medium' | 'low';

type BookingSourceType = 'official source' | 'direct booking' | 'marketplace' | 'compare marketplace';

type BookingSourceRow = {
  provider: string;
  type: BookingSourceType;
  trust: BookingTrust;
  trustLabel: string;
  trustClassName: string;
  notes: string;
  link: string;
  ctaLabel: string;
  pricePerDay: number | null;
  priceDisplay: 'estimated' | 'check-live' | 'live' | 'from-per-day';
  estimatedTripTotal: number | null;
};

function bookingTrustMeta(trust: BookingTrust): { label: string; className: string } {
  if (trust === 'high') {
    return { label: 'High', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
  }
  if (trust === 'medium') {
    return { label: 'Medium', className: 'bg-amber-50 text-amber-900 border-amber-200' };
  }
  return { label: 'Low', className: 'bg-red-50 text-red-800 border-red-200' };
}

function buildBookingSourceRows(parking: PriceableOption & {
  type?: string;
  sourceName?: string;
  bookingProvider?: string;
}, tripData: TripData | null): BookingSourceRow[] {
  const id = String(parking?.id || '').toLowerCase();
  const name = String(parking?.name || '').toLowerCase();

  const isWally = id.includes('wally') || name.includes('wally');
  const isMaster = id.includes('master') || name.includes('master');
  const airportCode = getTripAirportCode(tripData);
  const airport = getAirportById(airportCode) || getAirportById('SEA')!;
  const airportSearchName = `${airport.label} (${airport.id}) parking`;

  const isOfficialAirport = String(parking?.type || '') === 'official';

  const days = estimateParkingDays(tripData);

  const mkRow = (r: {
    provider: string;
    type: BookingSourceType;
    trust: BookingTrust;
    notes: string;
    link: string;
    ctaLabel: string;
    pricePerDay: number | null;
    priceDisplay: 'estimated' | 'check-live' | 'live' | 'from-per-day';
  }): BookingSourceRow => {
    const trustMeta = bookingTrustMeta(r.trust);

    const estimatedTripTotal =
      typeof r.pricePerDay === 'number'
        ? Math.round(r.pricePerDay * days * 100) / 100
        : null;

    return {
      provider: r.provider,
      type: r.type,
      trust: r.trust,
      trustLabel: trustMeta.label,
      trustClassName: trustMeta.className,
      notes: r.notes,
      link: r.link,
      ctaLabel: r.ctaLabel,
      pricePerDay: r.pricePerDay,
      priceDisplay: r.priceDisplay,
      estimatedTripTotal,
    };
  };

  const directProvider = isOfficialAirport
    ? `Official ${airport.id}`
    : isWally
      ? 'WallyPark (Direct)'
      : isMaster
        ? 'MasterPark (Direct)'
        : `${parking?.name || 'Lot'} (Direct)`;

  const directNotes = isOfficialAirport
    ? 'Official source'
    : 'Direct booking';

  const directPricePerDay =
    typeof parking?.price === 'number' && parking.price > 0
      ? parking.price
      : null;

  const directPriceDisplay: 'estimated' | 'check-live' | 'live' | 'from-per-day' =
    parking?.trustStatus === 'live'
      ? 'from-per-day'
      : (directPricePerDay != null ? 'from-per-day' : 'check-live');

  const spotHeroUrl = `https://spothero.com/search?search=${encodeURIComponent(airportSearchName)}`;
  const directLink =
    trustedParkingBookingLink(parking) ||
    (isOfficialAirport
      ? airport.officialParkingUrl || googleMapsSearchLink(airportSearchName)
      : null);

  // Marketplace estimates (clearly labeled estimated)
  const spotHeroEst = null;

  const rows: BookingSourceRow[] = [
    ...(directLink
      ? [
        mkRow({
          provider: directProvider,
          type: isOfficialAirport ? 'official source' : 'direct booking',
          trust: 'high',
          notes: directNotes,
          link: directLink,
          ctaLabel: isOfficialAirport ? 'Book official' : 'Open provider',
          pricePerDay: directPricePerDay,
          priceDisplay: directPriceDisplay,
        }),
      ]
      : []),
    mkRow({
      provider: 'SpotHero',
      type: 'marketplace',
      trust: 'high',
      notes: spotHeroEst != null ? 'Major marketplace (estimated)' : 'Major marketplace (estimated range)',
      link: spotHeroUrl,
      ctaLabel: 'Open marketplace',
      pricePerDay: spotHeroEst,
      priceDisplay: spotHeroEst != null ? 'estimated' : 'check-live',
    }),
  ];

  // Sort by lowest trusted total price: trust-adjusted then estimated total
  const trustMultiplier = (t: BookingTrust): number => (t === 'high' ? 1 : t === 'medium' ? 1.08 : 1.25);

  return [...rows].sort((a, b) => {
    const aTotal = a.estimatedTripTotal;
    const bTotal = b.estimatedTripTotal;

    // Push unknown prices to the bottom.
    if (aTotal == null && bTotal == null) return (a.trust === b.trust ? 0 : (a.trust === 'high' ? -1 : b.trust === 'high' ? 1 : a.trust === 'medium' ? -1 : 1));
    if (aTotal == null) return 1;
    if (bTotal == null) return -1;

    const aAdj = aTotal * trustMultiplier(a.trust);
    const bAdj = bTotal * trustMultiplier(b.trust);

    const diff = aAdj - bAdj;
    if (Math.abs(diff) < 5) {
      // tie-break: higher trust first
      const trustRank = (t: BookingTrust) => (t === 'high' ? 0 : t === 'medium' ? 1 : 2);
      return trustRank(a.trust) - trustRank(b.trust);
    }
    return diff;
  });
}

type TimingStatus = 'good' | 'tight' | 'too-late' | 'n/a';

function getAllowedSecurityLanes(selectedSecurity?: SecurityOption) {
  if (selectedSecurity === 'clear-precheck') {
    return ['standard', 'precheck', 'clear', 'clear-precheck'] as const;
  }

  if (selectedSecurity === 'precheck') {
    return ['standard', 'precheck'] as const;
  }

  if (selectedSecurity === 'clear') {
    return ['standard', 'clear'] as const;
  }

  return ['standard'] as const;
}

function computeAirportReadyBufferMinutes(
  tripData: TripDataWithExtras | TripData | null
): { bufferMinutes: number; assumptions: string[] } | null {
  if (!tripData || tripData.type !== 'one-way-departure') return null;

  const flightType = 'flightType' in tripData && tripData.flightType
    ? tripData.flightType
    : 'domestic';

  const checkingBags = 'checkingBags' in tripData
    ? !!tripData.checkingBags
    : false;

  const securityOption = 'securityOption' in tripData && tripData.securityOption
    ? tripData.securityOption
    : 'standard';

  const cabin = 'cabin' in tripData && tripData.cabin
    ? tripData.cabin
    : 'economy';

  let bufferMinutes =
    flightType === 'international'
      ? checkingBags
        ? 180
        : 150
      : checkingBags
        ? 105
        : 75;

  const assumptions: string[] = [];

  assumptions.push(
    flightType === 'international'
      ? 'International flight'
      : 'Domestic flight'
  );

  assumptions.push(
    checkingBags
      ? 'Checking bags: added airline counter/bag-drop time'
      : 'No checked bags'
  );

  if (securityOption === 'precheck') {
    bufferMinutes -= 15;
    assumptions.push('TSA PreCheck: reduced security buffer');
  } else if (securityOption === 'clear') {
    bufferMinutes -= 10;
    assumptions.push('CLEAR: reduced ID/security entry buffer');
  } else if (securityOption === 'clear-precheck') {
    bufferMinutes -= 25;
    assumptions.push('CLEAR + PreCheck: reduced security buffer');
  } else {
    assumptions.push('Standard TSA');
  }

  if (cabin === 'premium') {
    bufferMinutes -= checkingBags ? 10 : 5;
    assumptions.push('Premium/Business/First cabin: slightly faster check-in estimate');
  } else {
    assumptions.push('Economy cabin');
  }

  const minimum = flightType === 'international' ? 120 : 60;
  bufferMinutes = Math.max(minimum, bufferMinutes);

  assumptions.push(`Recommended airport-ready buffer: ${formatMinutes(bufferMinutes)}`);

  return {
    bufferMinutes,
    assumptions,
  };
}

function formatHHMMFromDate(d: Date): string {
  // Local time HH:MM
  return d.toTimeString().slice(0, 5);
}

function computeTimingStatus(args: {
  intent: string;
  tripData: TripData | null;
  optionTotalMinutes: number;
}): {
  status: TimingStatus;
  flightDeparts?: string;
  recommendedInsideArrivalBy?: string;
  optionTravelMinutes?: number;
  latestSafeLeaveTime?: string;
  shortByMinutes?: number;
  minutesUntilLeaveBy?: number;
  youReachTerminalAround?: string;
  assumptions?: string[];
  debug?: {
    departureDate: string;
    departureTime: string;
    departureLocal: string;
    recommendedInsideArrivalByLocal: string;
    latestSafeLeaveISO: string;
    latestSafeLeaveLocal: string;
    nowISO: string;
    nowLocal: string;
    cushionMinutes: number | null;
    isFutureDate: boolean;
  };
} {
  const { intent, tripData, optionTotalMinutes } = args;

  if (!tripData || intent !== 'flying-out' || tripData.type !== 'one-way-departure') {
    return { status: 'n/a' };
  }

  const buf = computeAirportReadyBufferMinutes(tripData);
  if (!buf) return { status: 'n/a' };

  const now = new Date();

  // Parse departure date/time. Start with what user provided.
  let depDt = buildLocalDateTime(tripData.departureDate, tripData.departureTime);

  const isAirportArrivalAnchor = tripData.timeAnchor === 'airport-arrival';

  const airportReadyBufferMinutes =
    isAirportArrivalAnchor ? 0 : buf.bufferMinutes;

  if (!depDt) {
    return {
      status: 'n/a',
      flightDeparts: undefined,
      recommendedInsideArrivalBy: undefined,
      latestSafeLeaveTime: undefined,
    };
  }

  const todayLocal = formatLocalYYYYMMDD(now);
  const isFutureDate = tripData.departureDate !== todayLocal;

  const computeCushionMinutes = (leaveDt: Date): number => {
    const diffMs = leaveDt.getTime() - now.getTime();
    return diffMs >= 0 ? Math.ceil(diffMs / 60000) : Math.floor(diffMs / 60000);
  };

  // For same-day flights, apply sanity check to catch parse errors (e.g., "23:30" late-night time incorrectly parsed as next day)
  if (!isFutureDate) {

    let recommendedInsideArrivalByDt = isAirportArrivalAnchor
      ? depDt
      : new Date(depDt.getTime() - airportReadyBufferMinutes * 60000);

    let latestSafeLeaveDt = new Date(
      recommendedInsideArrivalByDt.getTime() - optionTotalMinutes * 60000
    );
    let minutesUntilLeaveBy = computeCushionMinutes(latestSafeLeaveDt);

    // Sanity check: if cushion is absurdly large (>12 hours), likely a parse error
    if (minutesUntilLeaveBy > 12 * 60) {
      const depAlt = buildLocalDateTime(todayLocal, tripData.departureTime);
      if (depAlt && !isNaN(depAlt.getTime())) {
        const recommendedAlt = isAirportArrivalAnchor
          ? depAlt
          : new Date(depAlt.getTime() - airportReadyBufferMinutes * 60000);
        const leaveAlt = new Date(recommendedAlt.getTime() - optionTotalMinutes * 60000);
        const altCushion = computeCushionMinutes(leaveAlt);

        // Accept recovery only if cushion is plausible (within ±12 hours)
        if (Math.abs(altCushion) <= 12 * 60) {
          depDt = depAlt;
          recommendedInsideArrivalByDt = recommendedAlt;
          latestSafeLeaveDt = leaveAlt;
          minutesUntilLeaveBy = altCushion;
        }
      }
    }
  }

  // Now calculate final values (works for both same-day and future dates)
  const recommendedInsideArrivalByDt = isAirportArrivalAnchor
    ? depDt
    : new Date(depDt.getTime() - airportReadyBufferMinutes * 60000);
  const latestSafeLeaveDt = new Date(recommendedInsideArrivalByDt.getTime() - optionTotalMinutes * 60000);
  const minutesUntilLeaveBy = computeCushionMinutes(latestSafeLeaveDt);
  const missedBy = Math.max(0, Math.ceil((now.getTime() - latestSafeLeaveDt.getTime()) / 60000));

  const status: TimingStatus =
    missedBy > 0
      ? 'too-late'
      : minutesUntilLeaveBy <= 15
        ? 'tight'
        : 'good';

  const youReachTerminalAroundDt = new Date(now.getTime() + optionTotalMinutes * 60000);

  return {
    status,
    flightDeparts: isAirportArrivalAnchor ? undefined : tripData.departureTime,
    recommendedInsideArrivalBy: formatHHMMFromDate(recommendedInsideArrivalByDt),
    optionTravelMinutes: optionTotalMinutes,
    latestSafeLeaveTime: formatHHMMFromDate(latestSafeLeaveDt),
    shortByMinutes: missedBy > 0 ? missedBy : undefined,
    minutesUntilLeaveBy: missedBy === 0 ? Math.max(0, minutesUntilLeaveBy) : undefined,
    youReachTerminalAround: formatHHMMFromDate(youReachTerminalAroundDt),
    assumptions: isAirportArrivalAnchor
      ? [
        'Using your airport arrival/check-in time directly, so airport readiness buffer was skipped.',
        `Option travel time: ${formatMinutes(optionTotalMinutes)}`,
      ]
      : [
        ...buf.assumptions,
        `Option travel time: ${formatMinutes(optionTotalMinutes)}`,
      ],
    debug: {
      departureDate: tripData.departureDate,
      departureTime: tripData.departureTime,
      departureLocal: depDt.toString(),
      recommendedInsideArrivalByLocal: recommendedInsideArrivalByDt.toString(),
      latestSafeLeaveISO: latestSafeLeaveDt.toISOString(),
      latestSafeLeaveLocal: latestSafeLeaveDt.toString(),
      nowISO: now.toISOString(),
      nowLocal: now.toString(),
      cushionMinutes: missedBy > 0 ? null : Math.max(0, minutesUntilLeaveBy),
      isFutureDate,
    },
  };
}

function timingBadge(status: TimingStatus): { label: string; className: string } | null {
  if (status === 'n/a') return null;
  if (status === 'good') return { label: 'Good timing', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
  if (status === 'tight') return { label: 'Tight timing', className: 'bg-amber-50 text-amber-900 border-amber-200' };
  return { label: 'High risk timing', className: 'bg-red-50 text-red-800 border-red-200' };
}

function leaveByCushionText(minutesUntilLeaveBy: number | null | undefined): string {
  if (typeof minutesUntilLeaveBy !== 'number') return '';

  // If leave-by is many hours away, don't call it a "buffer".
  // This usually means a future-date trip, not extra airport cushion.
  if (minutesUntilLeaveBy > 12 * 60) return '';

  return ` · ${formatMinutes(minutesUntilLeaveBy)} buffer`;
}

function formatTag(tag: string): string {
  const map: Record<string, string> = {
    'apr-tracking': 'Airport Parking Reservations',
    'parkwhiz': 'ParkWhiz',
    'spothero': 'SpotHero',
    'way': 'Way.com',
  };

  if (map[tag.toLowerCase()]) {
    return map[tag.toLowerCase()];
  }

  // Default: capitalize first letter only
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

function getAirportReadyBufferForTiming(params: {
  timeAnchor?: 'flight-departure' | 'airport-arrival';
  airportReadinessBufferMinutes?: number | null;
  fallbackMinutes?: number;
}) {
  if (params.timeAnchor === 'airport-arrival') return 0;

  return (
    params.airportReadinessBufferMinutes ??
    params.fallbackMinutes ??
    75
  );
}

function OptionCard({
  compact = false,
  item,
  rank,
  tripData,
  intent,
  sort,
  aprLivePrices,
  aprLiveChecking,
  onShowReviews,
  googleEnrichedParking,
}: {
  compact?: boolean;
  item: RankedRecommendation;
  rank: number;
  tripData: TripData | null;
  intent: string;
  sort: SortTab;
  aprLivePrices: Record<string, number>;
  aprLiveChecking: boolean;
  onShowReviews?: (parking: ParkingOption) => void;
  googleEnrichedParking?: Record<string, ParkingOption>;
}) {
  const opt =
    item.type === 'parking'
      ? (withAprLivePrice(item.option as AppOption, aprLivePrices) as AppOption)
      : (item.option as AppOption);

  const isAprFetching =
    aprLiveChecking &&
    item.type === 'parking' &&
    isAprOption(opt);

  const airportCode = getTripAirportCode(tripData);
  const airport = getAirportById(airportCode) || getAirportById('SEA')!;
  const safeParkingSearchQuery = `${airport.label} ${airport.id} airport parking`;

  const trust = confidenceFromTrust((opt.trustStatus || 'estimated') as TrustStatus);
  const rideshareConfidence =
    item.type === 'rideshare'
      ? rideshareConfidenceMeta(opt.rideshareEstimateConfidence)
      : null;

  const sourceLink =
    item.type === 'parking'
      ? trustedParkingBookingLink(opt)
      : opt.sourceLink || null;

  const displayParkingOption =
    item.type === 'parking'
      ? (googleEnrichedParking?.[opt.id || ''] || opt) as ParkingOption
      : null;

  const parkingRoutes =
    displayParkingOption
      ? parkingRouteLinks(displayParkingOption, tripData)
      : null;

  const routeUnavailable =
    item.type === 'parking' &&
    (isParkingRouteUnavailable(opt as ParkingOption) || !tripData?.origin);

  const parkingLotRouteLink = routeUnavailable ? null : parkingRoutes?.routeToParkingUrl || null;
  const parkingToTerminalRouteLink = routeUnavailable ? null : parkingRoutes?.parkingToAirportUrl || null;

  const routeLink =
    item.type === 'parking'
      ? parkingLotRouteLink
      : routeUrlForOption(opt, tripData?.origin || null);

  const displayPrice =
    item.type === 'parking' && typeof opt.price === 'number'
      ? opt.price
      : item.cost;

  const price = optionPriceSummary(
    isAprOption(opt)
      ? {
        ...opt,
        priceDisplay: 'from-per-day' as const,
        priceUnit: 'per-day' as const,
      }
      : opt,
    displayPrice,
    tripData
  );

  const isCheckingAprPrice = false;

  const visiblePrice = isCheckingAprPrice
    ? {
      ...price,
      secondary: price.secondary
        ? `${price.secondary} · Fetching APR listed price`
        : 'Fetching APR listed price',
    }
    : price;

  const normalizedParkingOption =
    item.type === 'parking'
      ? ({
        ...(opt as ParkingOption),
        price: typeof opt.price === 'number' && opt.price > 0 ? opt.price : 0,
        priceDisplay: opt.priceDisplay,
        priceUnit: opt.priceUnit,
      } satisfies ParkingOption)
      : null;

  const parkingBreakdown =
    item.type === 'parking'
      ? parkingTimeBreakdown(opt as ParkingOption)
      : null;

  const parkingPrice =
    item.type === 'parking' && normalizedParkingOption
      ? parkingPriceLine(normalizedParkingOption, tripData)
      : null;

  const parkingDailyText =
    item.type === 'parking' && parkingPrice?.secondary
      ? parkingPrice.secondary
      : null;

  const timing = computeTimingStatus({
    intent,
    tripData,
    optionTotalMinutes: item.duration,
  });
  const timingMeta = routeUnavailable ? null : timingBadge(timing.status);

  const timingSummary = (() => {
    if (routeUnavailable) return null;
    if (timing.status === 'n/a' || !timing.latestSafeLeaveTime || !timing.youReachTerminalAround) return null;

    const leaveBy = formatTimeFriendly(timing.latestSafeLeaveTime);
    const reach = formatTimeFriendly(timing.youReachTerminalAround);

    if (timing.status === 'good') {
      const mins = typeof timing.minutesUntilLeaveBy === 'number' ? timing.minutesUntilLeaveBy : null;
      return `Leave by ${leaveBy} · reach terminal around ${reach}${leaveByCushionText(mins)}`;
    }

    if (timing.status === 'tight') {
      const mins = typeof timing.minutesUntilLeaveBy === 'number' ? timing.minutesUntilLeaveBy : null;
      return `Leave by ${leaveBy} · reach terminal around ${reach}${leaveByCushionText(mins)}`;
    }

    // too-late
    const shortBy = typeof timing.shortByMinutes === 'number' ? timing.shortByMinutes : null;
    return shortBy != null
      ? `High risk timing — needed to leave by ${leaveBy} to reach terminal around ${reach} (short by ${shortBy} min)`
      : `High risk timing — needed to leave by ${leaveBy} to reach terminal around ${reach}`;
  })();

  const shortByMinutes = timing.status === 'too-late' && typeof timing.shortByMinutes === 'number'
    ? timing.shortByMinutes
    : null;

  const nonParkingPrice =
    item.type === 'rideshare'
      ? ridesharePricePrimary(opt) || visiblePrice.primary
      : typeof opt.price === 'number' && opt.price > 0
        ? `${opt.priceDisplay === 'estimated' ? 'Est. ' : ''}${formatMoney(opt.price)}`
        : visiblePrice.primary;

  return (
    <div
      id={`option-${item.type}-${String(opt?.id || rank)}`}
      className={
        'rounded-3xl border bg-white/95 p-4 shadow-sm shadow-sky-900/5 transition hover:border-sky-200 sm:p-5 ' +
        (!routeUnavailable && timing.status === 'too-late' ? 'border-red-200' : 'border-zinc-200')
      }
    >
      {item.type === 'parking' && displayParkingOption && (
        <div className="mb-4">
          <ParkingLotVisual option={displayParkingOption} />
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold leading-tight text-slate-950 sm:text-lg">{opt.name}</div>

            {!compact && (
              <div className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                {typeLabel(item.type)}
              </div>
            )}
            {rank === 1 &&
              sort === 'easiest' &&
              timing.status !== 'too-late' &&
              item.type !== 'parking' && (
                <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                  Recommended
                </div>
              )}
          </div>

          <div className="mt-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-lg font-bold text-zinc-900">
                {isAprFetching && item.type === 'parking'
                  ? parkingPrice?.primary || 'Updating provider price…'
                  : item.type === 'parking'
                    ? parkingPrice?.primary
                    : nonParkingPrice}
              </span>

              {parkingDailyText && (
                <span className="block text-sm font-medium text-zinc-600">
                  {parkingDailyText}
                </span>
              )}

              {item.type !== 'parking' && (
                <span className="text-sm text-zinc-600">
                  · {formatMinutes(item.duration)}
                </span>
              )}
            </div>

            {item.type === 'rideshare' && (
              <p className="mt-1 text-xs text-zinc-600">
                {opt.priceNote || RIDESHARE_ESTIMATE_DISCLAIMER}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {item.type !== 'rideshare' && (
                <div className={"rounded-full border px-2.5 py-1 text-xs font-medium " + trust.className}>
                  {trust.label}
                </div>
              )}

              {rideshareConfidence && (
                <div className={"rounded-full border px-2.5 py-1 text-xs font-medium " + rideshareConfidence.className}>
                  {rideshareConfidence.label}
                </div>
              )}

              {timingMeta && (
                <div className={"rounded-full border px-2.5 py-1 text-xs font-medium " + timingMeta.className}>
                  {timingMeta.label}
                </div>
              )}

              {price.badge && !((opt.bestFor || []) as string[]).includes(price.badge) && (
                <div className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
                  {price.badge}
                </div>
              )}

              {item.type === 'parking' && (() => {
                const freshness = resolveParkingFreshness(opt as ParkingOption);
                const title = [
                  freshness.providerSource ? `Source: ${freshness.providerSource}` : null,
                  freshness.fetchedAt ? `Fetched: ${freshness.fetchedAt}` : null,
                ].filter(Boolean).join(' · ') || undefined;

                return (
                  <div
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${freshness.className}`}
                    title={title}
                  >
                    {freshness.label}
                  </div>
                );
              })()}

              {item.type === 'parking' &&
                Array.isArray(opt.bestFor) &&
                Array.from(new Set(opt.bestFor as string[])).slice(0, 2).map((tag: string) => (
                  <div
                    key={tag}
                    className={
                      'rounded-full border px-2.5 py-1 text-xs font-medium ' +
                      (tag === 'Great Deal' || tag === 'Cheapest'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : tag === 'Live Price' || tag === 'Selected-date price' || tag === 'APR listed price'
                          ? 'border-blue-200 bg-blue-50 text-blue-800'
                          : 'border-zinc-200 bg-white text-zinc-700')
                    }
                  >
                    {formatTag(tag)}
                  </div>
                ))}

              {aprLiveChecking &&
                item.type === 'parking' &&
                isAprOption(opt) &&
                isAprFetching &&
                getAprLivePrice(opt, aprLivePrices) == null && <InlinePriceLoading />}

              {item.type === "parking" ? (() => {
                const parking = (googleEnrichedParking?.[opt.id || ""] || opt) as ParkingOption;

                return (
                  <button
                    type="button"
                    onClick={() => onShowReviews?.(parking)}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                    title="See Google review details"
                  >
                    {typeof parking.reviewScore === "number" ? (
                      <>
                        <span>⭐ {parking.reviewScore.toFixed(1)}</span>
                        {typeof parking.reviewCount === "number" ? (
                          <span className="text-amber-700/70">
                            ({parking.reviewCount.toLocaleString()} reviews)
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span>⭐ Check reviews</span>
                    )}
                  </button>
                );
              })() : null}
            </div>
          </div>

          {item.type === 'parking' && routeUnavailable && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
              Route unavailable from this origin to this parking lot. Try a local origin near the airport, rideshare, or another transportation option.
            </div>
          )}

          {item.type === 'parking' && (
            <ParkingTimeSummary
              option={opt as ParkingOption}
              compact={compact}
              routeUnavailable={routeUnavailable}
            />
          )}

          {item.type === 'parking' && (() => {
            const parkingOption = opt as ParkingOption;

            if (!parkingOption.recommendedCheckpoint) return null;

            return (
              <div className="mt-2 text-xs text-zinc-600">
                Airport route:{' '}
                <span className="font-medium text-zinc-800">
                  {parkingOption.recommendedCheckpoint.name}
                </span>
                {' '}· {parkingOption.recommendedCheckpoint.minutes}m TSA
                {parkingOption.checkpointWalkMinutes
                  ? ` · ${parkingOption.checkpointWalkMinutes}m inside walk`
                  : ''}
              </div>
            );
          })()}

          {timingSummary && !compact && (
            <div className={
              'mt-2 text-xs ' +
              (timing.status === 'too-late' ? 'text-red-800' : timing.status === 'tight' ? 'text-amber-900' : 'text-emerald-800')
            }>
              {timingSummary}
            </div>
          )}

          {!routeUnavailable && timing.status === 'too-late' && timing.recommendedInsideArrivalBy && timing.youReachTerminalAround && shortByMinutes != null && (
            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <div className="font-medium">Likely misses recommended airport arrival window.</div>
              <div className="mt-2 space-y-1 text-sm">
                <div><span className="font-medium">Recommended inside-airport arrival by:</span> {formatTimeFriendly(timing.recommendedInsideArrivalBy)}</div>
                <div><span className="font-medium">You reach terminal around:</span> {formatTimeFriendly(timing.youReachTerminalAround)}</div>
                <div><span className="font-medium">Missed safe leave time by:</span> {formatMinutes(shortByMinutes)}</div>
              </div>
            </div>
          )}

          {!compact && (
            <div className="mt-4">
              <div className="text-sm font-medium text-zinc-900">Why this option</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                {item.reasons.slice(0, 3).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* {item.type === 'parking' && !compact && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium text-zinc-900">Compare booking sources</div>
                <div className="text-xs text-zinc-500">Known/baseline prices are labeled; confirm final rate before booking.</div>
              </div>

              {(() => {
                const rows = buildBookingSourceRows(opt, tripData);
                const days = estimateParkingDays(tripData);

                return (
                  <div className="mt-3 space-y-3">
                    {rows.map((r) => {
                      const priceCell =
                        r.pricePerDay == null
                          ? 'Check live'
                          : r.priceDisplay === 'live'
                            ? `Live ${formatMoneyCents(r.pricePerDay)}/day`
                            : `Est. ${formatMoney(r.pricePerDay)}/day`;

                      const buttonLabel =
                        r.ctaLabel === 'Check live' ? 'Check live price' : r.ctaLabel;

                      return (
                        <div
                          key={r.provider}
                          className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="text-sm font-medium text-zinc-900">
                                {r.provider}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700">
                                  {r.type}
                                </span>

                                <span
                                  className={
                                    'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' +
                                    r.trustClassName
                                  }
                                >
                                  {r.trustLabel}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col items-start gap-3 sm:items-end">
                              <div className="text-sm font-semibold text-zinc-900">
                                {priceCell}
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  copyTextThenOpen(
                                    opt.searchQuery || safeParkingSearchQuery,
                                    r.link
                                  )
                                }
                                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:w-auto"
                              >
                                {buttonLabel}
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 space-y-2 text-xs text-zinc-700">
                            <div>{r.notes}</div>

                            {r.estimatedTripTotal != null && (
                              <div>
                                <span className="font-medium">Trip total:</span>{' '}
                                {formatMoneyCents(r.estimatedTripTotal)} for {days} day(s)
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )} */}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 md:w-auto md:min-w-40 md:items-stretch">
          {compact ? (
            <div className="flex flex-col gap-2">
              {!routeUnavailable && sourceLink && (
                <button
                  type="button"
                  onClick={() =>
                    item.type === 'parking'
                      ? copyTextThenOpen(opt.searchQuery || safeParkingSearchQuery, sourceLink)
                      : window.open(sourceLink, '_blank', 'noopener,noreferrer')
                  }
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700"
                >
                  {item.type === 'parking'
                    ? opt.bookingProvider === 'AirportParkingReservations' || opt.sourceName === 'AirportParkingReservations'
                      ? 'View deal'
                      : opt.type === 'official'
                        ? 'Book official'
                        : 'Check price'
                    : item.type === 'rideshare' &&
                      (opt.id === 'taxi' || String(opt.name || '').toLowerCase().includes('taxi'))
                      ? 'Find taxi'
                      : item.type === 'rideshare'
                        ? 'Open app'
                        : 'View'}
                </button>
              )}

              {item.type === 'parking' && !routeUnavailable && parkingLotRouteLink && (
                <a
                  href={parkingLotRouteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Route to parking
                </a>
              )}

              {item.type === 'parking' && parkingToTerminalRouteLink && (
                <a
                  href={parkingToTerminalRouteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Parking to terminal
                </a>
              )}

              {routeUnavailable && (
                <div className="max-w-56 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  Route unavailable for this origin/date. Try a different origin or transportation option.
                </div>
              )}
            </div>
          ) : (
            <>
              {!routeUnavailable && sourceLink && item.type === 'parking' ? (
                <button
                  type="button"
                  onClick={() =>
                    copyTextThenOpen(opt.searchQuery || safeParkingSearchQuery, sourceLink)
                  }
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700"
                >
                  {opt.bookingProvider === 'AirportParkingReservations' || opt.sourceName === 'AirportParkingReservations'
                    ? 'View deal'
                    : opt.type === 'official'
                      ? 'Book official'
                      : 'Check price'}
                </button>
              ) : sourceLink && !routeUnavailable ? (
                <a
                  href={sourceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700"
                >
                  {item.type === 'rideshare' &&
                    (opt.id === 'taxi' || String(opt.name || '').toLowerCase().includes('taxi'))
                    ? 'Find taxi'
                    : item.type === 'rideshare'
                      ? 'Open app'
                      : 'View / Book'}
                </a>
              ) : null}

              {item.type === 'parking' && parkingLotRouteLink && (
                <a
                  href={parkingLotRouteLink}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Route to parking
                </a>
              )}

              {item.type === 'parking' && parkingToTerminalRouteLink && (
                <a
                  href={parkingToTerminalRouteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  Parking to terminal
                </a>
              )}

              {routeUnavailable && (
                <div className="max-w-56 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  Route unavailable for this origin/date. Try a different origin or transportation option.
                </div>
              )}

              {item.type !== 'parking' && routeLink && (
                <a
                  href={routeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
                >
                  View route
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {!compact && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:text-blue-800">Details & evidence</summary>
          <div className="mt-3 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700">
            {!routeUnavailable && timing.status !== 'n/a' && timing.flightDeparts && timing.recommendedInsideArrivalBy && timing.latestSafeLeaveTime && typeof timing.optionTravelMinutes === 'number' && (
              <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-3">
                <div className="text-sm font-medium text-zinc-900">Flight timing check</div>
                <div className="mt-2 space-y-1 text-sm text-zinc-700">
                  <div>Flight departs: {formatTimeFriendly(timing.flightDeparts)}</div>
                  <div>Recommended inside-airport arrival by: {formatTimeFriendly(timing.recommendedInsideArrivalBy)}</div>
                  <div>Option travel time: {formatMinutes(timing.optionTravelMinutes)}</div>
                  <div>Latest safe leave time: {formatTimeFriendly(timing.latestSafeLeaveTime)}</div>
                  {typeof timing.shortByMinutes === 'number' ? (
                    <div>Missed by: {timing.shortByMinutes} min</div>
                  ) : null}
                </div>
                {Array.isArray(timing.assumptions) && timing.assumptions.length > 0 && (
                  <>
                    <div className="mt-3 text-sm font-medium text-zinc-900">Buffer assumptions</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                      {timing.assumptions.slice(0, 6).map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {item.type === 'parking' && !compact && !routeUnavailable && parkingBreakdown && (
              <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-900">Time breakdown</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      From your origin to being inside the airport terminal.
                    </div>
                  </div>

                  <div className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                    {formatMinutes(parkingBreakdown.totalMinutes)}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {parkingBreakdown.parts.map((part) => (
                    <div
                      key={`${part.label}-${part.minutes}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="text-zinc-700">{part.label}</div>
                      <div className="font-medium text-zinc-900">
                        {formatMinutes(part.minutes)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 border-t border-zinc-100 pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-semibold text-zinc-900">Total to terminal</div>
                    <div className="font-semibold text-zinc-900">
                      {formatMinutes(parkingBreakdown.totalMinutes)}
                    </div>
                  </div>

                  {opt.transferType === 'shuttle' && (
                    <div className="mt-2 text-xs leading-relaxed text-zinc-500">
                      Includes estimated shuttle wait time and a small reliability buffer. Confirm shuttle frequency with the lot before booking.
                    </div>
                  )}
                </div>
              </div>
            )}
            <div><span className="font-medium">Source:</span> {opt.sourceName}</div>
            {opt.lastUpdated && (
              <div className="mt-1"><span className="font-medium">Updated:</span> {new Date(opt.lastUpdated).toLocaleString()}</div>
            )}
            {Array.isArray(opt.assumptions) && opt.assumptions.length > 0 && (
              <>
                <div className="mt-3 font-medium">Assumptions</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {opt.assumptions.slice(0, 6).map((a: string) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function normalizeParkingBrandName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(seattle|seatac|sea|airport|parking|lot|self|uncovered|covered|garage|rooftop|valet|hotel|inn|at|by)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBrandKey(name: string): string {
  const words = normalizeParkingBrandName(name)
    .split(' ')
    .filter((word) => word.length >= 3);

  if (words.length === 0) return '';

  return words.slice(0, 2).join(' ');
}

function isOfficialLikeParking(option: ParkingOption): boolean {
  const name = String(option.name || '').toLowerCase();

  return (
    option.type === 'official' ||
    name.includes('international airport') ||
    name.includes('airport parking garage') ||
    name.includes('terminal parking') ||
    name.includes('over-height') ||
    name.includes('oversize parking')
  );
}

function canonicalizeParkingOptions(options: ParkingOption[]): ParkingOption[] {
  const seenBrands = new Set<string>();
  let officialSeen = false;

  return options.filter((option) => {
    if (isOfficialLikeParking(option)) {
      if (officialSeen) return false;
      officialSeen = true;
      return true;
    }

    const brand = extractBrandKey(option.name);

    if (!brand) return true;
    if (seenBrands.has(brand)) return false;

    seenBrands.add(brand);
    return true;
  });
}

function normalizeParkingNameForDedupe(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(seattle|seatac|sea|airport|parking|lot|self|uncovered|covered|garage|rooftop)\b/g, '')
    .replace(/\bby\s+/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parkingProviderPriority(option: AppOption): number {
  const provider = `${option.bookingProvider || ''} ${option.sourceName || ''}`.toLowerCase();

  if (provider.includes('parkwhiz')) return 1;
  if (provider.includes('airportparkingreservations')) return 2;
  if (provider.includes('official')) return 3;

  return 4;
}

function getParkingComparableTotal(option: AppOption, tripData: TripData | null): number | null {
  if (typeof option.price !== 'number' || option.price <= 0) return null;

  const days = Math.max(1, estimateParkingDays(tripData));

  if (option.priceUnit === 'total') {
    return option.price;
  }

  if (option.priceUnit === 'per-day') {
    return Math.round(option.price * days * 100) / 100;
  }

  const provider = `${option.bookingProvider || ''} ${option.sourceName || ''}`.toLowerCase();

  if (provider.includes('parkwhiz')) {
    return option.price;
  }

  if (provider.includes('airportparkingreservations')) {
    return Math.round(option.price * days * 100) / 100;
  }

  return Math.round(option.price * days * 100) / 100;
}

function mergeRankedParkingRouteStatus(
  primary: RankedRecommendation,
  secondary: RankedRecommendation
): RankedRecommendation {
  if (primary.type !== 'parking' || secondary.type !== 'parking') return primary;

  const mergedOption = mergeParkingRouteStatus(
    primary.option as ParkingOption,
    secondary.option as ParkingOption
  ) as ParkingOption;

  if (!isParkingRouteUnavailable(mergedOption)) {
    return {
      ...primary,
      option: mergedOption,
    };
  }

  return {
    ...primary,
    option: mergedOption,
    cost: 999999,
    duration: 999999,
    reasons: [parkingRouteUnavailableReason(mergedOption)],
  };
}

function dedupeParkingRankedOptions(
  options: RankedRecommendation[],
  tripData: TripData | null
): RankedRecommendation[] {
  const byKey = new Map<string, RankedRecommendation>();

  for (const item of options) {
    const option = item.option as AppOption;

    const key =
      normalizeParkingNameForDedupe(option.name || '') ||
      parkingKeySafe(option) ||
      option.id ||
      option.name;

    const current = byKey.get(key);

    if (!current) {
      byKey.set(key, {
        ...item,
        option: withStableParkingRouteStatus(item.option as ParkingOption),
      });
      continue;
    }

    const currentOption = current.option as AppOption;

    const currentTotal = getParkingComparableTotal(currentOption, tripData);
    const nextTotal = getParkingComparableTotal(option, tripData);

    let winner = current;

    if (currentTotal == null && nextTotal != null) {
      winner = item;
    } else if (currentTotal != null && nextTotal != null) {
      if (nextTotal < currentTotal) {
        winner = item;
      } else if (Math.abs(nextTotal - currentTotal) < 0.01) {
        const currentPriority = parkingProviderPriority(currentOption);
        const nextPriority = parkingProviderPriority(option);

        if (nextPriority < currentPriority) {
          winner = item;
        }
      }
    }

    byKey.set(
      key,
      winner === current
        ? mergeRankedParkingRouteStatus(current, item)
        : mergeRankedParkingRouteStatus(item, current)
    );
  }

  return Array.from(byKey.values());
}

function ProviderDropdownSection({
  title,
  subtitle,
  items,
  defaultOpen = false,
  transitPayment,
  footerContent,
}: {
  title: string;
  subtitle: string;
  items: ProviderLinkItem[];
  defaultOpen?: boolean;
  transitPayment?: TransitPaymentOption;
  footerContent?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  if ((!items || items.length === 0) && !footerContent) return null;

  return (
    <details
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
      className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300"
    >
      <summary className="cursor-pointer list-none border-b border-zinc-200 bg-zinc-50 px-5 py-4 marker:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-zinc-900">
                {title}
              </h3>

              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold uppercase text-blue-700">
                Compare options
              </span>
            </div>

            <p className="mt-1 text-sm text-zinc-600">
              {subtitle}
            </p>
          </div>

          <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs font-semibold text-zinc-500 transition group-open:rotate-180">
            ▼
          </span>
        </div>
      </summary>

      <PricingLinksSection
        title={title}
        items={items}
        transitPayment={transitPayment}
      />
      {footerContent}
    </details>
  );
}

function formatPlannedAirportArrival(value?: string): string | null {
  if (!value) return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );

  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function TsaWaitTimesCard({
  tsaEstimate,
  airportCode,
  selectedSecurityOption,
}: {
  tsaEstimate: Recommendation['tsaEstimate'];
  airportCode?: string;
  selectedSecurityOption?: SecurityOption;
}) {
  const waitTimes = tsaEstimate.waitTimes;

  const selectedLane =
    selectedSecurityOption ?? tsaEstimate.selectedLane ?? 'standard';

  const airportSecurity = getAirportSecurityEstimate(
    airportCode || 'SEA',
    selectedLane as SecurityOption
  );

  const isSea = (airportCode || 'SEA').toUpperCase() === 'SEA';
  const plannedArrivalLabel = formatPlannedAirportArrival(
    tsaEstimate.plannedAirportArrivalAt
  );
  const timingBasisText = plannedArrivalLabel
    ? `Estimated for your planned airport arrival: ${plannedArrivalLabel}`
    : tsaEstimate.timingBasis === 'current-live'
      ? 'Live TSA is current only.'
      : 'Future TSA/security timing is estimated.';
  const currentOnlyText = tsaEstimate.liveDataIsCurrentOnly
    ? 'Live TSA is current only; future wait is estimated.'
    : null;

  const laneLabels: Record<string, string> = {
    standard: 'Standard',
    precheck: 'PreCheck',
    clear: 'CLEAR',
    'clear-precheck': 'CLEAR + PreCheck',
  };

  if (!waitTimes) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
        <div className="inline-flex items-center gap-2">
          <span className="font-semibold text-zinc-900">
            {airportSecurity.label}
          </span>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-800">
            {tsaEstimate.waitTime}m
          </span>
          <span className="text-zinc-500">{tsaEstimate.sourceName}</span>
        </div>
        <div className="mt-2 text-zinc-500">
          {timingBasisText}
          {currentOnlyText ? ` ${currentOnlyText}` : ''}
        </div>
      </div>
    );
  }

  const selectedLabel = laneLabels[selectedLane] ?? 'Standard';

  const allowedLaneKeys =
    selectedLane === 'clear-precheck'
      ? ['standard', 'precheck', 'clear', 'clear-precheck']
      : selectedLane === 'precheck'
        ? ['standard', 'precheck']
        : selectedLane === 'clear'
          ? ['standard', 'clear']
          : ['standard'];

  const allLanes = [
    { key: 'standard', label: 'Standard', minutes: waitTimes.standard },
    { key: 'precheck', label: 'PreCheck', minutes: waitTimes.precheck },
    { key: 'clear', label: 'CLEAR', minutes: waitTimes.clear },
    {
      key: 'clear-precheck',
      label: 'CLEAR + PreCheck',
      minutes: waitTimes.clearPrecheck,
    },
  ].filter((lane) => typeof lane.minutes === 'number');

  const eligibleLanes = allLanes.filter((lane) =>
    allowedLaneKeys.includes(lane.key)
  );

  const selectedLaneData =
    eligibleLanes.find((lane) => lane.key === selectedLane) ??
    eligibleLanes.find((lane) => lane.key === 'standard') ??
    null;

  const fastestLane =
    eligibleLanes.length > 0
      ? [...eligibleLanes].sort((a, b) => {
        if (a.minutes !== b.minutes) return a.minutes - b.minutes;

        const priority: Record<string, number> = {
          [selectedLane]: 0,
          'clear-precheck': 1,
          precheck: 2,
          clear: 3,
          standard: 4,
        };

        return (priority[a.key] ?? 99) - (priority[b.key] ?? 99);
      })[0]
      : null;

  const otherLanes = eligibleLanes.filter(
    (lane) => lane.key !== selectedLane && lane.key !== fastestLane?.key
  );

  if (!isSea) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-zinc-900">
            {airportSecurity.label}
          </span>

          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 ring-1 ring-zinc-200">
            Selected {airportSecurity.selectedLineLabel}: {airportSecurity.selectedMinutes}m
          </span>

          {airportSecurity.fastestLineLabel !== airportSecurity.selectedLineLabel && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-200">
              Fastest {airportSecurity.fastestLineLabel}: {airportSecurity.fastestMinutes}m
            </span>
          )}

          <span className="text-xs text-zinc-400">
            {airportSecurity.isLive ? 'live' : 'est.'}
          </span>
        </div>

        <div className="mt-2 text-xs text-zinc-500">
          {timingBasisText}
          {currentOnlyText ? ` ${currentOnlyText}` : ` ${airportSecurity.note}`}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-zinc-900">
          {airportSecurity.label}
        </span>

        {selectedLaneData && (
          <span
            className={
              fastestLane?.key === selectedLaneData.key
                ? 'rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-200'
                : 'rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 ring-1 ring-zinc-200'
            }
          >
            Selected {selectedLabel}: {selectedLaneData.minutes}m
          </span>
        )}

        {fastestLane && fastestLane.key !== selectedLane && (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-200">
            Fastest {fastestLane.label}: {fastestLane.minutes}m
          </span>
        )}

        <span className="text-xs text-zinc-400">
          {tsaEstimate.trustStatus === 'live' ? 'live' : 'est.'}
        </span>
      </div>

      {otherLanes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-zinc-600">
          {otherLanes.map((lane) => (
            <span
              key={lane.key}
              className="rounded-full bg-white px-2.5 py-1 ring-1 ring-zinc-200"
            >
              {lane.label}: {lane.minutes}m
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 text-xs text-zinc-500">
        {airportCode?.toUpperCase() === 'SEA' && tsaEstimate.bestCheckpoint ? (
          <>
            For selected {selectedLabel}:{' '}
            <span className="font-medium text-zinc-700">
              use {tsaEstimate.bestCheckpoint.name}
            </span>{' '}
            · {tsaEstimate.bestCheckpoint.minutes}m
          </>
        ) : (
          <span>{airportSecurity.note}</span>
        )}
      </div>

      <div className="mt-2 text-xs text-zinc-500">
        {timingBasisText}
        {currentOnlyText ? ` ${currentOnlyText}` : ''}
      </div>
    </div>
  );
}

function securitySummaryLabel(
  airportCode: string,
  securityOption?: SecurityOption
): string {
  const code = airportCode.toUpperCase();

  if (code !== 'SEA') {
    if (securityOption === 'precheck') return 'PreCheck if available';
    if (securityOption === 'clear') return 'Expedited if available';
    if (securityOption === 'clear-precheck') return 'Expedited if available';
    return 'Standard screening';
  }

  if (securityOption === 'precheck') return 'TSA PreCheck';
  if (securityOption === 'clear') return 'CLEAR';
  if (securityOption === 'clear-precheck') return 'CLEAR + PreCheck';
  return 'TSA';
}

type ResultsContentProps = {
  storedSearchParams?: string;
};

type RecommendationRequestRef = {
  key: string;
  controller: AbortController;
  inFlight: boolean;
};

const GOOGLE_PLACE_MATCH_CONCURRENCY = 2;
const COLLAPSED_PARKING_DISPLAY_COUNT = 6;
const PARKING_SHOW_MORE_INCREMENT = 10;
const MAX_GOOGLE_PLACE_MATCH_LIMIT = 20;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function debugRequestId(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function logRecommendationsFetch(
  event: 'start' | 'abort' | 'success' | 'fail' | 'finally',
  requestKey: string,
  details: Record<string, unknown> = {}
) {
  if (process.env.NODE_ENV !== 'development') return;

  console.debug(`recommendations fetch ${event}`, {
    id: debugRequestId(requestKey),
    ...details,
  });
}

export default function ResultsContent({ storedSearchParams }: ResultsContentProps = {}) {
  const router = useRouter();
  const routeSearchParams = useSearchParams();
  const routeSearchParamsString = routeSearchParams.toString();
  const searchParams = useMemo(() => {
    const params = new URLSearchParams(storedSearchParams || routeSearchParamsString);

    if (storedSearchParams) {
      const routeParams = new URLSearchParams(routeSearchParamsString);
      routeParams.forEach((value, key) => {
        params.set(key, value);
      });
    }

    return params;
  }, [routeSearchParamsString, storedSearchParams]);
  const searchParamsString = useMemo(() => searchParams.toString(), [searchParams]);

  const [reviewsParking, setReviewsParking] = useState<ParkingOption | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [rankedOptions, setRankedOptions] = useState<RankedRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [invalidTripMessage, setInvalidTripMessage] = useState<string | null>(null);
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [googleEnrichedParking, setGoogleEnrichedParking] = useState<Record<string, ParkingOption>>({});
  const [parkingPricesChecking, setParkingPricesChecking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingData, setEditingData] = useState<TripData | null>(null);
  const editTripRef = useRef<HTMLDivElement | null>(null);
  const [editTripJustOpened, setEditTripJustOpened] = useState(false);
  const [showTooLate, setShowTooLate] = useState(false);
  const [visibleParkingCount, setVisibleParkingCount] = useState(COLLAPSED_PARKING_DISPLAY_COUNT);
  const [matchedParkingPrices, setMatchedParkingPrices] = useState<Record<string, {
    price: number;
    priceUnit?: PriceUnit;
    provider?: string;
    sourceLink?: string;
  }>>({});
  const [aprLivePrices, setAprLivePrices] = useState<Record<string, number>>({});
  const [aprLiveChecking, setAprLiveChecking] = useState(false);
  const [aprLivePartial, setAprLivePartial] = useState(false);
  const [parkingWeather, setParkingWeather] = useState<ParkingWeatherItem[]>([]);
  const [selectedParkingId, setSelectedParkingId] = useState<string | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showAirportGuideModal, setShowAirportGuideModal] = useState(false);
  const [openProviderSection, setOpenProviderSection] = useState<'ride' | 'transit' | null>(null);
  const [showParkRideReason, setShowParkRideReason] = useState(false);

  const aprFetchIdRef = useRef(0);
  const aprRequestKeyRef = useRef('');
  const priceMatchKeyRef = useRef('');
  const googlePlaceAttemptedKeysRef = useRef(new Set<string>());
  const googlePlaceInFlightKeysRef = useRef(new Map<string, Promise<ParkingOption>>());
  const recommendationsRequestRef = useRef<RecommendationRequestRef | null>(null);
  const recommendationsLoadedKeyRef = useRef('');
  const liveRefreshInFlightKeyRef = useRef('');
  const liveRefreshLoadedKeyRef = useRef('');

  function parkingGoogleMatchKey(parking: ParkingOption, airportCode: string | null): string {
    const normalize = (value: string | null | undefined) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return [
      String(airportCode || 'UNKNOWN').toUpperCase(),
      `name:${normalize(parking.name)}`,
      `addr:${normalize(parking.address || parking.normalizedAddress || parking.routeDestination)}`,
      `provider:${normalize(parking.bookingProvider)}`,
      `source:${normalize(parking.sourceName)}`,
    ].join('|');
  }

  function mergeGoogleEnrichedParkingOption(
    base: ParkingOption,
    enriched: ParkingOption
  ): ParkingOption {
    const merged = mergeParkingRouteStatus(base, enriched) as ParkingOption;
    const imageUrl = enriched.imageUrl ?? enriched.images?.[0] ?? base.imageUrl;
    const images = enriched.imageUrl
      ? [enriched.imageUrl]
      : enriched.images ?? base.images;

    const driveContext = {
      originToParkingMinutes:
        merged.originToParkingMinutes ?? base.originToParkingMinutes,
      routeToParkingMinutes:
        merged.routeToParkingMinutes ?? base.routeToParkingMinutes,
      driveMinutes: merged.driveMinutes ?? base.driveMinutes,
      duration: merged.duration ?? base.duration,
    };

    const recomputedDrive =
      !driveContext.originToParkingMinutes &&
      typeof enriched.lat === 'number' &&
      typeof enriched.lng === 'number' &&
      typeof base.originToParkingMinutes === 'number'
        ? base.originToParkingMinutes
        : undefined;

    return {
      ...merged,
      ...driveContext,
      originToParkingMinutes:
        driveContext.originToParkingMinutes ?? recomputedDrive,
      routeToParkingMinutes:
        driveContext.routeToParkingMinutes ?? recomputedDrive,
      lat: enriched.lat ?? merged.lat ?? base.lat,
      lng: enriched.lng ?? merged.lng ?? base.lng,
      imageUrl: imageUrl || undefined,
      images: images?.length ? images : undefined,
    };
  }

  function mergeGooglePlaceResultIntoParking(
    selectedParking: ParkingOption,
    enrichedParking: ParkingOption
  ) {
    const parkingId = selectedParking.id || enrichedParking.id;
    if (!parkingId) return;

    const mergedParking: ParkingOption = {
      ...mergeGoogleEnrichedParkingOption(selectedParking, enrichedParking),
      id: parkingId,
    } as ParkingOption;

    setGoogleEnrichedParking((prev) => ({
      ...prev,
      [parkingId]: {
        ...mergeGoogleEnrichedParkingOption(prev[parkingId] || selectedParking, enrichedParking),
        id: parkingId,
      } as ParkingOption,
    }));

    setRankedOptions((prev) =>
      prev.map((item) => {
        if (item.type !== 'parking') return item;

        const option = item.option as ParkingOption;
        if (option.id !== parkingId) return item;

        return {
          ...item,
          option: {
            ...mergeGoogleEnrichedParkingOption(option, enrichedParking),
            id: parkingId,
          } as ParkingOption,
        };
      })
    );

    setRecommendation((prev) =>
      prev
        ? {
          ...prev,
          parking: prev.parking.map((option) =>
            option.id === parkingId
              ? ({
                ...mergeGoogleEnrichedParkingOption(option, enrichedParking),
                id: parkingId,
              } as ParkingOption)
              : option
          ),
        }
        : prev
    );

    setReviewsParking((current) =>
      current?.id === parkingId
        ? mergeGoogleEnrichedParkingOption(current, mergedParking)
        : current
    );
  }

  useEffect(() => {
    if (!rankedOptions.length || !tripData) return;
    const airportCode = getTripAirportCode(tripData);

    const parkingOptions = rankedOptions
      .filter((item) => item.type === "parking")
      .map((item) => item.option as ParkingOption)
      .filter((parking) => {
        if (isParkingRouteUnavailable(parking)) return false;
        if (!parking.id) return false;
        if (!shouldAttemptGooglePlaceMatch({
          lotName: parking.name,
          lotAddress: parking.address || parking.normalizedAddress || parking.routeDestination || null,
          provider: parking.bookingProvider || null,
          source: parking.sourceName || null,
          airportCode,
        })) {
          return false;
        }

        const key = parkingGoogleMatchKey(parking, airportCode);
        return !googleEnrichedParking[parking.id] && !googlePlaceAttemptedKeysRef.current.has(key);
      })
      .slice(
        0,
        Math.min(visibleParkingCount, MAX_GOOGLE_PLACE_MATCH_LIMIT),
      );

    if (parkingOptions.length === 0) return;

    let cancelled = false;

    const enrichParking = async () => {
      const enrichedPairs: Array<readonly [string, ParkingOption]> = [];

      for (let index = 0; index < parkingOptions.length; index += GOOGLE_PLACE_MATCH_CONCURRENCY) {
        const batch = parkingOptions.slice(index, index + GOOGLE_PLACE_MATCH_CONCURRENCY);
        const batchPairs = await Promise.all(
          batch.map(async (parking) => {
            const key = parkingGoogleMatchKey(parking, airportCode);
            googlePlaceAttemptedKeysRef.current.add(key);

            const inflight = googlePlaceInFlightKeysRef.current.get(key);
            if (inflight) {
              const enriched = mergeGoogleEnrichedParkingOption(parking, await inflight);
              return [parking.id, enriched] as const;
            }

            const promise = attachGooglePlaceToParking(parking, tripData, airportCode);
            googlePlaceInFlightKeysRef.current.set(key, promise);

            try {
              const enriched = mergeGoogleEnrichedParkingOption(parking, await promise);
              return [parking.id, enriched] as const;
            } finally {
              if (googlePlaceInFlightKeysRef.current.get(key) === promise) {
                googlePlaceInFlightKeysRef.current.delete(key);
              }
            }
          })
        );

        if (cancelled) return;
        enrichedPairs.push(...batchPairs);
      }

      if (cancelled) return;

      setGoogleEnrichedParking((prev: Record<string, ParkingOption>) => {
        const next = { ...prev };

        enrichedPairs.forEach(([id, enriched]) => {
          next[id] = mergeGoogleEnrichedParkingOption(next[id] || parkingOptions.find((p) => p.id === id) || enriched, enriched);
        });

        return next;
      });

      enrichedPairs.forEach(([id, enriched]) => {
        const key = parkingGoogleMatchKey(enriched, airportCode);
        googlePlaceAttemptedKeysRef.current.add(key);
      });
    };

    void enrichParking();

    return () => {
      cancelled = true;
    };
  }, [rankedOptions, tripData, googleEnrichedParking, visibleParkingCount]);

  useEffect(() => {
    if (!recommendation?.parking?.length || !tripData) return;

    const aprOptions = recommendation.parking.filter((p) =>
      !isParkingRouteUnavailable(p) &&
      (
        p.bookingProvider === 'AirportParkingReservations' ||
        p.sourceName === 'AirportParkingReservations'
      )
    );

    if (aprOptions.length === 0) return;

    const requestKey = JSON.stringify({
      ids: aprOptions.map((p) => p.id || p.name),
      parkingCheckInDate: (tripData as TripDataWithExtras).parkingCheckInDate,
      parkingCheckOutDate: (tripData as TripDataWithExtras).parkingCheckOutDate,
      parkingDuration: (tripData as TripDataWithExtras).parkingDuration,
    });

    if (aprRequestKeyRef.current === requestKey) return;

    aprRequestKeyRef.current = requestKey;
    const fetchId = aprFetchIdRef.current + 1;
    aprFetchIdRef.current = fetchId;

    setAprLiveChecking(true);
    setAprLivePartial(false);

    fetch('/api/parking/apr-live-prices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tripData,
        parkingOptions: aprOptions,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (aprFetchIdRef.current !== fetchId) return;

        const prices = data?.pricesByKey || data?.prices || {};

        setAprLivePrices(prices);
        setAprLivePartial(Object.keys(prices).length < aprOptions.length);
      })
      .catch((err) => {
        console.error('[APR live price fetch failed]', err);
        if (aprFetchIdRef.current !== fetchId) return;
        setAprLivePartial(true);
      })
      .finally(() => {
        if (aprFetchIdRef.current !== fetchId) return;
        setAprLiveChecking(false);
      });
  }, [recommendation, tripData]);

  const airportReadiness = useMemo(() => {
    if (!tripData || tripData.type !== 'one-way-departure') return null;

    return calculateAirportReadinessBuffer({
      checkingBags: !!tripData.checkingBags,
      securityOption: tripData.securityOption || 'standard',
      flightType: tripData.flightType || 'domestic',
      cabin: tripData.cabin || 'economy',
    });
  }, [tripData]);

  const airportReadyBufferMinutes = getAirportReadyBufferForTiming({
    timeAnchor:
      tripData?.type === 'one-way-departure'
        ? tripData.timeAnchor
        : undefined,
    airportReadinessBufferMinutes: airportReadiness?.bufferMinutes,
  });


  const airlineOrFlight = searchParams.get('airlineOrFlight') || '';
  const intent = searchParams.get('intent') || '';



  const seatacZone = useMemo(() => {
    if (!airlineOrFlight) return null;
    return resolveSeatacCheckinZone(airlineOrFlight);
  }, [airlineOrFlight]);

  const initialSort = (() => {
    const sortParam = searchParams.get('sort');
    return sortParam === 'cheapest' || sortParam === 'fastest' || sortParam === 'easiest'
      ? sortParam
      : 'easiest';
  })();

  const [sort, setSort] = useState<SortTab>(initialSort);

  useEffect(() => {
    // Sync URL param with current sort state
    if (typeof window === 'undefined') return;
    const currentParams = new URLSearchParams(window.location.search);
    if (currentParams.get('sort') !== sort) {
      currentParams.set('sort', sort);
      const newUrl = window.location.pathname + '?' + currentParams.toString();
      window.history.replaceState(null, '', newUrl);
    }
  }, [sort]);

  useEffect(() => {
    if (!showMapModal) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [showMapModal]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const data = parseTripDataFromSearchParams(searchParams);

    if (data) {
      const requestKey = JSON.stringify(data);
      const currentRequest = recommendationsRequestRef.current;

      const isNewTripRequest = recommendationsLoadedKeyRef.current !== requestKey;

      if (isNewTripRequest) {
        // Clear stale enrichment from previous airport/date/origin.
        // Prevents smaller-airport lots/photos/prices from leaking into SEA after edit recalculation.
        setReviewsParking(null);
        setGoogleEnrichedParking({});
        setMatchedParkingPrices({});
        setAprLivePrices({});
        setAprLivePartial(false);
        setAprLiveChecking(false);
        setParkingPricesChecking(false);
        setParkingWeather([]);
        setVisibleParkingCount(COLLAPSED_PARKING_DISPLAY_COUNT);
        setSelectedParkingId(null);

        googlePlaceAttemptedKeysRef.current.clear();
        googlePlaceInFlightKeysRef.current.clear();

        priceMatchKeyRef.current = '';
        liveRefreshLoadedKeyRef.current = '';
        liveRefreshInFlightKeyRef.current = '';
      }

      if (recommendationsLoadedKeyRef.current === requestKey && recommendation) {
        setLoading(false);
        return;
      }

      if (
        currentRequest?.inFlight &&
        currentRequest.key === requestKey &&
        !currentRequest.controller.signal.aborted
      ) {
        logRecommendationsFetch('start', requestKey, {
          skipped: 'same-request-in-flight',
        });
        return;
      }

      if (currentRequest?.inFlight && !currentRequest.controller.signal.aborted) {
        logRecommendationsFetch('abort', currentRequest.key, {
          reason: 'replaced-by-new-request',
        });
        currentRequest.controller.abort();
      }

      const controller = new AbortController();
      recommendationsRequestRef.current = {
        key: requestKey,
        controller,
        inFlight: true,
      };

      // Always show loading state for URL-driven recomputes (date/time/origin changes, etc.)
      setInvalidTripMessage(null);
      setFetchError(null);
      setLoading(true);
      if (isNewTripRequest) {
        setIsRecalculating(true);
      }
      setShowTooLate(false);
      setRecommendation(null);
      setRankedOptions([]);

      logRecommendationsFetch('start', requestKey);

      fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      })
        .then(async (response) => {
          const text = await response.text();

          if (!response.ok) {
            throw new Error(
              `Recommendations failed ${response.status}: ${text || 'No response body'}`
            );
          }

          if (!text) {
            throw new Error('Recommendations returned an empty response body');
          }

          return JSON.parse(text) as Recommendation;
        })
        .then((rec: Recommendation) => {
          if (controller.signal.aborted) {
            logRecommendationsFetch('abort', requestKey, {
              reason: 'aborted-before-success',
              hasNewerRequest:
                recommendationsRequestRef.current?.controller !== controller &&
                recommendationsRequestRef.current?.inFlight === true,
            });
            return;
          }

          recommendationsLoadedKeyRef.current = requestKey;
          setRecommendation(rec);
          setTripData(data);

          const ranked = rankRecommendations(
            data,
            rec.parking,
            rec.rideshare,
            rec.transit,
            rec.tsaEstimate
          );
          setRankedOptions(ranked);
          logRecommendationsFetch('success', requestKey, {
            parking: rec.parking?.length ?? 0,
            rideshare: rec.rideshare?.length ?? 0,
            transit: rec.transit?.length ?? 0,
          });
        })
        .catch((error) => {
          const current = recommendationsRequestRef.current;
          const hasNewerRequest =
            current?.controller !== controller && current?.inFlight === true;

          if (controller.signal.aborted || isAbortError(error)) {
            logRecommendationsFetch('abort', requestKey, {
              reason: controller.signal.aborted ? 'controller-aborted' : 'abort-error',
              hasNewerRequest,
            });

            if (!hasNewerRequest && current?.controller === controller) {
              setLoading(false);
            }

            return;
          }

          logRecommendationsFetch('fail', requestKey, {
            message: error instanceof Error ? error.message : String(error),
          });
          console.error('Error fetching recommendations:', error);
          setFetchError(
            error instanceof Error
              ? error.message
              : 'Could not recalculate recommendations. Please try again.',
          );
          setRecommendation(null);
          setRankedOptions([]);
        })
        .finally(() => {
          const current = recommendationsRequestRef.current;
          const isCurrentRequest = current?.controller === controller;
          const hasNewerRequest =
            current?.controller !== controller && current?.inFlight === true;

          logRecommendationsFetch('finally', requestKey, {
            aborted: controller.signal.aborted,
            isCurrentRequest,
            hasNewerRequest,
          });

          if (isCurrentRequest) {
            recommendationsRequestRef.current = {
              key: requestKey,
              controller,
              inFlight: false,
            };
          }

          if (isCurrentRequest || !hasNewerRequest) {
            setLoading(false);
            setIsRecalculating(false);
          }
        });

      return () => {
        const current = recommendationsRequestRef.current;
        const isCurrentRequest = current?.controller === controller;

        logRecommendationsFetch('abort', requestKey, {
          reason: 'effect-cleanup',
          isCurrentRequest,
        });

        controller.abort();

        if (isCurrentRequest) {
          recommendationsRequestRef.current = {
            key: requestKey,
            controller,
            inFlight: false,
          };
          setLoading(false);
        }
      };
    } else {
      recommendationsRequestRef.current?.controller.abort();
      recommendationsLoadedKeyRef.current = '';
      setInvalidTripMessage(
        'This trip is missing required details. Start a new trip to see live results.'
      );
      setTripData(null);
      setRecommendation(null);
      setRankedOptions([]);
      setLoading(false);
    }
  }, [searchParamsString]);

  const weatherToneBg =
    recommendation?.weatherImpact?.riskLevel === 'high'
      ? 'bg-red-50'
      : recommendation?.weatherImpact?.riskLevel === 'medium'
        ? 'bg-amber-50'
        : 'bg-zinc-100';

  const weatherTone =
    recommendation?.weatherImpact?.riskLevel === 'high'
      ? 'text-red-700'
      : recommendation?.weatherImpact?.riskLevel === 'medium'
        ? 'text-amber-700'
        : 'text-zinc-900';

  const startEditing = () => {
    setIsEditing(true);
    setEditingData(tripData);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingData(null);
  };

  const sortedOptions = useMemo(
    () => sortRankedRecommendations(rankedOptions, sort),
    [rankedOptions, sort]
  );

  const { viableOptions, tooLateOptions, bestTooLateSummary } = useMemo(() => {
    const isFlyingOut = intent === 'flying-out' && tripData?.type === 'one-way-departure';
    if (!isFlyingOut || !tripData) {
      return {
        viableOptions: sortedOptions,
        tooLateOptions: [],
        bestTooLateSummary: null as BestTooLateSummary,
      };
    }

    const timed = sortedOptions.map((opt) => {
      const t = computeTimingStatus({
        intent,
        tripData,
        optionTotalMinutes: opt.duration,
      });
      const routeUnavailable =
        opt.type === 'parking' &&
        isParkingRouteUnavailable(opt.option as ParkingOption);
      return { opt, timing: t, routeUnavailable };
    });

    const tooLate = timed
      .filter((x) => !x.routeUnavailable && x.timing.status === 'too-late')
      .map((x) => x.opt);
    const viable = timed
      .filter((x) => !x.routeUnavailable && x.timing.status !== 'too-late')
      .map((x) => x.opt);

    // Best (least-bad) missed option for empty-state summary.
    let best: {
      flightDeparts: string;
      recommendedBy: string;
      bestArrival: string;
      bestLatestSafeLeave: string;
      shortByMinutes: number;
    } | null = null;

    const buf = computeAirportReadyBufferMinutes(tripData);
    const depMin = parseHHMMToMinutes(tripData.departureTime);
    if (buf && depMin != null) {
      const recommendedByMin =
        tripData.timeAnchor === 'airport-arrival'
          ? depMin
          : depMin - airportReadyBufferMinutes;

      const recommendedBy = minutesToHHMM(recommendedByMin);

      let bestShortBy = Infinity;
      let bestArrival: string | null = null;
      let bestLeave: string | null = null;

      timed.forEach((x) => {
        if (x.timing.status !== 'too-late') return;
        if (typeof x.timing.shortByMinutes !== 'number') return;
        if (!x.timing.youReachTerminalAround) return;
        if (!x.timing.latestSafeLeaveTime) return;

        if (x.timing.shortByMinutes < bestShortBy) {
          bestShortBy = x.timing.shortByMinutes;
          bestArrival = x.timing.youReachTerminalAround;
          bestLeave = x.timing.latestSafeLeaveTime;
        }
      });

      if (bestArrival != null && bestLeave != null && Number.isFinite(bestShortBy)) {
        best = {
          flightDeparts: tripData.departureTime,
          recommendedBy,
          bestArrival,
          bestLatestSafeLeave: bestLeave,
          shortByMinutes: Math.round(bestShortBy),
        };
      }
    }

    return { viableOptions: viable, tooLateOptions: tooLate, bestTooLateSummary: best };
  }, [sortedOptions, intent, tripData, airportReadyBufferMinutes]);

  const bestViableLeaveByTime = useMemo(() => {
    const isFlyingOut = intent === 'flying-out' && tripData?.type === 'one-way-departure';
    if (!isFlyingOut || !tripData) return null;
    if (recommendation?.airportRouteUnavailable || recommendation?.trafficEstimate?.routeUnavailable) return null;
    if (viableOptions.length === 0) return null;

    const first = viableOptions[0];
    const t = computeTimingStatus({ intent, tripData, optionTotalMinutes: first.duration });
    return t.latestSafeLeaveTime || null;
  }, [intent, tripData, viableOptions, recommendation]);

  const currentAirportCode = ((tripData as TripDataWithExtras)?.airportCode || searchParams.get('airport') || 'SEA').toUpperCase();

  const currentAirport = getAirportById(currentAirportCode) || getAirportById('SEA')!;
  const displayDestination = currentAirport.label;
  const airportRouteUnavailable =
    Boolean(recommendation?.airportRouteUnavailable) ||
    Boolean(recommendation?.trafficEstimate?.routeUnavailable);

  const airportRouteUnavailableReason =
    recommendation?.airportRouteUnavailableReason ||
    recommendation?.trafficEstimate?.routeUnavailableReason ||
    'We could not calculate a ground route from this origin to the airport.';

  const extraRideProviders = useMemo(
    () => [
      {
        id: 'uber-link',
        name: 'Uber',
        trustStatus: 'estimated' as const,
        priceDisplay: 'check-live' as const,
        priceNote: 'Open Uber for current pricing; PodPaiGo does not have a live Uber quote.',
        sourceName: PROVIDER_LINKS.uberDeepLink.sourceName,
        sourceLink: PROVIDER_LINKS.uberDeepLink.url,
      },
      {
        id: 'lyft-link',
        name: 'Lyft',
        trustStatus: 'estimated' as const,
        priceDisplay: 'check-live' as const,
        priceNote: 'Open Lyft for current pricing; PodPaiGo does not have a live Lyft quote.',
        sourceName: PROVIDER_LINKS.lyftDeepLink.sourceName,
        sourceLink: PROVIDER_LINKS.lyftDeepLink.url,
      },
    ],
    []
  );

  const extraTransitProviders = useMemo(() => {
    const origin = tripData?.origin || '';
    const airport = getAirportById(currentAirportCode) || getAirportById('SEA')!;
    const destination = airport.routingAddress || `${airport.label} airport`;
    const transitLink = origin
      ? googleMapsDirectionsLink(origin, destination, 'transit')
      : PROVIDER_LINKS.googleMaps.url;

    const googleTransit = {
      id: 'google-maps-transit',
      name: 'Google Maps Transit Directions',
      trustStatus: 'estimated' as const,
      priceDisplay: 'check-live' as const,
      priceNote: 'Route planning + live advisories',
      sourceName: PROVIDER_LINKS.googleMaps.sourceName,
      sourceLink: transitLink,
      mapLink: transitLink,
    };

    if (currentAirportCode === 'SEA') {
      return [
        {
          id: 'soundtransit-planner',
          name: 'Sound Transit Trip Planner',
          trustStatus: 'verified-source' as const,
          priceDisplay: 'check-live' as const,
          priceNote: 'Official schedules & fares',
          sourceName: PROVIDER_LINKS.soundTransitPlanner.sourceName,
          sourceLink: PROVIDER_LINKS.soundTransitPlanner.url,
          mapLink: transitLink, // keeps your "View route"
        },
      ];
    }

    return [googleTransit];
  }, [currentAirportCode, tripData?.origin]);

  useEffect(() => {
    if (!tripData) {
      setParkingWeather([]);
      return;
    }

    const tripExtras = tripData as TripDataWithExtras;
    const startDate =
      tripExtras.parkingCheckInDate ||
      (tripData.type === 'one-way-departure' ? tripData.departureDate : '');
    const returnDate = tripExtras.parkingCheckOutDate || '';
    const airportCode = getTripAirportCode(tripData);
    const startTime =
      tripData.type === 'one-way-departure'
        ? tripData.departureTime
        : tripExtras.parkingCheckOutTime || '12:00';
    const returnTime = tripExtras.parkingCheckOutTime || startTime || '12:00';

    const requests = [
      startDate
        ? {
          key: 'parking-start',
          label: 'Start',
          date: startDate,
          time: startTime,
        }
        : null,
      returnDate && returnDate !== startDate
        ? {
          key: 'parking-return',
          label: 'Return',
          date: returnDate,
          time: returnTime,
        }
        : null,
    ].filter((item): item is { key: string; label: string; date: string; time: string } =>
      Boolean(item)
    );

    if (requests.length === 0) {
      setParkingWeather([]);
      return;
    }

    const controller = new AbortController();

    Promise.all(
      requests.map(async (item) => {
        const params = new URLSearchParams({
          airport: airportCode,
          targetDateTime: buildWeatherTargetDateTime(item.date, item.time),
        });

        const response = await fetch(`/api/weather?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await response.json();

        return {
          key: item.key,
          label: item.label,
          date: item.date,
          context: (data?.context || 'unavailable') as WeatherContext,
          weatherImpact: (data?.weatherImpact || null) as WeatherImpact | null,
        };
      })
    )
      .then((items) => setParkingWeather(items))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('selected-date weather failed', error);
        setParkingWeather([]);
      });

    return () => controller.abort();
  }, [tripData]);

  const recommendationRouteUnavailableForRefresh =
    Boolean(recommendation?.airportRouteUnavailable) ||
    Boolean(recommendation?.trafficEstimate?.routeUnavailable);
  const hasRecommendationForRefresh = Boolean(recommendation);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH === 'false') return;
    if (!tripData || !hasRecommendationForRefresh) return;
    if (loading || !recommendationsLoadedKeyRef.current) return;
    if (recommendationRouteUnavailableForRefresh) return;

    const tripExtras = tripData as TripDataWithExtras;
    const body = {
      airportCode: getTripAirportCode(tripData),
      destination: tripData.destination,
      checkInDate: tripExtras.parkingCheckInDate,
      checkOutDate: tripExtras.parkingCheckOutDate,
    };
    const refreshKey = JSON.stringify(body);

    if (
      liveRefreshInFlightKeyRef.current === refreshKey ||
      liveRefreshLoadedKeyRef.current === refreshKey
    ) {
      return;
    }

    const controller = new AbortController();
    liveRefreshInFlightKeyRef.current = refreshKey;

    const refresh = async () => {
      try {
        const res = await fetch('/api/parking/live-refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Live parking refresh failed ${res.status}`);
        }

        const data = await res.json();
        liveRefreshLoadedKeyRef.current = refreshKey;

        if (Array.isArray(data?.parking) && data.parking.length > 0) {
          setRecommendation((prev) => {
            if (!prev) return prev;

            const refreshed = data.parking as ParkingOption[];

            return {
              ...prev,
              parking: prev.parking.map((existing) => {
                const existingKey = parkingKeySafe(existing);
                const match = refreshed.find((fresh) => {
                  if (fresh.id && existing.id && fresh.id === existing.id) return true;

                  const freshKey = parkingKeySafe(fresh);
                  return Boolean(existingKey && freshKey && existingKey === freshKey);
                });

                return match
                  ? mergeParkingRouteStatus(existing, match) as ParkingOption
                  : withStableParkingRouteStatus(existing);
              }),
            };
          });
        }
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        console.warn('live parking refresh failed');
      } finally {
        if (liveRefreshInFlightKeyRef.current === refreshKey) {
          liveRefreshInFlightKeyRef.current = '';
        }
      }
    };

    refresh();

    return () => {
      controller.abort();
      if (liveRefreshInFlightKeyRef.current === refreshKey) {
        liveRefreshInFlightKeyRef.current = '';
      }
    };
  }, [
    tripData,
    loading,
    hasRecommendationForRefresh,
    recommendationRouteUnavailableForRefresh,
  ]);

  useEffect(() => {
    if (!tripData || !recommendation?.parking?.length) return;

    const airportCode = getTripAirportCode(tripData);

    const checkInDate =
      (tripData as TripDataWithExtras).parkingCheckInDate ||
      (tripData.type === 'one-way-departure' ? tripData.departureDate : '');

    const checkOutDate =
      (tripData as TripDataWithExtras).parkingCheckOutDate || '';

    if (!checkInDate || !checkOutDate) return;

    const lots = [...recommendation.parking]
      .filter((p) =>
        !isParkingRouteUnavailable(p) &&
        (
          p.bookingProvider === 'AirportParkingReservations' ||
          p.sourceName === 'AirportParkingReservations'
        )
      )
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        name: p.name,
      }));

    if (lots.length === 0) return;

    const priceMatchKey = JSON.stringify({
      airportCode,
      checkInDate,
      checkOutDate,
      lots: lots.map((lot) => lot.name).sort(),
    });

    if (priceMatchKeyRef.current === priceMatchKey) return;
    priceMatchKeyRef.current = priceMatchKey;

    setParkingPricesChecking(true);

    fetch('/api/parking/prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        airportCode,
        checkInDate,
        checkOutDate,
        lots,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        const next: Record<string, {
          price: number;
          priceUnit?: PriceUnit;
          provider?: string;
          sourceLink?: string;
        }> = {};

        for (const match of data.matches || []) {
          if (!match.matched || typeof match.price !== 'number') continue;

          const value = {
            price: match.price,
            priceUnit: match.priceUnit,
            provider: match.provider,
            sourceLink: match.sourceLink,
          };

          if (match.lotId) next[String(match.lotId)] = value;
          if (match.lotName) next[String(match.lotName)] = value;

          const brandKey = extractBrandKey(String(match.lotName || ''));
          if (brandKey) next[brandKey] = value;
        }

        setMatchedParkingPrices(next);
      })
      .catch((error) => {
        console.error('[parking price matches] failed', error);
      })
      .finally(() => {
        setParkingPricesChecking(false);
      });
  }, [tripData, recommendation?.parking, recommendation?.weatherImpact]);

  if (loading) {
    return (
      <div className="airport-page-bg flex flex-1 flex-col items-center justify-center">
        <div className="text-lg text-zinc-700">
          {isRecalculating ? 'Recalculating…' : 'Loading options…'}
        </div>
      </div>
    );
  }

  if (!tripData || !recommendation) {
    return (
      <div className="airport-page-bg flex flex-1 flex-col items-center justify-center px-4">
        <div className="text-lg font-medium text-zinc-900">
          {fetchError
            ? 'Recalculation failed'
            : invalidTripMessage
              ? 'Trip details are incomplete'
              : 'We couldn’t read your trip.'}
        </div>
        <div className="mt-1 max-w-md text-center text-sm text-zinc-600">
          {fetchError || invalidTripMessage || 'Go back and try again.'}
        </div>
        <div className="mt-2 max-w-md text-center text-xs text-zinc-500">
          Phase 1 clean result URLs are device/browser-local.
        </div>
        <Link href="/trip" className="mt-5 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700">
          Start a new trip
        </Link>
      </div>
    );
  }

  const parkingOptions = recommendation.parking ?? [];

  const parkingOptionsWithLive = parkingOptions.map((p) => {
    const aprUpdated = withStableParkingRouteStatus(
      withAprLivePrice(p, aprLivePrices) as ParkingOption
    );
    const matched =
      matchedParkingPrices[String(p.id || '')] ||
      matchedParkingPrices[String(p.name || '')] ||
      matchedParkingPrices[extractBrandKey(p.name)];

    if (!matched) return aprUpdated;

    return mergeParkingRouteStatus(aprUpdated, {
      ...aprUpdated,
      price: matched.price,
      priceUnit: matched.priceUnit || 'per-day',
      priceDisplay: 'from-per-day',
      priceNote: `Matched price from ${matched.provider || 'parking provider'}. Confirm final checkout price before booking.`,
      priceSource: 'marketplace-link',
      priceConfidence: 'medium',
      trustStatus: 'live',
      sourceName: matched.provider || aprUpdated.sourceName,
      sourceLink: matched.sourceLink || aprUpdated.sourceLink,
      bestFor: [
        ...(aprUpdated.bestFor || []),
        'Live Price',
      ],
    } as ParkingOption) as ParkingOption;
  });

  const rideshareOptions = recommendation.rideshare ?? [];
  const transitOptions = recommendation.transit ?? [];

  const transportAvailability = (tripData as TripDataWithExtras).transportAvailability || 'all';
  const showParkingProviders = transportAvailability === 'car' || transportAvailability === 'all';
  const showRideProviders = transportAvailability === 'car' || transportAvailability === 'rideshare' || transportAvailability === 'all';

  const rideOptions = rideshareOptions;
  const hasUber = rideOptions.some((r) => String(r?.id || '').toLowerCase() === 'uber' || String(r?.name || '').toLowerCase() === 'uber');
  const hasLyft = rideOptions.some((r) => String(r?.id || '').toLowerCase() === 'lyft' || String(r?.name || '').toLowerCase() === 'lyft');
  const extraRideProvidersDeduped = extraRideProviders.filter((r) => {
    const name = String(r?.name || '').toLowerCase();
    if (name === 'uber') return !hasUber;
    if (name === 'lyft') return !hasLyft;
    return true;
  });
  const rideProviderItems = [...rideOptions, ...extraRideProvidersDeduped];

  const noViableFlyingOut = false;

  const heroAirportTiming = (() => {
    if (intent !== 'flying-out' || tripData.type !== 'one-way-departure') return null;

    const tripExtras = tripData as TripDataWithExtras;

    const selectedSecurityOption = (
      searchParams.get('securityOption') ||
      searchParams.get('security') ||
      tripExtras.securityOption ||
      'standard'
    ) as SecurityOption;

    const readiness = calculateAirportReadinessBuffer({
      checkingBags: !!tripExtras.checkingBags,
      securityOption: selectedSecurityOption,
      flightType: (tripExtras.flightType || 'domestic') as FlightType,
      cabin: (tripExtras.cabin || 'economy') as CabinClass,
    });

    const airportReadyBufferMinutes = readiness.bufferMinutes;
    const depMin = parseHHMMToMinutes(tripData.departureTime);

    if (!airportReadyBufferMinutes || depMin == null) return null;

    const recommendedBy = minutesToHHMM(
      tripData.timeAnchor === 'airport-arrival'
        ? depMin
        : depMin - airportReadyBufferMinutes
    );

    const checkingBags = !!(tripData as TripDataWithExtras).checkingBags;
    const flightType = String((tripData as TripDataWithExtras).flightType || 'domestic');
    const cabin = String((tripData as TripDataWithExtras).cabin || 'economy');
    const securityOption = String((tripData as TripDataWithExtras).securityOption || 'standard');

    const airportCode = getTripAirportCode(tripData);

    const secLabel = securitySummaryLabel(
      airportCode,
      securityOption as SecurityOption
    );

    return {
      recommendedBy,
      lines: [
        `Bags: ${checkingBags ? 'Yes' : 'No'}`,
        `Security: ${secLabel}`,
        `Flight: ${flightType === 'international' ? 'International' : 'Domestic'}`,
        `Cabin: ${cabin === 'premium' ? 'Premium' : 'Economy'}`,
      ],
      airportTimingIsLimitingFactor: (() => {
        // Compare legacy leave-by (traffic/TSA based) vs airport-ready driven leave-by.
        if (!recommendation.leaveByTime) return false;
        if (!bestViableLeaveByTime) return false;

        const legacyLeaveMin = parseHHMMToMinutes(recommendation.leaveByTime);
        const airportLeaveMin = parseHHMMToMinutes(bestViableLeaveByTime);
        if (legacyLeaveMin == null || airportLeaveMin == null) return false;

        return airportLeaveMin < legacyLeaveMin;
      })(),
    };
  })();

  const parkingOptionsOnly = parkingOptionsWithLive.map((p) => {
    const matchedRanked = sortedOptions.find((o) => {
      const rankedKey = parkingKeySafe(o.option as AppOption);
      const parkingKey = parkingKeySafe(p as AppOption);
      return rankedKey && parkingKey && rankedKey === parkingKey;
    });

    const routeUnavailable = isParkingRouteUnavailable(p as ParkingOption);
    const breakdown = routeUnavailable ? null : parkingTimeBreakdown(p as ParkingOption);

    return {
      ...(matchedRanked || {
        type: 'parking',
        score: 0,
        stressScore: 0,
        reasons: routeUnavailable
          ? ['Route unavailable from this origin to this parking lot.']
          : ['Available parking option'],
        cost: typeof p.price === 'number' ? p.price : 999,
        duration: breakdown?.totalMinutes ?? 0,
      }),
      type: 'parking',
      option: withStableParkingRouteStatus(p),
      cost: typeof p.price === 'number' ? p.price : matchedRanked?.cost ?? 999,
    } as RankedRecommendation;
  });

  const parkingOptionsWithAprPricesRaw = parkingOptionsOnly.map((o) => {
    const updatedOption = withStableParkingRouteStatus(
      withAprLivePrice(o.option as AppOption, aprLivePrices) as AppOption
    );
    const comparableTotal = getParkingComparableTotal(updatedOption, tripData);

    return {
      ...o,
      option: updatedOption as ParkingOption,
      cost: comparableTotal ?? o.cost,
    } satisfies RankedRecommendation;
  });

  const parkingOptionsWithAprPrices = dedupeParkingRankedOptions(
    parkingOptionsWithAprPricesRaw,
    tripData
  );

  const sortedParkingForCurrentTab = [...parkingOptionsWithAprPrices].sort((a, b) => {
    const aOption = a.option as ParkingOption;
    const bOption = b.option as ParkingOption;

    if (isParkingRouteUnavailable(aOption) !== isParkingRouteUnavailable(bOption)) {
      return isParkingRouteUnavailable(aOption) ? 1 : -1;
    }

    const aTotal = getParkingComparableTotal(aOption as AppOption, tripData) ?? getParkingTotalPrice(aOption, tripData) ?? costOf(a) ?? 999999;
    const bTotal = getParkingComparableTotal(bOption as AppOption, tripData) ?? getParkingTotalPrice(bOption, tripData) ?? costOf(b) ?? 999999;

    if (sort === 'cheapest') return (aTotal - bTotal) || (a.duration - b.duration);
    if (sort === 'fastest') {
      const aTime = parkingTimeBreakdown(aOption).totalMinutes || a.duration || 999;
      const bTime = parkingTimeBreakdown(bOption).totalMinutes || b.duration || 999;

      return (aTime - bTime) || (aTotal - bTotal);
    }

    const convenienceScore = (item: RankedRecommendation) => {
      const option = item.option as ParkingOption;
      const name = String(option.name || '').toLowerCase();

      let score = 0;

      if (option.type === 'official') score += 100;
      if (name.includes('parking garage')) score += 80;
      if (option.transferType === 'walk' || option.transferType === 'airport-garage') score += 50;
      if (option.covered) score += 25;
      if (option.trustStatus === 'verified-source' || option.trustStatus === 'live') score += 25;
      if (option.sourceLink) score += 15;

      const time = parkingTimeBreakdown(option).totalMinutes || item.duration || 999;
      score -= time * 0.5;

      return score;
    };

    return (
      convenienceScore(b) - convenienceScore(a) ||
      (a.duration - b.duration)
    );
  });

  const smartPickParkingOptions = (() => {
    const options =
      sort === 'easiest'
        ? dedupeAndSortParkingOptions(
          sortedParkingForCurrentTab
            .map((opt) => opt.option as ParkingOption),
          tripData
        )
        : sortedParkingForCurrentTab
          .map((opt) => opt.option as ParkingOption);

    const canonical = canonicalizeParkingOptions(options);
    const routeAvailable = canonical.filter((option) => !isParkingRouteUnavailable(option));

    if (sort === 'cheapest') {
      const priced = routeAvailable.filter((option) => hasRealParkingPrice(option));
      if (priced.length > 0) return priced;

      const fallbackPriced = canonical.filter((option) => hasRealParkingPrice(option));
      return fallbackPriced.length > 0 ? fallbackPriced : canonical;
    }

    return routeAvailable.length > 0 ? routeAvailable : canonical;
  })();

  const parkingDisplayOptions = (() => {
    const options =
      sort === 'easiest'
        ? dedupeAndSortParkingOptions(
          sortedParkingForCurrentTab.map((opt) => opt.option as ParkingOption),
          tripData
        )
        : sortedParkingForCurrentTab.map((opt) => opt.option as ParkingOption);

    const canonical = canonicalizeParkingOptions(options);
    const available = canonical.filter((option) => !isParkingRouteUnavailable(option));
    const unavailable = canonical.filter((option) => isParkingRouteUnavailable(option));

    return [...available, ...unavailable];
  })();
  const allParkingRoutesUnavailable =
    parkingDisplayOptions.length > 0 &&
    parkingDisplayOptions.every((option) => isParkingRouteUnavailable(option));

  const cheapestSmartPickOptions =
    sort === 'cheapest'
      ? [...smartPickParkingOptions].sort((a, b) => {
        const aPrice = getParkingDailyPrice(a, tripData) ?? 999999;
        const bPrice = getParkingDailyPrice(b, tripData) ?? 999999;
        return aPrice - bPrice;
      })
      : smartPickParkingOptions;

  const smartPickOption = cheapestSmartPickOptions[0] || null;

  const reachableParkingDisplayOptions = parkingDisplayOptions;

  const remainingParking = parkingDisplayOptions
    .filter((parkingOption) => parkingOption.id !== smartPickOption?.id)
    .sort((a, b) => {
      const aUnavailable = isParkingRouteUnavailable(a);
      const bUnavailable = isParkingRouteUnavailable(b);

      if (aUnavailable !== bUnavailable) {
        return aUnavailable ? 1 : -1;
      }

      if (sort === 'fastest') {
        const aDuration =
          typeof a.distance === 'number'
            ? a.distance +
            (a.parkingBufferMinutes ?? 0) +
            (a.transferToTerminalMinutes ?? 0)
            : 999999;

        const bDuration =
          typeof b.distance === 'number'
            ? b.distance +
            (b.parkingBufferMinutes ?? 0) +
            (b.transferToTerminalMinutes ?? 0)
            : 999999;

        if (aDuration !== bDuration) return aDuration - bDuration;

        return parkingPriceRank(a) - parkingPriceRank(b);
      }

      if (sort === 'cheapest') {
        const aPriceRank = parkingPriceRank(a);
        const bPriceRank = parkingPriceRank(b);

        if (aPriceRank !== bPriceRank) return aPriceRank - bPriceRank;

        const aPrice = getParkingTotalPrice(a, tripData) ?? a.price ?? 999999;
        const bPrice = getParkingTotalPrice(b, tripData) ?? b.price ?? 999999;

        return aPrice - bPrice;
      }

      // easiest/default
      const aGarageBoost =
        a.transferType === 'walk' || a.transferType === 'airport-garage' ? -50 : 0;
      const bGarageBoost =
        b.transferType === 'walk' || b.transferType === 'airport-garage' ? -50 : 0;

      return aGarageBoost - bGarageBoost;
    })
    .map((parkingOption: ParkingOption) => {
      const matchedRanked = sortedParkingForCurrentTab.find((ranked) => {
        const rankedKey = parkingKeySafe(ranked.option as AppOption);
        const parkingKey = parkingKeySafe(parkingOption as AppOption);
        return rankedKey && parkingKey && rankedKey === parkingKey;
      });

      const routeUnavailable = isParkingRouteUnavailable(parkingOption);

      return {
        ...(matchedRanked || {
          type: 'parking',
          score: 0,
          stressScore: 0,
          reasons: routeUnavailable
            ? ['Route unavailable from this origin to this parking lot.']
            : ['Available parking option'],
          cost: routeUnavailable
            ? 999999
            : getParkingTotalPrice(parkingOption, tripData) ??
            parkingOption.price ??
            999999,
          duration: routeUnavailable
            ? 999999
            : (typeof parkingOption.distance === 'number'
              ? parkingOption.distance
              : 999999) +
            (parkingOption.parkingBufferMinutes ?? 0) +
            (parkingOption.transferToTerminalMinutes ?? 0),
        }),
        type: 'parking',
        option: parkingOption,
        cost: routeUnavailable
          ? 999999
          : getParkingTotalPrice(parkingOption, tripData) ??
          parkingOption.price ??
          matchedRanked?.cost ??
          999999,
      } as RankedRecommendation;
    });

  const displayableRemainingParking = remainingParking.filter((opt) => {
    const option = opt.option as AppOption;

    if (option.type !== 'parking') return true;

    return !isParkingRouteUnavailable(option);
  });
  const displayedParking = displayableRemainingParking.slice(0, visibleParkingCount);
  const hiddenParkingCount = Math.max(
    0,
    displayableRemainingParking.length - visibleParkingCount,
  );
  const nextParkingShowMoreCount = Math.min(
    PARKING_SHOW_MORE_INCREMENT,
    hiddenParkingCount,
  );
  const canShowMoreParking = hiddenParkingCount > 0;

  async function handleShowReviews(parking: ParkingOption) {
    const airportCode = getTripAirportCode(tripData);
    const key = parkingGoogleMatchKey(parking, airportCode);
    const cached = googleEnrichedParking[parking.id];
    const selectedParking = cached || parking;

    if (cached?.googleReviews?.length) {
      setReviewsParking(cached);
      return;
    }

    setReviewsParking(selectedParking);
    googlePlaceAttemptedKeysRef.current.add(key);

    let promise = googlePlaceInFlightKeysRef.current.get(key);
    if (!promise) {
      promise = attachGooglePlaceToParking(selectedParking, tripData, airportCode, {
        force: true,
      });
      googlePlaceInFlightKeysRef.current.set(key, promise);
    }

    try {
      const enriched = mergeGoogleEnrichedParkingOption(parking, await promise);
      mergeGooglePlaceResultIntoParking(parking, enriched);
      setReviewsParking(enriched);
    } finally {
      googlePlaceInFlightKeysRef.current.delete(key);
    }
  }

  function parkingHasRealPrice(option: ParkingOption): boolean {
    const anyOption = option as ParkingOption & {
      priceDisplay?: string;
      priceUnit?: string;
      trustStatus?: string;
      bookingProvider?: string;
      sourceName?: string;
    };

    return (
      typeof option.price === 'number' &&
      option.price > 0 &&
      anyOption.priceDisplay !== 'check-live'
    );
  }

  function parkingPriceRank(option: ParkingOption): number {
    const anyOption = option as ParkingOption & {
      priceDisplay?: string;
      trustStatus?: string;
      bookingProvider?: string;
      sourceName?: string;
    };

    if (isParkingRouteUnavailable(option)) return 999;

    if (parkingHasRealPrice(option)) {
      if (
        anyOption.trustStatus === 'live' ||
        anyOption.bookingProvider === 'parkwhiz' ||
        anyOption.bookingProvider === 'AirportParkingReservations' ||
        anyOption.sourceName === 'AirportParkingReservations'
      ) {
        return 0;
      }

      return 1;
    }

    if (anyOption.priceDisplay === 'check-live') return 5;

    return 9;
  }

  return (
    <div className="airport-page-bg flex flex-1 flex-col font-sans">
      <main className="mx-auto w-full max-w-5xl flex-1 px-3 pb-24 pt-6 sm:px-4 sm:pt-8">
        {/* Hero */}
        <div className="rounded-3xl border border-sky-100 bg-white/95 p-4 shadow-[0_18px_50px_rgba(14,116,144,0.12)] sm:p-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            {/* Left: main decision */}
            <div>
              <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase text-sky-800">
                {searchParams.get('airport') || 'SEA'}
              </div>

              <h1 className="mt-3 text-2xl font-semibold text-slate-950 sm:text-3xl">
                {airportRouteUnavailable
                  ? 'Route unavailable from this origin'
                  : noViableFlyingOut
                    ? 'No reliable option gets you airport-ready on time'
                    : intent === 'flying-out' && tripData.type === 'one-way-departure' && bestViableLeaveByTime
                      ? `You should leave at ${formatTimeFriendly(bestViableLeaveByTime)}`
                      : recommendation.leaveByTime
                        ? `You should leave at ${formatTimeFriendly(recommendation.leaveByTime)}`
                        : 'Your best options'}
              </h1>

              {airportRouteUnavailable && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <div className="font-semibold">
                    We could not calculate a real route from your starting location to this airport.
                  </div>
                  <div className="mt-1">
                    Try an origin near {currentAirport.id}, rideshare/taxi, or another transportation option.
                  </div>
                  {airportRouteUnavailableReason && (
                    <div className="mt-2 text-xs text-amber-800">
                      {airportRouteUnavailableReason}
                    </div>
                  )}
                </div>
              )}

              {noViableFlyingOut && bestTooLateSummary?.bestLatestSafeLeave && bestTooLateSummary?.bestArrival && (
                <div className="mt-2 text-sm text-zinc-600">
                  Best available attempt leaves at {formatTimeFriendly(bestTooLateSummary.bestLatestSafeLeave)} and reaches terminal around {formatTimeFriendly(bestTooLateSummary.recommendedBy || bestTooLateSummary.bestArrival)}.
                </div>
              )}

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {displayDestination}
                {intent ? ` • ${intent.replace(/-/g, ' ')}` : ''}
                {airlineOrFlight ? ` • ${airlineOrFlight}` : ''}
              </p>

              {(tripData.type === 'one-way-departure' || tripData.type === 'round-trip') &&
                recommendation.tsaEstimate && (
                  <TsaWaitTimesCard
                    tsaEstimate={recommendation.tsaEstimate}
                    airportCode={tripData?.airportCode}
                    selectedSecurityOption={(tripData as TripDataWithExtras | null)?.securityOption}
                  />
                )}

              <p className="mt-2 text-sm text-zinc-500">
                {airportRouteUnavailable
                  ? 'Airport readiness and TSA timing shown only; ground route timing is unavailable.'
                  : recommendation.trafficEstimate?.trustStatus === 'live'
                    ? 'Live traffic + airport timing + parking pricing analyzed'
                    : 'Estimated route timing + airport timing + parking pricing analyzed'}
              </p>

              {aprLiveChecking && parkingPricesChecking && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  Updating provider parking prices…
                </div>
              )}

              {aprLivePartial && !aprLiveChecking && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Some provider prices could not be refreshed. Confirm final parking rates before booking.
                </div>
              )}

              {seatacZone && (
                <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  Suggested SEA check-in area:{' '}
                  <span className="font-medium">{seatacZone.destination}</span>
                  {seatacZone.note ? <span> · {seatacZone.note}</span> : null}
                </div>
              )}
            </div>

            {/* Right: supporting context */}
            <div className="space-y-3 lg:border-l lg:border-sky-100 lg:pl-5">
              {(recommendation.weatherImpact || recommendation.weatherContext) && (
                <div className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-sm">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${weatherToneBg}`}>
                    {recommendation.weatherImpact?.condition === 'rain'
                      ? '🌧️'
                      : recommendation.weatherImpact?.condition === 'snow'
                        ? '🌨️'
                        : recommendation.weatherImpact?.condition === 'storm'
                          ? '⛈️'
                          : recommendation.weatherImpact?.condition === 'wind'
                            ? '🌬️'
                            : recommendation.weatherImpact
                              ? '☀️'
                              : '🌤️'}
                  </div>

                  <div className="flex flex-col">
                    {recommendation.weatherImpact ? (
                      <>
                        <span className={`font-medium ${weatherTone}`}>
                          {weatherSectionTitle(recommendation.weatherContext)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {recommendation.weatherImpact.summary}
                          {typeof recommendation.weatherImpact.temperatureF === 'number'
                            ? ` · ${recommendation.weatherImpact.temperatureF}°F`
                            : ''}
                          {' · '}
                          {weatherRiskText(recommendation.weatherImpact)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-zinc-900">
                          {weatherSectionTitle(recommendation.weatherContext)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {weatherSectionDetail(recommendation.weatherContext)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {parkingWeather.length > 0 && (
                <div className="rounded-2xl border border-sky-100 bg-white p-3">
                  <div className="text-xs font-semibold uppercase text-zinc-500">
                    Weather for your travel dates
                  </div>

                  <div className="mt-3 grid gap-2">
                    {parkingWeather.map((item) => (
                      <div
                        key={item.key}
                        className={`rounded-xl border px-3 py-2 text-sm ${item.weatherImpact
                          ? weatherRiskClass(item.weatherImpact)
                          : 'border-zinc-200 bg-zinc-50 text-zinc-700'
                          }`}
                      >
                        <div className="font-semibold">
                          {item.label}: {formatWeatherDateLabel(item.date)}
                        </div>

                        {item.weatherImpact ? (
                          <div className="mt-1 text-xs leading-5">
                            {item.weatherImpact.summary}
                            {typeof item.weatherImpact.temperatureF === 'number'
                              ? ` · ${item.weatherImpact.temperatureF}°F`
                              : ''}
                            {' · '}
                            {weatherRiskText(item.weatherImpact)}
                          </div>
                        ) : (
                          <div className="mt-1 text-xs">
                            {item.context === 'forecast-unavailable'
                              ? 'Forecast not available yet. Weather check becomes available closer to your trip date.'
                              : weatherSectionDetail(item.context)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {heroAirportTiming && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                  <div className="text-sm text-zinc-500">
                    {airportRouteUnavailable
                      ? 'Airport timing only — route unavailable'
                      : 'Recommended inside-airport arrival by'}
                  </div>

                  <div className="mt-1 text-lg font-bold text-zinc-950">
                    {formatTimeFriendly(heroAirportTiming.recommendedBy)}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-600">
                    {heroAirportTiming.lines.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setEditingData(tripData);
                    setIsEditing(true);
                    setEditTripJustOpened(true);

                    window.setTimeout(() => {
                      editTripRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                    }, 50);

                    window.setTimeout(() => {
                      setEditTripJustOpened(false);
                    }, 1800);
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  {isEditing ? 'Editing below' : 'Edit trip'}
                </button>
                <Link
                  href="/trip"
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  New trip
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-sky-100 bg-white/75 p-4 shadow-sm">
            <div className="text-xs font-medium text-zinc-500">Origin</div>
            <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{tripData.origin}</div>
          </div>

          <div className="rounded-2xl border border-sky-100 bg-white/75 p-4 shadow-sm">
            <div className="text-xs font-medium text-zinc-500">Destination</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">
              {displayDestination}
            </div>
          </div>

          {!airportRouteUnavailable && (
            <div className="rounded-2xl border border-sky-100 bg-white/75 p-4 shadow-sm">
              <div className="text-xs font-medium text-zinc-500">
                Traffic estimate
              </div>

              <div className="mt-1 text-sm font-semibold text-zinc-900">
                {recommendation.trafficEstimate
                  ? formatMinutes(recommendation.trafficEstimate.duration)
                  : '—'}
              </div>

              <div className="mt-1 text-xs text-zinc-600">
                {recommendation.trafficEstimate?.congestion
                  ? `${recommendation.trafficEstimate.congestion} congestion`
                  : 'Based on available route data'}
              </div>
            </div>
          )}
        </div>

        {/* APR Loading / Warning States */}
        {/* {aprLiveChecking && (
          <div className="sticky top-3 z-40 mt-6 rounded-2xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950 shadow-lg">
            Fetching live parking prices...
          </div>
        )} */}

        {aprLiveChecking && null}

        {/* Price legend */}
        <div className="mt-6">
          <PriceLegend />
        </div>


        <section className="mt-6 rounded-3xl border border-sky-100 bg-white/95 p-4 shadow-sm sm:p-5">
          {(() => {
            const parkingDurationMinutes = calculateParkingDuration(tripData);
            const isOvernightTrip =
              (tripData.type === 'one-way-departure' || tripData.type === 'round-trip') &&
              parkingDurationMinutes >= 18 * 60;

            const bestParking = smartPickOption || parkingDisplayOptions[0] || null;

            const parkingBreakdown = bestParking
              ? parkingTimeBreakdown(bestParking)
              : null;

            const parkingTotal =
              bestParking
                ? getParkingTotalPrice(bestParking, tripData) ?? bestParking.price ?? null
                : null;

            const bestRide = sortedOptions.find((o) => o.type === 'rideshare') || null;
            const bestRideOption = bestRide?.option as RideshareOption | undefined;

            const ridePrice =
              typeof bestRide?.cost === 'number' && bestRide.cost < 999999
                ? bestRide.cost
                : bestRideOption?.price ?? null;

            const rideDuration =
              typeof bestRide?.duration === 'number' && bestRide.duration < 999999
                ? bestRide.duration
                : bestRideOption?.duration ?? null;

            const bestTransit = sortedOptions.find((o) => o.type === 'transit') || null;
            const bestTransitOption = bestTransit?.option as TransitOption | undefined;

            const transitCost =
              typeof bestTransit?.cost === 'number' && bestTransit.cost < 999999
                ? bestTransit.cost
                : bestTransitOption?.price ?? null;

            const transitDuration =
              typeof bestTransit?.duration === 'number' && bestTransit.duration < 999999
                ? bestTransit.duration
                : bestTransitOption?.duration ?? null;

            const hasReliableTransit =
              Boolean(bestTransit) &&
              bestTransitOption?.trustStatus !== 'fallback' &&
              transitDuration !== null;

            const cheapestMode = (() => {
              const candidates = [
                parkingTotal !== null && bestParking
                  ? { key: 'parking', label: 'Parking', cost: parkingTotal }
                  : null,
                ridePrice !== null && bestRide
                  ? { key: 'rideshare', label: 'Rideshare', cost: ridePrice }
                  : null,
                transitCost !== null && hasReliableTransit
                  ? { key: 'transit', label: 'Transit', cost: transitCost }
                  : null,
              ].filter(Boolean) as Array<{ key: string; label: string; cost: number }>;

              return candidates.sort((a, b) => a.cost - b.cost)[0] || null;
            })();

            const fastestMode = (() => {
              const candidates = [
                parkingBreakdown?.totalMinutes && bestParking
                  ? { key: 'parking', label: 'Parking', minutes: parkingBreakdown.totalMinutes }
                  : null,
                rideDuration !== null && bestRide
                  ? { key: 'rideshare', label: 'Rideshare', minutes: rideDuration }
                  : null,
                transitDuration !== null && hasReliableTransit
                  ? { key: 'transit', label: 'Transit', minutes: transitDuration }
                  : null,
              ].filter(Boolean) as Array<{ key: string; label: string; minutes: number }>;

              return candidates.sort((a, b) => a.minutes - b.minutes)[0] || null;
            })();

            const modeScores = [
              bestParking
                ? {
                  key: 'parking',
                  label: 'Parking',
                  cost: parkingTotal ?? 999999,
                  minutes: parkingBreakdown?.totalMinutes ?? 999999,
                  reliable: !isParkingRouteUnavailable(bestParking),
                  baseScore: 0,
                }
                : null,
              bestRide
                ? {
                  key: 'rideshare',
                  label: 'Rideshare',
                  cost: ridePrice ?? 999999,
                  minutes: rideDuration ?? 999999,
                  reliable: true,
                  baseScore: 0,
                }
                : null,
              hasReliableTransit
                ? {
                  key: 'transit',
                  label: 'Transit',
                  cost: transitCost ?? 999999,
                  minutes: transitDuration ?? 999999,
                  reliable: true,
                  baseScore: -12,
                }
                : null,
            ].filter(Boolean) as Array<{
              key: string;
              label: string;
              cost: number;
              minutes: number;
              reliable: boolean;
              baseScore: number;
            }>;

            const scoredModes = modeScores.map((mode) => {
              let score = 100 + mode.baseScore;

              if (!mode.reliable) score -= 80;

              if (sort === 'cheapest') {
                score -= mode.cost * 0.65;
                score -= mode.minutes * 0.12;
              } else if (sort === 'fastest') {
                score -= mode.minutes * 0.9;
                score -= mode.cost * 0.15;
              } else {
                // easiest / default
                score -= mode.minutes * 0.35;
                score -= mode.cost * 0.25;

                if (mode.key === 'rideshare') score += 12;
                if (mode.key === 'parking') score += isOvernightTrip ? 14 : 4;
                if (mode.key === 'transit') score -= isOvernightTrip ? 20 : 8;
              }

              // Overnight airport trip safety:
              // Park & Ride is avoided, but normal airport/off-airport parking is still allowed.
              if (isOvernightTrip && mode.key === 'parking') score += 8;

              return {
                ...mode,
                score,
              };
            });

            const bestMode = scoredModes.sort((a, b) => b.score - a.score)[0];

            const recommendationMode = bestMode?.key || 'compare';

            const shortParkingName = bestParking?.name
              ? bestParking.name
                .replace('Seattle Airport South Lot - Self Uncovered', 'Airport South Lot')
                .replace('Seattle-Tacoma International Airport', 'SEA')
              : '';

            const recommendedTitle =
              recommendationMode === 'parking'
                ? shortParkingName
                  ? `Park at ${shortParkingName}`
                  : 'Park at the best available lot'
                : recommendationMode === 'rideshare'
                  ? `Take ${bestRideOption?.name || 'rideshare'}`
                  : recommendationMode === 'transit'
                    ? 'Take transit'
                    : 'Compare options';

            const recommendedReason =
              recommendationMode === 'parking'
                ? isOvernightTrip
                  ? 'Best fit for this overnight airport trip because Park & Ride is not treated as airport parking.'
                  : 'Best fit if you want control, luggage space, and a predictable airport arrival.'
                : recommendationMode === 'rideshare'
                  ? 'Best fit if you want the lowest effort and do not want to leave a car parked.'
                  : recommendationMode === 'transit'
                    ? 'Best fit if cost matters most and your schedule has enough buffer.'
                    : 'Open provider pricing before making a final decision.';

            const modeRows = [
              {
                key: 'parking',
                icon: '🅿️',
                label: 'Parking',
                name: bestParking?.name || 'No parking option found',
                cost: parkingTotal !== null ? `$${Math.round(parkingTotal)}` : 'Estimated range',
                time: parkingBreakdown?.totalMinutes
                  ? formatMinutes(parkingBreakdown.totalMinutes)
                  : 'Check route',
                verdict: bestParking
                  ? recommendationMode === 'parking'
                    ? 'Best pick'
                    : 'Good backup'
                  : 'Unavailable',
              },
              {
                key: 'rideshare',
                icon: '🚗',
                label: 'Rideshare',
                name: bestRideOption?.name || 'Uber / Lyft',
                cost: ridePrice !== null ? `$${Math.round(ridePrice)}` : 'Check app',
                time: rideDuration !== null ? formatMinutes(rideDuration) : 'Check app',
                verdict: bestRide
                  ? recommendationMode === 'rideshare'
                    ? 'Best pick'
                    : 'Easy backup'
                  : 'Open app',
              },
              {
                key: 'transit',
                icon: '🚆',
                label: 'Transit',
                name: bestTransitOption?.name || 'Google Maps / Sound Transit',
                cost: transitCost !== null && hasReliableTransit ? `$${Math.round(transitCost)}` : 'Check route',
                time: transitDuration !== null && hasReliableTransit ? formatMinutes(transitDuration) : 'Not ready',
                verdict: hasReliableTransit
                  ? recommendationMode === 'transit'
                    ? 'Best pick'
                    : 'Budget option'
                  : 'Live route needed',
              },
              {
                key: 'park-ride',
                icon: '🚌',
                label: 'Park & Ride',
                name: isOvernightTrip
                  ? 'Not available for overnight airport parking'
                  : 'Only if lot rules allow it',
                cost: isOvernightTrip ? 'Varies by lot' : 'Varies',
                time: isOvernightTrip ? 'Varies by mode' : 'Depends',
                verdict: isOvernightTrip ? 'Unavailable' : 'Verify rules',
                unavailable: isOvernightTrip,
              },
            ];

            const scrollToBestSection = (target: string) => {
              const el = document.getElementById(target);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            };

            const cardActionFor = (key: string) => {
              if (key === 'parking') {
                return {
                  label: 'View parking details',
                  onClick: () => scrollToBestSection('parking-options-section'),
                };
              }

              if (key === 'rideshare') {
                return {
                  label: 'View ride estimates',
                  onClick: () => {
                    setOpenProviderSection('ride');

                    window.setTimeout(() => {
                      scrollToBestSection('provider-links-section');
                    }, 50);
                  },
                };
              }

              if (key === 'transit') {
                return {
                  label: 'View transit links',
                  onClick: () => {
                    setOpenProviderSection('transit');

                    window.setTimeout(() => {
                      scrollToBestSection('provider-links-section');
                    }, 50);
                  },
                };
              }

              if (key === 'park-ride') {
                return {
                  label: isOvernightTrip ? 'See why unavailable' : 'Check lot rules',
                  onClick: () => {
                    setShowParkRideReason((v) => !v);
                  },
                };
              }

              return {
                label: 'View details',
                onClick: () => scrollToBestSection('provider-links-section'),
              };
            };

            return (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                      Smart recommendation
                    </div>
                    <h2 className="mt-3 max-w-4xl text-xl font-bold leading-tight text-slate-950">
                      {recommendedTitle}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                      {recommendedReason}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-sm text-slate-700 sm:min-w-52">
                    <div className="text-xs font-semibold uppercase text-sky-800">
                      Leave-by
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-950">
                      {recommendation.leaveByTime
                        ? formatTimeFriendly(recommendation.leaveByTime)
                        : 'Check timing'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Includes airport timing when available
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
                  {modeRows.map((row) => {
                    const selected = row.key === recommendationMode;

                    const action = cardActionFor(row.key);

                    return (
                      <button
                        key={row.key}
                        type="button"
                        onClick={action.onClick}
                        className={
                          'cursor-pointer rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ' +
                          (row.unavailable
                            ? 'border-zinc-200 bg-zinc-100/80 opacity-75'
                            : selected
                              ? 'border-blue-300 bg-blue-50/80'
                              : 'border-zinc-200 bg-white')
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-2xl">{row.icon}</div>
                          <span
                            className={
                              'rounded-full px-2.5 py-1 text-xs font-semibold ' +
                              (row.unavailable
                                ? 'bg-zinc-200 text-zinc-600'
                                : selected
                                  ? 'bg-blue-600 text-white'
                                  : row.verdict === 'Avoid' || row.verdict === 'Unavailable'
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-zinc-100 text-zinc-700')
                            }
                          >
                            {row.verdict}
                          </span>
                        </div>

                        <div className="mt-3 text-sm font-bold text-zinc-950">
                          {row.label}
                        </div>

                        <div className="mt-1 line-clamp-2 text-sm text-zinc-700">
                          {row.name}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl bg-white/80 p-2">
                            <div className="text-zinc-500">Cost</div>
                            <div className="mt-0.5 font-semibold text-zinc-950">
                              {row.cost}
                            </div>
                          </div>
                          <div className="rounded-xl bg-white/80 p-2">
                            <div className="text-zinc-500">Time</div>
                            <div className="mt-0.5 font-semibold text-zinc-950">
                              {row.time}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 inline-flex text-xs font-semibold text-blue-700">
                          {action.label} →
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                  {isOvernightTrip ? (
                    <>
                      <span className="font-semibold text-zinc-950">Overnight trip detected:</span>{' '}
                      {showParkRideReason && (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                          <div className="font-semibold">
                            Why Park & Ride is unavailable for this trip
                          </div>
                          <div className="mt-1">
                            This trip appears to require overnight parking. Most Park & Ride lots are meant for
                            same-day commuter use, and PodPaiGo should not recommend leaving your car overnight
                            unless the lot has verified overnight parking rules.
                          </div>
                          <div className="mt-2 text-xs text-amber-800">
                            Safer choices: use airport/off-airport parking, rideshare, taxi, or a verified overnight parking provider.
                          </div>
                        </div>
                      )}
                    </>
                  ) : cheapestMode && fastestMode ? (
                    <>
                      <span className="font-semibold text-zinc-950">Quick read:</span>{' '}
                      Cheapest is {cheapestMode.label} around ${Math.round(cheapestMode.cost)}.
                      Fastest is {fastestMode.label} around {formatMinutes(fastestMode.minutes)}.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-zinc-950">Quick read:</span>{' '}
                      Some live route or price data is missing, so confirm final pricing before booking.
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </section>

        {/* Edit panel */}
        {
          isEditing && editingData && (
            <div id="edit-trip-panel" className="mt-6 rounded-3xl border border-sky-100 bg-white/95 p-4 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Edit trip details</h2>
                  <p className="mt-1 text-sm text-zinc-600">Adjust your timing or origin. We’ll recalculate instantly.</p>
                </div>
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="text-sm font-medium text-blue-700 hover:text-blue-800"
                >
                  Close
                </button>
              </div>

              {isEditing && editingData && (
                <section
                  ref={editTripRef}
                  className={
                    'scroll-mt-6 rounded-3xl border bg-white p-4 shadow-sm transition-all duration-300 sm:p-6 ' +
                    (editTripJustOpened
                      ? 'border-blue-400 shadow-[0_0_0_4px_rgba(37,99,235,0.15)]'
                      : 'border-zinc-200')
                  }
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-950">Edit trip</h2>
                      <p className="mt-1 text-sm text-zinc-600">
                        Update your trip details and recalculate recommendations.
                      </p>
                    </div>
                  </div>

                  <EditTripForm
                    initialData={editingData}
                    isSubmitting={isRecalculating || loading}
                    onSubmit={(data) => {
                      recommendationsLoadedKeyRef.current = '';
                      setFetchError(null);
                      setIsRecalculating(true);
                      setLoading(true);

                      const params = tripDataToSearchParams(data, {
                        intent: intent || searchParams.get('intent') || 'flying-out',
                        preserve: new URLSearchParams(searchParams.toString()),
                      });

                      setIsEditing(false);
                      setEditingData(null);

                      router.replace(buildResultsPathFromSearchParams(params));
                    }}
                    onCancel={() => {
                      setIsEditing(false);
                      setEditingData(null);
                    }}
                    intent={intent}
                    airportCode={(editingData as TripDataWithExtras).airportCode || getTripAirportCode(editingData)}
                  />
                </section>
              )}
            </div>
          )
        }

        {/* Sort */}
        <div className="mt-6">
          <SortTabs value={sort} onChange={setSort} />
        </div>

        {recommendation.accessStrategies?.options?.some((option) => option.isHiddenGem) ? (
          <HiddenAccessOptionsSection
            options={recommendation.accessStrategies.options.filter((option) => option.isHiddenGem)}
          />
        ) : null}

        {process.env.NODE_ENV === 'development' &&
        getTripAirportCode(tripData) === 'SEA' &&
        !recommendation.accessStrategies?.options?.some((option) => option.isHiddenGem) ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <div className="font-semibold">SEA curated access diagnostic</div>
            <div className="mt-1">
              API returned no curated hidden access options for SEA. Confirm{' '}
              <code className="rounded bg-white px-1">SEA_CURATED_ACCESS=1</code> in{' '}
              <code className="rounded bg-white px-1">.env.local</code> and restart the dev server.
            </div>
          </div>
        ) : null}

        {
          showParkingProviders && parkingDisplayOptions.length > 0 && !airportRouteUnavailable && (
            <div id="parking-options-section" className="mt-6 scroll-mt-6">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-bold">
                  {allParkingRoutesUnavailable
                    ? `Parking options near ${currentAirport.id}`
                    : 'Parking options'}
                </h2>
              </div>

              {allParkingRoutesUnavailable && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  Parking lots near {currentAirport.id} are shown for reference, but route timing is unavailable from your current origin.
                </div>
              )}

              {smartPickParkingOptions.length > 0 && (
                <ParkingSmartPick
                  options={cheapestSmartPickOptions.map((p) => googleEnrichedParking[p.id] || p)}
                  tripData={tripData}
                  leaveByTime={airportRouteUnavailable ? null : recommendation.leaveByTime}
                  selectedOption={
                    smartPickOption
                      ? googleEnrichedParking[smartPickOption.id] || smartPickOption
                      : smartPickOption
                  }
                  aprLivePrices={aprLivePrices}
                  aprLiveChecking={aprLiveChecking}
                  weatherImpact={recommendation?.weatherImpact}
                  weatherContext={recommendation?.weatherContext}
                  onShowReviews={handleShowReviews}
                  googleEnrichedParking={googleEnrichedParking}
                />
              )}
              <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:bottom-5">
                {/* Show Parking Lots Map */}
                <div className="flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/90 p-1.5 shadow-[0_12px_35px_rgba(15,23,42,0.18)] backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setShowMapModal(true)}
                    className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98]"
                  >
                    <span className="text-base leading-none">🗺️</span>
                    <span>Map</span>
                  </button>

                  {/* Show Airport Indoor Map */}
                  <button
                    type="button"
                    onClick={() => setShowAirportGuideModal(true)}
                    className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98]"
                  >
                    <span className="text-base leading-none">✈️</span>
                    <span>Airport</span>
                  </button>
                </div>
              </div>

              {showMapModal && (
                <div
                  className="fixed inset-0 z-[100] overscroll-none bg-black/50 p-3 sm:p-6"
                  onWheel={(event) => event.stopPropagation()}
                  onTouchMove={(event) => event.stopPropagation()}
                >
                  <div className="mx-auto flex h-full max-h-[calc(100dvh-1.5rem)] max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">

                    {/* Header */}
                    <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Parking map</div>
                        <div className="text-xs text-zinc-500">
                          You are viewing lots around {currentAirport.id}
                          {tripData?.origin ? ` · from ${tripData.origin}` : ''}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowMapModal(false)}
                        className="cursor-pointer rounded-full border px-3 py-1 text-sm"
                      >
                        Close
                      </button>
                    </div>

                    {/* Map */}
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <ParkingLotsMap
                        airportCode={tripData?.airportCode}
                        originAddress={tripData?.origin}
                        parkingOptions={recommendation.parking}
                        selectedParkingId={selectedParkingId}
                        onSelectParking={setSelectedParkingId}
                      />
                    </div>

                  </div>
                </div>
              )}

              {showAirportGuideModal && (
                <div className="fixed inset-0 z-[100] bg-black/50 p-3 sm:p-6">
                  <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                    <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Airport map</div>
                        <div className="text-xs text-zinc-500">
                          {currentAirport.id} · Official terminal map and airport guidance
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowAirportGuideModal(false)}
                        className="cursor-pointer rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                      >
                        Close
                      </button>
                    </div>

                    <div className="flex-1 overflow-hidden">
                      <AirportTerminalMap
                        airportCode={currentAirportCode}
                        airlineOrFlight={airlineOrFlight}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        }

        {/* Options */}
        <div className="mt-4 grid grid-cols-1 gap-4">
          {sortedOptions.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="text-base font-semibold text-zinc-900">Transit-only route not reliable yet from this origin</div>
              <div className="mt-2 text-sm text-zinc-600">
                Live transit routing is not connected yet, so we can’t reliably generate a transit-only route here.
              </div>
              <div className="mt-4 text-sm text-zinc-700">
                {transportAvailability === 'transit' ? (
                  <ul className="list-disc space-y-1 pl-5">
                    <li>If you can use rideshare/taxi, switch to “I need rideshare/taxi”.</li>
                    <li>If driving is okay, switch to “Driving is okay” to see park-and-ride options.</li>
                    <li>Or choose “No preference — compare everything” to compare all available modes.</li>
                  </ul>
                ) : (
                  <div>Try adjusting your trip details and recalculating.</div>
                )}
              </div>
            </div>
          ) : noViableFlyingOut ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="text-base font-semibold text-zinc-900">No viable options for this flight time</div>
              <div className="mt-2 text-sm text-zinc-600">
                Based on your airport timing settings, every option arrives after the recommended inside-airport arrival window.
              </div>

              {(() => {
                const summary = bestTooLateSummary;
                if (!summary) return null;

                return (
                  <div className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700">
                    <div>
                      Flight departs:{' '}
                      <span className="font-medium">
                        {formatTimeFriendly(summary.flightDeparts)}
                      </span>
                    </div>
                    <div className="mt-1">
                      Recommended inside-airport arrival by:{' '}
                      <span className="font-medium">
                        {formatTimeFriendly(summary.recommendedBy)}
                      </span>
                    </div>
                    <div className="mt-1">
                      Best available arrival:{' '}
                      <span className="font-medium">
                        {formatTimeFriendly(summary.bestArrival)}
                      </span>
                    </div>
                    <div className="mt-1">
                      Missed safe leave time by:{' '}
                      <span className="font-medium">
                        {formatMinutes(summary.shortByMinutes)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setSort('fastest');
                    setShowTooLate(true);
                    setTimeout(() => {
                      const el = document.querySelector('#high-risk-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 50);
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Show fastest rideshare
                </button>

                <button
                  type="button"
                  onClick={() => {
                    startEditing();
                    setTimeout(() => {
                      const el = document.querySelector('#edit-trip-panel');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 50);
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Edit airport timing
                </button>

                <button
                  type="button"
                  onClick={() => setShowTooLate(true)}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Show too-late options
                </button>

                <Link
                  href="/trip"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Start new trip
                </Link>
              </div>

              {tooLateOptions.length > 0 && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setShowTooLate((v) => !v)}
                    className="text-sm font-medium text-blue-700 hover:text-blue-800"
                  >
                    {showTooLate ? 'Hide too-late options' : 'Show too-late options'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {displayableRemainingParking.length > 0 && !airportRouteUnavailable && (
                <section id="more-parking-options-section" className="mt-8 scroll-mt-6">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-900">
                        More parking options
                      </h2>
                      <p className="mt-1 text-sm text-zinc-600">
                        Additional live and baseline parking choices.
                      </p>
                    </div>

                    {!airportRouteUnavailable && canShowMoreParking && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleParkingCount((current) =>
                            Math.min(
                              current + PARKING_SHOW_MORE_INCREMENT,
                              displayableRemainingParking.length,
                            ),
                          )
                        }
                        className="text-sm font-medium text-blue-700 hover:text-blue-800"
                      >
                        {`Show ${nextParkingShowMoreCount} more parking option${
                          nextParkingShowMoreCount === 1 ? '' : 's'
                        }`}
                      </button>
                    )}
                  </div>

                  {airportRouteUnavailable ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                      <div className="font-semibold">
                        Parking options are not usable from this origin
                      </div>
                      <p className="mt-2">
                        Your starting location appears to be too far from the selected airport area,
                        so we cannot calculate a real route to these parking lots. Try entering an
                        origin near the airport, or choose rideshare, taxi, transit, or another
                        transportation option.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {displayedParking.map((opt, idx) => (
                        <OptionCard
                          aprLivePrices={aprLivePrices}
                          aprLiveChecking={aprLiveChecking}
                          key={`parking-reachable-${opt.type}-${(opt.option as AppOption).id || idx}`}
                          item={opt}
                          rank={idx + 1}
                          tripData={tripData}
                          intent={intent}
                          sort={sort}
                          onShowReviews={handleShowReviews}
                          googleEnrichedParking={googleEnrichedParking}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {airportRouteUnavailable && (
                <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <h2 className="text-lg font-semibold text-amber-950">
                    Parking options are unavailable from this origin
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-amber-900">
                    We could not calculate a real route from your starting location to this airport area.
                    Because of that, parking recommendations and leave-by timing are not reliable for this trip.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-amber-900">
                    Try entering an origin near the airport, or choose rideshare, taxi, or another transportation option.
                  </p>
                </section>
              )}

              {intent === 'flying-out' && tripData.type === 'one-way-departure' && tooLateOptions.length > 0 && viableOptions.length > 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowTooLate((v) => !v)}
                    className="text-sm font-medium text-blue-700 hover:text-blue-800"
                  >
                    {showTooLate ? 'Hide too-late options' : 'Show too-late options'}
                  </button>
                </div>
              )}

              {showTooLate && intent === 'flying-out' && tripData.type === 'one-way-departure' && tooLateOptions.length > 0 && (
                <div id="high-risk-section" className="mt-2">
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <div className="text-base font-semibold text-red-900">High risk timing for this flight</div>
                    <div className="mt-1 text-sm text-red-800">These options likely arrive after the recommended inside-airport arrival window.</div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-4">
                    {tooLateOptions.map((opt, idx) => (
                      <OptionCard
                        aprLivePrices={aprLivePrices}
                        aprLiveChecking={aprLiveChecking}
                        key={`too-late-${opt.type}-${(opt.option as AppOption).id || idx}`}
                        item={opt}
                        rank={idx + 1}
                        tripData={tripData}
                        intent={intent}
                        sort={sort}
                        onShowReviews={handleShowReviews}
                        googleEnrichedParking={googleEnrichedParking}
                      />
                    ))}
                  </div>
                  {airportReadiness && tripData?.timeAnchor === 'flight-departure' && (
                    <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <div className="text-sm font-semibold text-zinc-900">
                        Airport readiness
                      </div>

                      <div className="mt-1 text-2xl font-bold text-zinc-900">
                        {formatMiniMinutes(airportReadiness.bufferMinutes)} before departure
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {airportReadiness.assumptions.map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {tripData?.timeAnchor === 'airport-arrival' && (
                    <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                      You entered your target airport arrival time, so we are not subtracting extra airport readiness time.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Pricing links */}
        {!airportRouteUnavailable &&
          <div id="provider-links-section" className="mt-8 grid scroll-mt-6 grid-cols-1 items-start gap-4 lg:grid-cols-2">
            {showRideProviders && (
              <ProviderDropdownSection
                title="Ride providers"
                subtitle="Compare estimated fares and provider links."
                items={rideProviderItems}
                defaultOpen={openProviderSection === 'ride'}
              />
            )}

            <ProviderDropdownSection
              title="Transit options"
              subtitle="Compare route planning, fares, confidence, and links."
              items={[...(transitOptions), ...extraTransitProviders]}
              defaultOpen={openProviderSection === 'transit'}
              transitPayment={(tripData as TripDataWithExtras | null)?.transitPayment}
              footerContent={
                <TransitParkAndRideCards
                  isOvernightTrip={isOvernightAirportParkingTrip(tripData)}
                  options={
                    recommendation.accessStrategies?.options?.filter(
                      (option) =>
                        option.strategyType === 'park_and_ride_transit' && !option.isHiddenGem,
                    ) ?? []
                  }
                />
              }
            />

            <ParkingReviewsModal
              parking={reviewsParking}
              open={!!reviewsParking}
              onClose={() => setReviewsParking(null)}
              airportCode={getTripAirportCode(tripData)}
              onResolvedParking={(parking) => {
                if (reviewsParking) {
                  mergeGooglePlaceResultIntoParking(reviewsParking, parking);
                }
              }}
            />
          </div>
        }

        <div className="mt-10 flex justify-center">
          <Link
            href="/trip"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Plan another trip
          </Link>
        </div>
      </main >
    </div >
  );
}

function EditTripForm({
  initialData,
  onSubmit,
  onCancel,
  intent,
  airportCode,
  isSubmitting = false,
}: {
  initialData: TripData;
  onSubmit: (data: TripData) => void;
  onCancel: () => void;
  intent: string;
  airportCode: string;
  isSubmitting?: boolean;
}) {
  const [origin, setOrigin] = useState(initialData.origin);
  const [selectedAirportCode, setSelectedAirportCode] = useState(
    ((airportCode || (initialData as TripDataWithExtras).airportCode || 'SEA')).toUpperCase()
  );

  useEffect(() => {
    setSelectedAirportCode(
      (airportCode || (initialData as TripDataWithExtras).airportCode || 'SEA').toUpperCase()
    );
  }, [airportCode, initialData]);

  const [transportAvailability, setTransportAvailability] = useState<TransportAvailability>(
    initialData.transportAvailability || 'all'
  );

  const [transitPayment, setTransitPayment] = useState<'normal' | 'orca-pass'>(
    (initialData as TripDataWithExtras).transitPayment || 'normal'
  );

  const showAirportTimingControls = intent === 'flying-out' && initialData.type === 'one-way-departure';

  const [checkingBags, setCheckingBags] = useState<boolean>(!!(initialData as TripDataWithExtras).checkingBags);
  const [securityOption, setSecurityOption] = useState<SecurityOption>(((initialData as TripDataWithExtras).securityOption || 'standard') as SecurityOption);
  const [flightType, setFlightType] = useState<FlightType>(((initialData as TripDataWithExtras).flightType || 'domestic') as FlightType);
  const [cabin, setCabin] = useState<CabinClass>(((initialData as TripDataWithExtras).cabin || 'economy') as CabinClass);

  const [parkingDurationHours] = useState(
    'parkingDuration' in initialData && initialData.parkingDuration
      ? String(Math.round((initialData.parkingDuration / 60) * 10) / 10)
      : ''
  );

  const [departureDate, setDepartureDate] = useState(
    'departureDate' in initialData ? initialData.departureDate : ''
  );
  const [departureTime, setDepartureTime] = useState(
    'departureTime' in initialData ? initialData.departureTime : ''
  );

  const [parkingCheckOutDate, setParkingCheckOutDate] = useState(
    (initialData as TripDataWithExtras).parkingCheckOutDate || ''
  );

  const [parkingCheckOutTime] = useState(
    (initialData as TripDataWithExtras).parkingCheckOutTime || ''
  );

  const [airportTripDate, setAirportTripDate] = useState(
    'airportTripDate' in initialData ? initialData.airportTripDate : ''
  );
  const [airportTripTime, setAirportTripTime] = useState(
    'airportTripTime' in initialData ? initialData.airportTripTime : ''
  );

  const [arrivalDate, setArrivalDate] = useState(
    'arrivalDate' in initialData ? initialData.arrivalDate : ''
  );
  const [arrivalTime, setArrivalTime] = useState(
    'arrivalTime' in initialData ? initialData.arrivalTime : ''
  );

  const [returnDate, setReturnDate] = useState(
    'returnDate' in initialData ? initialData.returnDate : ''
  );
  const [returnTime, setReturnTime] = useState(
    'returnTime' in initialData ? initialData.returnTime : ''
  );

  const [errors, setErrors] = useState<string[]>([]);

  const isDeparture = initialData.type === 'one-way-departure';
  const isDropoffPickup = initialData.type === 'dropoff-pickup';
  const isArrival = initialData.type === 'one-way-arrival';
  const isRoundTrip = initialData.type === 'round-trip';

  const validate = (): string[] => {
    const next: string[] = [];
    const now = new Date();

    if (!origin.trim()) next.push('Origin is required.');

    const validateCombinedDateTime = (dateString: string, timeString: string, label: string) => {
      if (!dateString) {
        next.push(`${label} date is required.`);
        return;
      }
      if (!timeString) {
        next.push(`${label} time is required.`);
        return;
      }

      const combined = new Date(`${dateString}T${timeString}`);
      if (isNaN(combined.getTime())) {
        next.push(`Invalid ${label.toLowerCase()} date or time.`);
        return;
      }

      // Past date OR today-but-past-time are both caught here.
      if (combined.getTime() < now.getTime()) {
        next.push(`${label} time cannot be in the past.`);
      }
    };

    if (initialData.type === 'one-way-departure') {
      validateCombinedDateTime(departureDate, departureTime, 'Trip');
    }

    if (initialData.type === 'dropoff-pickup') {
      validateCombinedDateTime(airportTripDate, airportTripTime, 'Trip');
    }

    if (initialData.type === 'one-way-arrival') {
      validateCombinedDateTime(arrivalDate, arrivalTime, 'Trip');
    }

    if (initialData.type === 'round-trip') {
      // Validate both legs relative to now.
      validateCombinedDateTime(departureDate, departureTime, 'Departure');
      validateCombinedDateTime(returnDate, returnTime, 'Return');

      // Validate ordering if both parse.
      if (departureDate && departureTime && returnDate && returnTime) {
        const dep = new Date(`${departureDate}T${departureTime}`);
        const ret = new Date(`${returnDate}T${returnTime}`);
        if (!isNaN(dep.getTime()) && !isNaN(ret.getTime()) && ret.getTime() < dep.getTime()) {
          next.push('Return date must be after departure date.');
        }
      }
    }

    if ((isDeparture || isRoundTrip) && parkingCheckOutDate) {
      const checkInDate = departureDate;
      const checkInTime = departureTime || '12:00';
      const checkOutTime = parkingCheckOutTime || departureTime || '12:00';

      const checkIn = new Date(`${checkInDate}T${checkInTime}`);
      const checkOut = new Date(`${parkingCheckOutDate}T${checkOutTime}`);

      if (!isNaN(checkIn.getTime()) && !isNaN(checkOut.getTime())) {
        if (checkOut.getTime() < checkIn.getTime()) {
          next.push('Parking check-out must be after parking check-in.');
        }
      }
    }

    if (parkingDurationHours) {
      const hours = Number(parkingDurationHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        next.push('Parking duration must be a positive number of hours.');
      }
    }

    return next;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (next.length > 0) return;

    // Clear any stale errors once we're submitting a valid recalculation.
    setErrors([]);

    let parkingDuration = parkingDurationHours
      ? Math.round(Number(parkingDurationHours) * 60)
      : undefined;

    if ((isDeparture || isRoundTrip) && parkingCheckOutDate) {
      const checkInDate = departureDate;
      const checkInTime = departureTime || '12:00';
      const checkOutTime = parkingCheckOutTime || departureTime || '12:00';

      const checkIn = new Date(`${checkInDate}T${checkInTime}`);
      const checkOut = new Date(`${parkingCheckOutDate}T${checkOutTime}`);

      if (!isNaN(checkIn.getTime()) && !isNaN(checkOut.getTime())) {
        parkingDuration = Math.max(
          24 * 60,
          Math.round((checkOut.getTime() - checkIn.getTime()) / 60000)
        );
      }
    }

    const selectedAirport = getAirportById(selectedAirportCode) || getAirportById('SEA')!;
    const destination = selectedAirport.routingAddress || selectedAirport.destinationName;

    let data: TripData;

    if (initialData.type === 'general-trip') {
      data = {
        type: 'general-trip',
        origin,
        destination: destination || initialData.destination,
        destinationKind: initialData.destinationKind || 'general',
        destinationName: initialData.destinationName || destination || initialData.destination,
        arrivalDate,
        arrivalTime,
        parkingDuration: parkingDuration ?? initialData.parkingDuration,
        parkingCheckInDate: arrivalDate,
        parkingCheckInTime: arrivalTime,
        transportAvailability,
        transitPayment,
      };
    } else if (initialData.type === 'one-way-departure') {
      data = {
        type: initialData.type,
        origin,
        destination,
        airportCode: selectedAirport.id,
        destinationKind: 'airport',
        departureDate,
        departureTime,
        timeAnchor: (initialData as TripDataWithExtras).timeAnchor || 'flight-departure',
        parkingDuration,
        parkingCheckInDate: departureDate,
        parkingCheckOutDate: parkingCheckOutDate || undefined,
        transportAvailability,
        checkingBags: showAirportTimingControls ? checkingBags : (initialData as TripDataWithExtras).checkingBags,
        securityOption: showAirportTimingControls ? securityOption : (initialData as TripDataWithExtras).securityOption,
        flightType: showAirportTimingControls ? flightType : (initialData as TripDataWithExtras).flightType,
        cabin: showAirportTimingControls ? cabin : (initialData as TripDataWithExtras).cabin,
        checkedInAtAirport: (initialData as TripDataWithExtras).checkedInAtAirport,
        transitPayment,
      };
    } else if (initialData.type === 'dropoff-pickup') {
      data = {
        type: initialData.type,
        origin,
        destination,
        airportTripDate,
        airportTripTime,
        transportAvailability,
        airportCode: selectedAirport.id,
        destinationKind: 'airport',
        transitPayment,
      };
    } else if (initialData.type === 'one-way-arrival') {
      data = {
        type: initialData.type,
        origin,
        destination,
        arrivalDate,
        arrivalTime,
        transportAvailability,
        airportCode: selectedAirport.id,
        destinationKind: 'airport',
        transitPayment,
      };
    } else {
      data = {
        type: 'round-trip',
        origin,
        destination,
        airportCode: selectedAirport.id,
        destinationKind: 'airport',
        departureDate,
        departureTime,
        returnDate,
        returnTime,
        parkingDuration,
        transportAvailability,
        transitPayment,
      };
    }

    onSubmit(data);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-sm font-medium text-red-900">Please fix:</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div className="sm:col-span-2">
            <AirportSearchPicker
              value={selectedAirportCode}
              onChange={(airportCode) => {
                setSelectedAirportCode(airportCode.toUpperCase());
              }}
            />
          </div>
          <div className="text-sm font-medium text-zinc-900">What can you use today?</div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                { key: 'car' as const, title: 'Driving is okay', sub: 'Prioritize parking and park-and-ride options, but still compare other strong choices.' },
                { key: 'rideshare' as const, title: 'I need rideshare/taxi', sub: 'Shows Uber, Lyft, taxi, and non-car transit where available.' },
                { key: 'transit' as const, title: 'Transit only', sub: 'No car or rideshare.' },
                { key: 'all' as const, title: 'No preference — compare everything', sub: 'Show car, rideshare, taxi, transit, parking, and park-and-ride.' },
              ] as Array<{ key: TransportAvailability; title: string; sub: string }>
            ).map((opt) => {
              const selected = transportAvailability === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTransportAvailability(opt.key)}
                  className={
                    'w-full rounded-2xl border p-4 text-left shadow-sm transition ' +
                    (selected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50')
                  }
                >
                  <div className="text-sm font-semibold text-zinc-900">{opt.title}</div>
                  <div className="mt-1 text-xs text-zinc-600">{opt.sub}</div>
                </button>
              );
            })}
          </div>
          {(transportAvailability === 'all' || transportAvailability === 'transit') && (
            <TransitPaymentPicker
              value={transitPayment}
              onChange={setTransitPayment}
              className="mt-4"
            />
          )}
        </div>

        {showAirportTimingControls && (
          <div className="sm:col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-medium text-zinc-900">Airport timing</div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm font-medium text-zinc-800">Checking bags?</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckingBags(false)}
                    className={
                      'rounded-xl border px-3 py-2 text-sm font-medium ' +
                      (!checkingBags
                        ? 'border-blue-500 bg-blue-50 text-zinc-900'
                        : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                    }
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckingBags(true)}
                    className={
                      'rounded-xl border px-3 py-2 text-sm font-medium ' +
                      (checkingBags
                        ? 'border-blue-500 bg-blue-50 text-zinc-900'
                        : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                    }
                  >
                    Yes
                  </button>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-zinc-800">Flight type</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFlightType('domestic')}
                    className={
                      'rounded-xl border px-3 py-2 text-sm font-medium ' +
                      (flightType === 'domestic'
                        ? 'border-blue-500 bg-blue-50 text-zinc-900'
                        : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                    }
                  >
                    Domestic
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlightType('international')}
                    className={
                      'rounded-xl border px-3 py-2 text-sm font-medium ' +
                      (flightType === 'international'
                        ? 'border-blue-500 bg-blue-50 text-zinc-900'
                        : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                    }
                  >
                    International
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2">
                <div className="text-sm font-medium text-zinc-800">Security option</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      { key: 'standard' as const, label: 'Standard TSA' },
                      { key: 'precheck' as const, label: 'TSA PreCheck' },
                      { key: 'clear' as const, label: 'CLEAR' },
                      { key: 'clear-precheck' as const, label: 'CLEAR + PreCheck' },
                    ] as Array<{ key: SecurityOption; label: string }>
                  ).map((opt) => {
                    const selected = securityOption === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setSecurityOption(opt.key)}
                        className={
                          'rounded-xl border px-3 py-2 text-left text-sm font-medium ' +
                          (selected
                            ? 'border-blue-500 bg-blue-50 text-zinc-900'
                            : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2">
                <div className="text-sm font-medium text-zinc-800">Cabin (optional)</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCabin('economy')}
                    className={
                      'rounded-xl border px-3 py-2 text-sm font-medium ' +
                      (cabin === 'economy'
                        ? 'border-blue-500 bg-blue-50 text-zinc-900'
                        : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                    }
                  >
                    Economy
                  </button>
                  <button
                    type="button"
                    onClick={() => setCabin('premium')}
                    className={
                      'rounded-xl border px-3 py-2 text-sm font-medium ' +
                      (cabin === 'premium'
                        ? 'border-blue-500 bg-blue-50 text-zinc-900'
                        : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                    }
                  >
                    Premium/Business/First
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="sm:col-span-2">
          <AddressInput
            label="Origin"
            value={origin}
            onChange={setOrigin}
            placeholder="Start typing your address"
          />
        </div>

        {isDeparture && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Date</label>
              <input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">
                Return / parking check-out date
                <span className="ml-1 text-xs font-normal text-zinc-500">Optional</span>
              </label>
              <input
                type="date"
                value={parkingCheckOutDate}
                onChange={(e) => setParkingCheckOutDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Time</label>
              <input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

          </>
        )}

        {isDropoffPickup && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Date</label>
              <input
                type="date"
                value={airportTripDate}
                onChange={(e) => setAirportTripDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Time</label>
              <input
                type="time"
                value={airportTripTime}
                onChange={(e) => setAirportTripTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </>
        )}

        {isArrival && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Date</label>
              <input
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Time</label>
              <input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </>
        )}

        {isRoundTrip && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Departure date</label>
              <input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Departure time</label>
              <input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Return date</label>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Return time</label>
              <input
                type="time"
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? 'Recalculating…' : 'Recalculate'}
        </button>
      </div>
    </form>
  );
}
