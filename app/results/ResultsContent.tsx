'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  rankRecommendations,
  sortRankedRecommendations,
  RecommendationSortMode,
  calculateParkingDuration,
  formatTransitCostDisplay,
  getTransitTripTotalCost,
} from '../../lib/domain';
import { RankedRecommendation } from '../../lib/domain';
import AirlineLookupPanel from '../components/AirlineLookupPanel';
import AirportTripCard from '../components/AirportTripCard';
import DestinationParkingSummary from '../components/DestinationParkingSummary';
import { filterParkingOptionsByFeatures } from '../../lib/parking/parkingFilters';
import { getVisibleParkingFeatureBadges } from '../../lib/parking/featureConfidence';
import {
  getParkingComparableCost,
  getParkingTotalTimeMinutes,
  parkingRankEvidenceLabel,
  sortParkingOptionsForMode,
} from '../../lib/parking/sortParkingOptions';
import {
  businessTravelModeNeedsParking,
  readTravelPreferences,
  type TripTravelPreferences,
} from '../../lib/trip/travelPreferences';
import TravelPreferencesPanel from '../components/TravelPreferencesPanel';
import { isQuickGoMode, mergeStoredTripSearchParams } from '../../lib/trip/quickGo';
import QuickGoResultsView from '../components/QuickGoResultsView';
import RouteLookaheadPanel from '../components/RouteLookaheadPanel';
import PodPaiGoAssistant from '../components/PodPaiGoAssistant';
import { useAuth } from '../components/AuthProvider';
import ParkingProviderActions from './ParkingProviderActions';
import { PROVIDER_LINKS } from '../../lib/providerCatalog';
import { AddressInput } from '../trip/AddressInput';
import { getAirportById } from '../../lib/airports/catalog';
import AirportSearchPicker from '../components/AirportSearchPicker';
import ParkingSmartPick from './ParkingSmartPick';
import { withAprLivePrice, getAprLivePrice } from '../../lib/parking/aprLivePrice';
import { formatMinutes, parkingKeySafe, parkingTimeBreakdown } from '../../lib/parking/routeDisplay';
import { buildParkingDriveContextFromOption } from '../../lib/parking/routeMinutes';
import { getParkingRouteCoordinates } from '../../lib/parking/parkingCoordinates';
import { getParkingTimeSummaryTitle, getParkingTransferLinkLabel } from '../../lib/parking/parkingLabels';
import { isCityDestinationTrip, resolveTripParkingContext, shouldDiscoverParkingForTrip } from '../../lib/trip/tripContext';
import { parseLocalDate } from '../../lib/tripTime';
import { googleMapsSearchLink, googleMapsDirectionsLink } from '../../lib/maps';
import ParkingLotsMap from './ParkingLotsMap';
import AirportTerminalMap from './AirportTerminalMap';
import ParkingLotVisual from './ParkingLotVisual';
import { calculateAirportReadinessBuffer } from '../../lib/airports/airportReadiness';
import { resolveBagPlan } from '../../lib/airports/bagPlan';
import type { AirportDayTransportMode } from '../../lib/airports/airportDayTimeline';
import { parseFlightInput } from '../../lib/airlines/parseFlightInput';
import {
  parkingPriceLine,
  getParkingTotalPrice,
} from '../../lib/parking/priceDisplay';
import { resolveParkingPriceTrust } from '../../lib/parking/priceTrust';
import {
  buildParkingProviderHandoff,
  formatParkingHandoffDuration,
} from '../../lib/parking/providerHandoff';
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
import { RIDESHARE_ESTIMATE_DISCLAIMER, formatRidesharePriceDisplay } from '../../lib/rideshare/estimate';

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
  BagPlan,
  TransportAvailability,
  Recommendation,
  TripData,
  TrustStatus,
  ParkingOption,
  RideshareEstimateConfidence,
  TransitPaymentOption,
  ParkingPreference,
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
import {
  formatParkingWindowSummary,
  hasCustomParkingWindow,
  resolveParkingWindow,
} from '../../lib/trip/parkingWindow';
import SaveAccountTripButton from '../components/SaveAccountTripButton';
import { isPodPaiGoDebugUIEnabled } from '../../lib/utils/debug';
import { trackEvent } from '../../lib/analytics/trackEvent';
import {
  getTransitPassAppliedBadge,
  getTransitPassCoveredLabel,
  resolveTransitPaymentRegionContext,
} from '../../lib/transit/transitPaymentLabels';

type PriceableOption = {
  id?: string;
  name: string;
  price?: number;
  priceDisplay?: PriceDisplay;
  priceUnit?: PriceUnit;
  priceNote?: string;
  priceMin?: number;
  priceMax?: number;
  oneWayPriceMin?: number;
  oneWayPriceMax?: number;
  rideshareTripScope?: 'one-way' | 'round-trip';
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
  parkingCheckInTime?: string;
  parkingCheckOutDate?: string;
  parkingCheckOutTime?: string;
  timeAnchor?: 'flight-departure' | 'airport-arrival';
  transitPayment?: TransitPaymentOption;
  parkingPreference?: ParkingPreference;
  checkingBags?: boolean;
  bagPlan?: BagPlan;
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

function formatParkingPartMinutes(part: { label: string; minutes: number; display?: string }): string {
  if (part.display) return part.display;
  return formatMiniMinutes(part.minutes);
}

function parkingTimeParts(option: ParkingOption, tripContext = resolveTripParkingContext({ type: 'one-way-departure', destinationKind: 'airport' })) {
  const breakdown = parkingTimeBreakdown(
    option,
    buildParkingDriveContextFromOption(option),
    tripContext,
  );
  return {
    total: breakdown.totalMinutes,
    parts: breakdown.parts,
  };
}

function isJiffyParkingLot(option: Pick<ParkingOption, 'name'>): boolean {
  return option.name.toLowerCase().includes('jiffy');
}

function ParkingRouteDebugPanel({
  option,
  googleMapsUrl,
}: {
  option: ParkingOption;
  googleMapsUrl?: string | null;
}) {
  if (!isPodPaiGoDebugUIEnabled() || !isJiffyParkingLot(option)) {
    return null;
  }

  const routeCoords = getParkingRouteCoordinates(option);
  const debug = option.parkingRouteDebug;

  if (process.env.DEBUG_LOGS === 'true') {
    console.log('[Jiffy parking route debug]', {
      name: option.name,
      address: option.address,
      providerLat: option.providerLat,
      providerLng: option.providerLng,
      canonicalLat: option.canonicalLat ?? routeCoords.lat,
      canonicalLng: option.canonicalLng ?? routeCoords.lng,
      googlePlaceId: option.googlePlaceId,
      coordinateSource: option.coordinateSource,
      originToParkingMinutes: option.originToParkingMinutes,
      routeToParkingMinutes: option.routeToParkingMinutes,
      routesApiDestination: debug?.routesApiDestination,
      googleMapsUrlDestination: debug?.googleMapsUrlDestination ?? googleMapsUrl,
      routesUsedCanonicalCoords: option.routesUsedCanonicalCoords,
      routeTargetLat: option.routeTargetLat,
      routeTargetLng: option.routeTargetLng,
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-[11px] leading-relaxed text-violet-950">
      <div className="mb-1 font-semibold uppercase tracking-wide text-violet-700">
        Jiffy route debug (temporary)
      </div>
      <dl className="grid gap-1 sm:grid-cols-2">
        <div><dt className="font-medium">name</dt><dd className="font-mono">{option.name}</dd></div>
        <div><dt className="font-medium">address</dt><dd className="font-mono">{option.address || '—'}</dd></div>
        <div><dt className="font-medium">providerLat/Lng</dt><dd className="font-mono">{option.providerLat ?? '—'}, {option.providerLng ?? '—'}</dd></div>
        <div><dt className="font-medium">canonicalLat/Lng</dt><dd className="font-mono">{option.canonicalLat ?? routeCoords.lat ?? '—'}, {option.canonicalLng ?? routeCoords.lng ?? '—'}</dd></div>
        <div><dt className="font-medium">googlePlaceId</dt><dd className="font-mono break-all">{option.googlePlaceId || '—'}</dd></div>
        <div><dt className="font-medium">coordinateSource</dt><dd className="font-mono">{option.coordinateSource || '—'}</dd></div>
        <div><dt className="font-medium">originToParkingMinutes</dt><dd className="font-mono">{option.originToParkingMinutes ?? '—'}</dd></div>
        <div><dt className="font-medium">routeToParkingMinutes</dt><dd className="font-mono">{option.routeToParkingMinutes ?? '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="font-medium">Routes API destination</dt><dd className="font-mono break-all">{debug?.routesApiDestination || '—'}</dd></div>
        <div className="sm:col-span-2"><dt className="font-medium">Google Maps URL destination</dt><dd className="font-mono break-all">{debug?.googleMapsUrlDestination ?? googleMapsUrl ?? '—'}</dd></div>
      </dl>
    </div>
  );
}

function ParkingTimeSummary({
  option,
  compact = false,
  routeUnavailable = false,
  tripContext = 'airport_trip',
}: {
  option: ParkingOption;
  compact?: boolean;
  routeUnavailable?: boolean;
  tripContext?: ReturnType<typeof resolveTripParkingContext>;
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

  const breakdown = parkingTimeParts(option, tripContext);

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
            {part.label} {formatParkingPartMinutes(part)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs font-medium text-zinc-500">
          {getParkingTimeSummaryTitle(tripContext)}
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
            {part.label} {formatParkingPartMinutes(part)}
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

function ridesharePriceDisplay(option: AppOption): { primary: string; secondary: string | null } {
  return formatRidesharePriceDisplay(option);
}

function ridesharePricePrimary(option: AppOption): string | null {
  return ridesharePriceDisplay(option).primary;
}

function ridesharePriceSecondary(option: AppOption): string | null {
  return ridesharePriceDisplay(option).secondary;
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
  if (context === 'current-destination-weather') return 'Current destination weather';
  if (context === 'forecast-unavailable') return 'Forecast not available yet';
  return 'Weather unavailable';
}

function weatherSectionDetail(context?: WeatherContext): string {
  if (context === 'forecast-unavailable') {
    return 'Forecast becomes available closer to your trip.';
  }

  if (context === 'current-airport-weather') {
    return 'Showing current conditions because a valid travel time was not provided.';
  }

  if (context === 'current-destination-weather') {
    return 'Showing current destination conditions because a valid travel time was not provided.';
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
      return 'Check provider';
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
          <div className="font-medium">Check provider</div>
          <div className="text-xs text-zinc-600">Estimated anchor only; provider controls final price</div>
        </div>
      </div>
    </div>
  );
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

function ParkingBookingHelperPanel({
  option,
  tripData,
  providerUrl,
}: {
  option: ParkingOption;
  tripData: TripData | null;
  providerUrl?: string | null;
}) {
  const handoff = buildParkingProviderHandoff(option, tripData, providerUrl);
  const window = handoff.window;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="font-semibold text-slate-950">Booking helper</div>
          <div className="mt-1 text-xs text-slate-600">
            {handoff.providerUrlSupportsPrefill
              ? 'Open provider and verify these selected times before checkout.'
              : 'Open provider and enter these times.'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void copyText(handoff.copySummary)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
        >
          Copy times
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-slate-500">Lot</dt>
          <dd className="font-semibold text-slate-900">{handoff.lotName}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Provider</dt>
          <dd className="font-semibold text-slate-900">{handoff.providerName}</dd>
        </div>
        {window ? (
          <>
            <div>
              <dt className="text-xs font-medium text-slate-500">Check-in</dt>
              <dd className="font-semibold text-slate-900">
                {window.checkInDate} {window.checkInTime}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Check-out</dt>
              <dd className="font-semibold text-slate-900">
                {window.checkOutDate} {window.checkOutTime}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Parking duration</dt>
              <dd className="font-semibold text-slate-900">
                {formatParkingHandoffDuration(window.durationMinutes)}
              </dd>
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-slate-500">Parking window</dt>
            <dd className="font-semibold text-slate-900">Check selected trip dates/times</dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-medium text-slate-500">Vehicle assumption</dt>
          <dd className="font-semibold text-slate-900">Standard passenger vehicle unless provider asks otherwise</dd>
        </div>
      </dl>
    </div>
  );
}

function ParkingBookingHelperModal({
  option,
  tripData,
  providerUrl,
  directionsUrl,
  onClose,
}: {
  option: ParkingOption;
  tripData: TripData | null;
  providerUrl?: string | null;
  directionsUrl?: string | null;
  onClose: () => void;
}) {
  const handoff = buildParkingProviderHandoff(option, tripData, providerUrl);
  const handoffWindow = handoff.window;
  const priceTrust = resolveParkingPriceTrust(option, tripData);
  const openUrl = handoff.providerUrl || providerUrl || null;

  const openProvider = () => {
    if (!openUrl) return;
    globalThis.window.open(openUrl, '_blank', 'noopener,noreferrer');
  };

  const openDirections = () => {
    if (!directionsUrl) return;
    globalThis.window.open(directionsUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-slate-950">Booking helper</div>
            <div className="mt-1 text-sm text-slate-600">
              Provider controls final price. Confirm exact times at checkout.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-500">Lot</dt>
            <dd className="font-semibold text-slate-950">{handoff.lotName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Provider</dt>
            <dd className="font-semibold text-slate-950">{handoff.providerName}</dd>
          </div>
          {handoffWindow ? (
            <>
              <div>
                <dt className="text-xs font-medium text-slate-500">Check-in</dt>
                <dd className="font-semibold text-slate-950">
                  {handoffWindow.checkInDate} {handoffWindow.checkInTime}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Check-out</dt>
                <dd className="font-semibold text-slate-950">
                  {handoffWindow.checkOutDate} {handoffWindow.checkOutTime}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Parking duration</dt>
                <dd className="font-semibold text-slate-950">
                  {formatParkingHandoffDuration(handoffWindow.durationMinutes)}
                </dd>
              </div>
            </>
          ) : (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500">Parking window</dt>
              <dd className="font-semibold text-slate-950">Check selected trip dates/times</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium text-slate-500">Vehicle assumption</dt>
            <dd className="font-semibold text-slate-950">Standard passenger vehicle</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-slate-500">Price trust</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${priceTrust.badgeClassName}`}>
                {priceTrust.label}
              </span>
              <span className="text-sm text-slate-700">{priceTrust.disclosure}</span>
            </dd>
          </div>
        </dl>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Final price may change based on exact check-in/check-out time, vehicle size, taxes, fees, and provider availability.
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void copyText(handoff.copySummary)}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Copy parking times
          </button>
          <button
            type="button"
            onClick={openDirections}
            disabled={!directionsUrl}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open directions
          </button>
          <button
            type="button"
            onClick={openProvider}
            disabled={!openUrl}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open provider
          </button>
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
  tripData,
}: {
  title: string;
  items: ProviderLinkItem[];
  transitPayment?: TransitPaymentOption;
  tripData?: TripData | null;
}) {
  if (!items || items.length === 0) return null;

  const isRideSection = title.toLowerCase().includes('ride');
  const isTransitSection = title.toLowerCase().includes('transit');
  const transitPassContext = resolveTransitPaymentRegionContext({
    airportCode: tripData?.airportCode ?? getTripAirportCode(tripData ?? null),
  });

  return (
    <div className="divide-y divide-slate-100 bg-white">
      {items.map((it: ProviderLinkItem) => {
        const trust = confidenceFromTrust((it.trustStatus || 'estimated') as TrustStatus);
        const rideshareConfidence = rideshareConfidenceMeta(it.rideshareEstimateConfidence);
        const ridesharePricing = isRideSection
          ? ridesharePriceDisplay(it as AppOption)
          : null;
        const price = formatProviderPrice(it);
        const link = bestLink(it);
        const kind = it.priceDisplay as string | undefined;

        const isTransitUtility =
          isTransitSection &&
          (it.id === 'soundtransit-planner' || it.id === 'google-maps-transit');

        const transitPriceDisplay =
          isTransitSection && tripData && typeof it.price === 'number' && !isTransitUtility
            ? formatTransitCostDisplay(it as TransitOption, tripData)
            : null;

        const shouldShowPrice = !isTransitUtility;

        const shouldShowPriceKindBadge =
          kind && !(isTransitSection && kind === 'check-live');

        const primaryPrice =
          isTransitSection && transitPayment === 'orca-pass'
            ? '$0'
            : transitPriceDisplay
              ? transitPriceDisplay.primary
              : isRideSection
                ? ridesharePricing?.primary || `Est. ${it.priceRangeLabel || formatMoney(it.price || 0)}`
                : price.primary;

        const secondaryPrice =
          isTransitSection && transitPayment === 'orca-pass'
            ? getTransitPassCoveredLabel(transitPassContext)
            : transitPriceDisplay?.secondary
              ? transitPriceDisplay.secondary
              : isRideSection
                ? ridesharePricing?.secondary || RIDESHARE_ESTIMATE_DISCLAIMER
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

        if (isRideSection) {
          return (
            <div key={it.id || it.name} className="px-3 py-3 sm:px-5 sm:py-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-sky-200 hover:shadow-md sm:p-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sm font-bold text-slate-900 ring-1 ring-sky-100 sm:h-12 sm:w-12">
                    {providerIcon(it.name)}
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="text-base font-semibold leading-snug text-zinc-900">
                      {it.name}
                    </div>

                    {primaryPrice ? (
                      <div className="text-lg font-bold leading-snug text-zinc-900">
                        {primaryPrice}
                      </div>
                    ) : null}

                    {secondaryPrice && ridesharePricing?.secondary ? (
                      <div className="text-sm font-medium leading-snug text-zinc-600">
                        {secondaryPrice}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      {rideshareConfidence && (
                        <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + rideshareConfidence.className}>
                          {rideshareConfidence.label}
                        </span>
                      )}
                      <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + trust.className}>
                        {trust.label}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-zinc-500">
                      {RIDESHARE_ESTIMATE_DISCLAIMER}
                    </p>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
        }

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

                        {isTransitSection && transitPriceDisplay ? (
                          <div className="text-xs font-medium text-zinc-500">
                            {transitPayment === 'orca-pass'
                              ? getTransitPassAppliedBadge(transitPassContext)
                              : transitPriceDisplay.includesReturnLeg
                                ? 'round-trip fare estimate'
                                : 'one-way fare estimate'}
                          </div>
                        ) : null}

                        {isTransitSection && !transitPriceDisplay && typeof it.price === 'number' ? (
                          <div className="text-xs font-medium text-zinc-500">
                            {transitPayment === 'orca-pass'
                              ? getTransitPassAppliedBadge(transitPassContext)
                              : 'fare estimate'}
                          </div>
                        ) : null}

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

  const readiness = calculateAirportReadinessBuffer({
    bagPlan: 'bagPlan' in tripData ? tripData.bagPlan : undefined,
    checkingBags: 'checkingBags' in tripData ? !!tripData.checkingBags : false,
    securityOption:
      'securityOption' in tripData && tripData.securityOption
        ? tripData.securityOption
        : 'standard',
    flightType:
      'flightType' in tripData && tripData.flightType ? tripData.flightType : 'domestic',
    cabin: 'cabin' in tripData && tripData.cabin ? tripData.cabin : 'economy',
  });

  return {
    bufferMinutes: readiness.bufferMinutes,
    assumptions: readiness.assumptions,
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

  if (
    !Number.isFinite(optionTotalMinutes) ||
    optionTotalMinutes <= 0 ||
    optionTotalMinutes > 12 * 60
  ) {
    return {
      status: 'n/a',
      assumptions: ['Open directions to confirm timing.'],
    };
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
  const isSameLocalDate = tripData.departureDate === todayLocal;
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

  if (!isSameLocalDate && latestSafeLeaveDt.getTime() < now.getTime()) {
    return {
      status: 'n/a',
      flightDeparts: isAirportArrivalAnchor ? undefined : tripData.departureTime,
      recommendedInsideArrivalBy: formatHHMMFromDate(recommendedInsideArrivalByDt),
      optionTravelMinutes: optionTotalMinutes,
      assumptions: ['Open directions to confirm timing.'],
      debug: {
        departureDate: tripData.departureDate,
        departureTime: tripData.departureTime,
        departureLocal: depDt.toString(),
        recommendedInsideArrivalByLocal: recommendedInsideArrivalByDt.toString(),
        latestSafeLeaveISO: latestSafeLeaveDt.toISOString(),
        latestSafeLeaveLocal: latestSafeLeaveDt.toString(),
        nowISO: now.toISOString(),
        nowLocal: now.toString(),
        cushionMinutes: null,
        isFutureDate,
      },
    };
  }

  if (depDt.getTime() > now.getTime() && latestSafeLeaveDt.getTime() < now.getTime()) {
    return {
      status: 'n/a',
      flightDeparts: isAirportArrivalAnchor ? undefined : tripData.departureTime,
      recommendedInsideArrivalBy: formatHHMMFromDate(recommendedInsideArrivalByDt),
      optionTravelMinutes: optionTotalMinutes,
      assumptions: ['Open directions to confirm timing.'],
      debug: {
        departureDate: tripData.departureDate,
        departureTime: tripData.departureTime,
        departureLocal: depDt.toString(),
        recommendedInsideArrivalByLocal: recommendedInsideArrivalByDt.toString(),
        latestSafeLeaveISO: latestSafeLeaveDt.toISOString(),
        latestSafeLeaveLocal: latestSafeLeaveDt.toString(),
        nowISO: now.toISOString(),
        nowLocal: now.toString(),
        cushionMinutes: null,
        isFutureDate,
      },
    };
  }

  const missedBy = Math.max(0, Math.ceil((now.getTime() - latestSafeLeaveDt.getTime()) / 60000));

  const status: TimingStatus =
    missedBy > 0
      ? 'too-late'
      : minutesUntilLeaveBy <= 15
        ? 'tight'
        : 'good';

  const youReachTerminalAroundDt =
    missedBy > 0
      ? new Date(now.getTime() + optionTotalMinutes * 60000)
      : new Date(latestSafeLeaveDt.getTime() + optionTotalMinutes * 60000);

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
  accessToken,
  tripId,
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
  accessToken?: string | null;
  tripId?: string | null;
}) {
  const [bookingHelperOpen, setBookingHelperOpen] = useState(false);
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

  const sourceLink =
    item.type === 'parking'
      ? trustedParkingBookingLink(opt)
      : opt.sourceLink || null;

  const parkingProviderHandoff =
    item.type === 'parking'
      ? buildParkingProviderHandoff(opt as ParkingOption, tripData, sourceLink)
      : null;
  const parkingProviderUrl = parkingProviderHandoff?.providerUrl ?? sourceLink;

  const displayParkingOption =
    item.type === 'parking'
      ? (googleEnrichedParking?.[opt.id || ''] || opt) as ParkingOption
      : null;

  const parkingTripContext = tripData ? resolveTripParkingContext(tripData) : 'airport_trip';

  const parkingRoutes =
    displayParkingOption
      ? parkingRouteLinks(displayParkingOption, tripData)
      : null;

  const routeUnavailable =
    item.type === 'parking' &&
    (isParkingRouteUnavailable(opt as ParkingOption) || !tripData?.origin);

  const parkingLotRouteLink = routeUnavailable ? null : parkingRoutes?.routeToParkingUrl || null;
  const parkingToTerminalRouteLink =
    routeUnavailable || parkingTripContext !== 'airport_trip'
      ? null
      : parkingRoutes?.parkingToAirportUrl || null;
  const parkingToDestinationRouteLink =
    routeUnavailable || parkingTripContext !== 'city_destination_trip'
      ? null
      : parkingRoutes?.parkingToDestinationUrl || null;
  const parkingTransferLinkLabel = parkingRoutes?.transferLinkLabel || getParkingTransferLinkLabel(parkingTripContext);

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
    item.type === 'parking' && displayParkingOption
      ? parkingTimeBreakdown(
          displayParkingOption,
          buildParkingDriveContextFromOption(displayParkingOption),
          parkingTripContext,
        )
      : null;

  const parkingPrice =
    item.type === 'parking' && normalizedParkingOption
      ? parkingPriceLine(normalizedParkingOption, tripData)
      : null;

  const parkingPriceTrust =
    item.type === 'parking' && normalizedParkingOption
      ? resolveParkingPriceTrust(normalizedParkingOption, tripData)
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

  const isRideshareCard = item.type === 'rideshare';
  const ridesharePricing = isRideshareCard ? ridesharePriceDisplay(opt) : null;

  const nonParkingPrice =
    item.type === 'rideshare'
      ? ridesharePricing?.primary || visiblePrice.primary
      : typeof opt.price === 'number' && opt.price > 0
        ? `${opt.priceDisplay === 'estimated' ? 'Est. ' : ''}${formatMoney(opt.price)}`
        : visiblePrice.primary;

  return (
    <>
    <div
      id={`option-${item.type}-${String(opt?.id || rank)}`}
      className={
        'rounded-3xl border bg-white/95 p-4 shadow-sm shadow-sky-900/5 transition hover:border-sky-200 sm:p-5 ' +
        (!routeUnavailable && timing.status === 'too-late' ? 'border-red-200' : 'border-zinc-200')
      }
    >
      {item.type === 'parking' && displayParkingOption && (
        <div className="mb-4">
          <ParkingLotVisual
            option={displayParkingOption}
            tripContext={parkingTripContext}
            airportCode={airportCode}
          />
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          {isRideshareCard ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold leading-tight text-slate-950 sm:text-lg">
                  {opt.name}
                </div>
                {!compact && (
                  <div className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                    {typeLabel(item.type)}
                  </div>
                )}
                {rank === 1 &&
                  sort === 'easiest' &&
                  timing.status !== 'too-late' && (
                    <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      Recommended
                    </div>
                  )}
              </div>

              <div className="text-lg font-bold text-zinc-900">
                {ridesharePricing?.primary || nonParkingPrice}
              </div>

              {ridesharePricing?.secondary ? (
                <div className="text-sm font-medium text-zinc-600">
                  {ridesharePricing.secondary}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + (rideshareConfidenceMeta(opt.rideshareEstimateConfidence)?.className || trust.className)}>
                  Estimated
                </span>
                <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + trust.className}>
                  {trust.label}
                </span>
                {timingMeta && (
                  <div className={"rounded-full border px-2.5 py-1 text-xs font-medium " + timingMeta.className}>
                    {timingMeta.label}
                  </div>
                )}
              </div>

              <p className="text-xs text-zinc-600">
                {RIDESHARE_ESTIMATE_DISCLAIMER}
              </p>
            </div>
          ) : (
            <>
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

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {item.type !== 'rideshare' && (
                <div className={"rounded-full border px-2.5 py-1 text-xs font-medium " + trust.className}>
                  {trust.label}
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

              {parkingPriceTrust ? (
                <div className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${parkingPriceTrust.badgeClassName}`}>
                  {parkingPriceTrust.label}
                </div>
              ) : null}

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

              {item.type === 'parking' && displayParkingOption
                ? getVisibleParkingFeatureBadges(displayParkingOption).slice(0, 3).map((meta) => (
                    <div
                      key={`${displayParkingOption.id}-${meta.key}-${meta.confidence}`}
                      title={`Source: ${meta.sourceLabel}. Confidence: ${meta.confidence.replace('_', ' ')}.`}
                      className={
                        'rounded-full border px-2.5 py-1 text-xs font-medium ' +
                        (meta.confidence === 'verified'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : meta.confidence === 'provider_claimed'
                            ? 'border-blue-200 bg-blue-50 text-blue-800'
                            : 'border-amber-200 bg-amber-50 text-amber-900')
                      }
                    >
                      {meta.label}
                    </div>
                  ))
                : null}

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
            </>
          )}

          {item.type === 'parking' && routeUnavailable && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
              Route unavailable from this origin to this parking lot. Try a local origin near the airport, rideshare, or another transportation option.
            </div>
          )}

          {item.type === 'parking' && parkingPriceTrust ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950">
              <div className="font-semibold">
                {parkingPriceTrust.kind === 'live_marketplace_price' || parkingPriceTrust.kind === 'live_final_provider_price'
                  ? 'Confirm at checkout'
                  : 'Estimated price only'}
              </div>
              <div className="mt-1">
                {parkingPriceTrust.disclosure}
              </div>
            </div>
          ) : null}

          {item.type === 'parking' && !compact ? (
            <ParkingBookingHelperPanel
              option={(displayParkingOption || (opt as ParkingOption)) as ParkingOption}
              tripData={tripData}
              providerUrl={parkingProviderUrl}
            />
          ) : null}

          {item.type === 'parking' && (
            <ParkingTimeSummary
              option={(displayParkingOption || (opt as ParkingOption)) as ParkingOption}
              compact={compact}
              routeUnavailable={routeUnavailable}
              tripContext={parkingTripContext}
            />
          )}

          {item.type === 'parking' && (() => {
            const parking = opt as ParkingOption;
            const isFreeCommunity =
              parking.providerSource === 'community-free' ||
              parking.sourceName === 'PodPaiGo verified free parking' ||
              parking.validationStatus === 'free';
            if (!isFreeCommunity) return null;

            return (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-950">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold">
                    Free
                  </span>
                  <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold">
                    Verified by PodPaiGo
                  </span>
                  {parking.accessType === 'customer_only' ? (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                      Customer-only
                    </span>
                  ) : null}
                </div>
                {parking.validationNotes ? (
                  <div className="mt-2 font-medium">{parking.validationNotes}</div>
                ) : null}
                {parking.freeParkingNotes ? (
                  <div className="mt-1">{parking.freeParkingNotes}</div>
                ) : null}
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Check signs before leaving your car.</li>
                  {parking.accessType === 'customer_only' ? (
                    <li>Customer-only parking may require shopping or validation.</li>
                  ) : null}
                  <li>Do not assume overnight parking unless verified.</li>
                </ul>
              </div>
            );
          })()}

          {item.type === 'parking' && displayParkingOption && (
            <ParkingRouteDebugPanel
              option={displayParkingOption}
              googleMapsUrl={parkingLotRouteLink}
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
          {item.type === 'parking' ? (
            <ParkingProviderActions
              compact={compact}
              bookingUrl={routeUnavailable ? null : parkingProviderUrl}
              providerUrl={routeUnavailable ? null : parkingProviderUrl}
              directionsUrl={
                routeUnavailable
                  ? null
                  : parkingLotRouteLink || opt.mapLink || null
              }
              searchQuery={opt.searchQuery || safeParkingSearchQuery}
              provider={opt.bookingProvider || opt.sourceName || opt.name}
              airportCode={airportCode}
              parkingLotId={opt.id || null}
              tripId={tripId || null}
              accessToken={accessToken}
              onReserve={() => setBookingHelperOpen(true)}
            />
          ) : compact ? (
            <div className="flex flex-col gap-2">
              {!routeUnavailable && sourceLink && (
                <button
                  type="button"
                  onClick={() =>
                    item.type === 'rideshare'
                      ? window.open(sourceLink, '_blank', 'noopener,noreferrer')
                      : window.open(sourceLink, '_blank', 'noopener,noreferrer')
                  }
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700"
                >
                  {item.type === 'rideshare' &&
                    (opt.id === 'taxi' || String(opt.name || '').toLowerCase().includes('taxi'))
                    ? 'Find taxi'
                    : item.type === 'rideshare'
                      ? 'Open app'
                      : 'View'}
                </button>
              )}

              {routeUnavailable && (
                <div className="max-w-56 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  Route unavailable for this origin/date. Try a different origin or transportation option.
                </div>
              )}
            </div>
          ) : (
            <>
              {sourceLink && !routeUnavailable ? (
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

              {routeUnavailable && (
                <div className="max-w-56 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  Route unavailable for this origin/date. Try a different origin or transportation option.
                </div>
              )}

              {routeLink && (
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

          {item.type === 'parking' && !routeUnavailable && parkingToDestinationRouteLink ? (
            <a
              href={parkingToDestinationRouteLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              {parkingTransferLinkLabel}
            </a>
          ) : null}

          {item.type === 'parking' && parkingToTerminalRouteLink ? (
            <a
              href={parkingToTerminalRouteLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Parking to terminal
            </a>
          ) : null}
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
            {item.type === 'parking' &&
              (opt as ParkingOption).coordinateSource &&
              (opt as ParkingOption).coordinateSource !== 'google_place' && (
                <div className="mt-2 text-xs text-zinc-500">
                  Parking location estimated from provider/address data.
                </div>
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
    {bookingHelperOpen && item.type === 'parking' && displayParkingOption ? (
      <ParkingBookingHelperModal
        option={(displayParkingOption || (opt as ParkingOption)) as ParkingOption}
        tripData={tripData}
        providerUrl={parkingProviderUrl}
        directionsUrl={parkingLotRouteLink || opt.mapLink || null}
        onClose={() => setBookingHelperOpen(false)}
      />
    ) : null}
    </>
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

function uniqueReasons(reasons: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      reasons
        .map((reason) => String(reason || '').trim())
        .filter(Boolean),
    ),
  );
}

function findMatchingRankedParking(
  rankedOptions: RankedRecommendation[],
  parkingOption: ParkingOption,
): RankedRecommendation | null {
  const parkingKey = parkingKeySafe(parkingOption as AppOption);

  return (
    rankedOptions.find((ranked) => {
      const rankedKey = parkingKeySafe(ranked.option as AppOption);
      return rankedKey && parkingKey && rankedKey === parkingKey;
    }) ?? null
  );
}

function rankedParkingCardFromOption(input: {
  option: ParkingOption;
  matchedRanked?: RankedRecommendation | null;
  tripData: TripData | null;
  sort: SortTab;
}): RankedRecommendation {
  const { option, matchedRanked, tripData, sort } = input;
  const routeUnavailable = isParkingRouteUnavailable(option);
  const evidence = parkingRankEvidenceLabel(option, sort, {
    isUnavailable: isParkingRouteUnavailable,
    totalCost: (parking) => getParkingComparableCost(parking, tripData),
    tripData,
  });
  const comparableCost = routeUnavailable
    ? 999999
    : getParkingComparableCost(option, tripData);
  const comparableTime = routeUnavailable
    ? 999999
    : getParkingTotalTimeMinutes(option, tripData);

  return {
    ...(matchedRanked || {
      type: 'parking',
      score: 0,
      stressScore: 0,
      reasons: routeUnavailable
        ? ['Route unavailable from this origin to this parking lot.']
        : ['Available parking option'],
      cost: comparableCost,
      duration: comparableTime,
    }),
    type: 'parking',
    option: withStableParkingRouteStatus(option),
    cost: comparableCost,
    duration: comparableTime,
    reasons: uniqueReasons([
      evidence,
      ...(matchedRanked?.reasons || []),
      routeUnavailable ? parkingRouteUnavailableReason(option) : null,
      !matchedRanked && !routeUnavailable ? 'Available parking option' : null,
    ]),
  } as RankedRecommendation;
}

function sortRankedParkingCardsForMode(input: {
  rankedOptions: RankedRecommendation[];
  tripData: TripData | null;
  sort: SortTab;
}): RankedRecommendation[] {
  const { rankedOptions, tripData, sort } = input;
  const parkingOptions = rankedOptions.map((item) =>
    withStableParkingRouteStatus(item.option as ParkingOption),
  );
  const sortedParking = sortParkingOptionsForMode(parkingOptions, sort, {
    isUnavailable: isParkingRouteUnavailable,
    totalCost: (option) => getParkingComparableCost(option, tripData),
    tripData,
  });

  return sortedParking.map((option) =>
    rankedParkingCardFromOption({
      option,
      matchedRanked: findMatchingRankedParking(rankedOptions, option),
      tripData,
      sort,
    }),
  );
}

function mergeRefreshedParkingOptions(
  existing: ParkingOption[],
  refreshed: ParkingOption[],
): ParkingOption[] {
  const usedRefreshedIndexes = new Set<number>();
  const merged = existing.map((current) => {
    const currentKey = parkingKeySafe(current);
    const matchIndex = refreshed.findIndex((fresh, index) => {
      if (usedRefreshedIndexes.has(index)) return false;
      if (fresh.id && current.id && fresh.id === current.id) return true;

      const freshKey = parkingKeySafe(fresh);
      return Boolean(currentKey && freshKey && currentKey === freshKey);
    });

    if (matchIndex < 0) return withStableParkingRouteStatus(current);

    usedRefreshedIndexes.add(matchIndex);
    return mergeParkingRouteStatus(current, refreshed[matchIndex]!) as ParkingOption;
  });

  for (let index = 0; index < refreshed.length; index += 1) {
    if (usedRefreshedIndexes.has(index)) continue;
    merged.push(withStableParkingRouteStatus(refreshed[index]!));
  }

  return merged;
}

function ProviderDropdownSection({
  title,
  subtitle,
  items,
  defaultOpen = false,
  transitPayment,
  tripData,
  footerContent,
}: {
  title: string;
  subtitle: string;
  items: ProviderLinkItem[];
  defaultOpen?: boolean;
  transitPayment?: TransitPaymentOption;
  tripData?: TripData | null;
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
        tripData={tripData}
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

function localDateTimeParam(date: string | undefined, time: string | undefined): string | undefined {
  if (!date || !time) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  if (!/^\d{2}:\d{2}$/.test(time)) return undefined;
  return `${date}T${time}:00`;
}

function addMinutesToLocalDateTimeParam(value: string | undefined, minutes: number | undefined): string | undefined {
  if (!value || !Number.isFinite(minutes)) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  parsed.setMinutes(parsed.getMinutes() + Number(minutes));
  const time = `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
  return `${formatLocalYYYYMMDD(parsed)}T${time}:00`;
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

type MatchedParkingPriceEntry = {
  price: number;
  priceUnit?: string;
  provider?: string;
  sourceLink?: string;
};

type SmartPickParkingBundles = {
  smartPickParkingOptions: ParkingOption[];
  cheapestSmartPickOptions: ParkingOption[];
};

type AirportCompanionCardData = {
  transportMode: AirportDayTransportMode;
  transportModeLabel: string | null;
  travelMinutes: number | null;
  shuttleWalkMinutes: number | null;
  bookingUrl: string | null;
  directionsUrl: string | null;
  bagPlan: BagPlan;
  returnDate: string | null;
};

function computeSmartPickParkingBundles(input: {
  recommendation: Recommendation;
  tripData: TripData;
  sort: SortTab;
  sortedOptions: RankedRecommendation[];
  aprLivePrices: Record<string, number>;
  matchedParkingPrices: Record<string, MatchedParkingPriceEntry>;
}): SmartPickParkingBundles {
  const { recommendation, tripData, sort, sortedOptions, aprLivePrices, matchedParkingPrices } =
    input;

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
      bestFor: [...(aprUpdated.bestFor || []), 'Live Price'],
    } as ParkingOption) as ParkingOption;
  });

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

  const sortedParkingForCurrentTab = sortRankedParkingCardsForMode({
    rankedOptions: parkingOptionsWithAprPrices,
    tripData,
    sort,
  });

  const smartPickParkingOptions = (() => {
    const options = sortedParkingForCurrentTab.map((opt) => opt.option as ParkingOption);

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

  const cheapestSmartPickOptions = smartPickParkingOptions;

  return { smartPickParkingOptions, cheapestSmartPickOptions };
}

export default function ResultsContent({ storedSearchParams }: ResultsContentProps = {}) {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const routeSearchParams = useSearchParams();
  const routeSearchParamsString = routeSearchParams.toString();
  const searchParams = useMemo(
    () => mergeStoredTripSearchParams(storedSearchParams, routeSearchParamsString),
    [routeSearchParamsString, storedSearchParams],
  );
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
  const [showParkingAnyway, setShowParkingAnyway] = useState(false);
  const [travelPreferences, setTravelPreferences] = useState<TripTravelPreferences>(() =>
    typeof window === 'undefined' ? { businessTravelMode: 'standard', parkingFilters: {} } : readTravelPreferences(),
  );

  useEffect(() => {
    setTravelPreferences(readTravelPreferences());
  }, []);

  useEffect(() => {
    if (businessTravelModeNeedsParking(travelPreferences.businessTravelMode)) {
      setShowParkingAnyway(false);
    }
  }, [travelPreferences.businessTravelMode]);

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

    const canonicalLat = enriched.canonicalLat ?? enriched.lat ?? merged.canonicalLat ?? base.canonicalLat;
    const canonicalLng = enriched.canonicalLng ?? enriched.lng ?? merged.canonicalLng ?? base.canonicalLng;
    const coordinateSource =
      enriched.coordinateSource ?? merged.coordinateSource ?? base.coordinateSource;

    const routeTargetLat = base.routeTargetLat ?? merged.routeTargetLat;
    const routeTargetLng = base.routeTargetLng ?? merged.routeTargetLng;
    const canonicalCoordsChanged =
      coordinateSource === 'google_place' &&
      typeof canonicalLat === 'number' &&
      typeof canonicalLng === 'number' &&
      typeof routeTargetLat === 'number' &&
      typeof routeTargetLng === 'number' &&
      (Math.abs(canonicalLat - routeTargetLat) > 0.01 ||
        Math.abs(canonicalLng - routeTargetLng) > 0.01);

    const gainedGooglePlaceCoords =
      coordinateSource === 'google_place' &&
      base.coordinateSource !== 'google_place' &&
      typeof canonicalLat === 'number' &&
      typeof canonicalLng === 'number';

    const staleDriveMinutes =
      canonicalCoordsChanged ||
      gainedGooglePlaceCoords ||
      (coordinateSource === 'google_place' && base.routesUsedCanonicalCoords !== true);

    const driveContext = staleDriveMinutes
      ? {}
      : {
          originToParkingMinutes:
            merged.originToParkingMinutes ?? base.originToParkingMinutes,
          routeToParkingMinutes:
            merged.routeToParkingMinutes ?? base.routeToParkingMinutes,
          driveMinutes: merged.driveMinutes ?? base.driveMinutes,
          duration: merged.duration ?? base.duration,
        };

    return {
      ...merged,
      ...driveContext,
      providerLat: base.providerLat ?? merged.providerLat ?? enriched.providerLat,
      providerLng: base.providerLng ?? merged.providerLng ?? enriched.providerLng,
      canonicalLat,
      canonicalLng,
      canonicalAddress: enriched.canonicalAddress ?? merged.canonicalAddress ?? base.canonicalAddress,
      coordinateSource,
      lat: canonicalLat ?? enriched.lat ?? merged.lat ?? base.lat,
      lng: canonicalLng ?? enriched.lng ?? merged.lng ?? base.lng,
      googlePlaceId: enriched.googlePlaceId ?? merged.googlePlaceId ?? base.googlePlaceId,
      parkingRouteDebug: enriched.parkingRouteDebug ?? merged.parkingRouteDebug ?? base.parkingRouteDebug,
      routesUsedCanonicalCoords: staleDriveMinutes
        ? undefined
        : merged.routesUsedCanonicalCoords ?? base.routesUsedCanonicalCoords,
      routeTargetLat: staleDriveMinutes ? undefined : routeTargetLat,
      routeTargetLng: staleDriveMinutes ? undefined : routeTargetLng,
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
    if (!shouldDiscoverParkingForTrip(tripData)) return;
    if (isCityDestinationTrip(tripData)) return;
    const airportCode = isCityDestinationTrip(tripData) ? null : getTripAirportCode(tripData);

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
    if (isCityDestinationTrip(tripData)) return;

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
      bagPlan: tripData.bagPlan,
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
  const airlineDisplay = useMemo(() => {
    if (!airlineOrFlight.trim()) return '';
    return parseFlightInput(airlineOrFlight).normalizedLabel || airlineOrFlight;
  }, [airlineOrFlight]);
  const intent = searchParams.get('intent') || '';



  const initialSort = (() => {
    const sortParam = searchParams.get('sort');
    return sortParam === 'cheapest' || sortParam === 'fastest' || sortParam === 'easiest'
      ? sortParam
      : 'easiest';
  })();

  const [sort, setSort] = useState<SortTab>(initialSort);
  const resultsViewedTracked = useRef(false);
  const lastRecalcTrackedKey = useRef<string | null>(null);
  const lastParkingCardTrackedId = useRef<string | null>(null);

  useEffect(() => {
    if (resultsViewedTracked.current) return;
    resultsViewedTracked.current = true;
    trackEvent('results_viewed', {
      accessToken,
      eventProperties: {
        airportCode: searchParams.get('airportCode') || searchParams.get('airport') || undefined,
        intent: searchParams.get('intent') || undefined,
        tripType: searchParams.get('type') || undefined,
      },
    });
  }, [accessToken, searchParams]);

  useEffect(() => {
    if (!selectedParkingId || selectedParkingId === lastParkingCardTrackedId.current) return;
    lastParkingCardTrackedId.current = selectedParkingId;
    trackEvent('parking_card_viewed', {
      accessToken,
      eventProperties: {
        lotId: selectedParkingId,
        airportCode: tripData?.airportCode || searchParams.get('airportCode') || undefined,
      },
    });
  }, [accessToken, selectedParkingId, searchParams, tripData?.airportCode]);

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

  const handleSortChange = (next: SortTab) => {
    if (next !== sort) {
      trackEvent('sort_changed', {
        accessToken,
        eventProperties: { sort: next },
      });
    }
    setSort(next);
  };

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
          if (lastRecalcTrackedKey.current !== requestKey) {
            lastRecalcTrackedKey.current = requestKey;
            trackEvent('recommendation_recalculated', {
              accessToken,
              eventProperties: {
                airportCode: data.airportCode || undefined,
                tripType: data.type,
              },
            });
          }
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

  const isCityTrip = Boolean(tripData && isCityDestinationTrip(tripData));
  const cityDestinationText =
    tripData?.type === 'general-trip'
      ? tripData.destinationName || tripData.destination
      : tripData?.destination || '';
  const currentAirportCode = isCityTrip
    ? ''
    : ((tripData as TripDataWithExtras)?.airportCode || searchParams.get('airport') || 'SEA').toUpperCase();

  const currentAirport = getAirportById(currentAirportCode) || getAirportById('SEA')!;
  const displayDestination = isCityTrip
    ? cityDestinationText || 'General trip'
    : currentAirport.label;
  const tripBadgeLabel = isCityTrip ? 'General trip' : searchParams.get('airport') || currentAirportCode || 'SEA';
  const scrollToParkingOptions = () => {
    document.getElementById('parking-options-section')?.scrollIntoView({ behavior: 'smooth' });
  };
  const airportRouteUnavailable =
    Boolean(recommendation?.airportRouteUnavailable) ||
    Boolean(recommendation?.trafficEstimate?.routeUnavailable);
  const routeUnavailableBlocksParking = airportRouteUnavailable && !isCityTrip;

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
    const destination = isCityTrip
      ? cityDestinationText || tripData?.destination || ''
      : currentAirport.routingAddress || `${currentAirport.label} airport`;
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
  }, [cityDestinationText, currentAirport, currentAirportCode, isCityTrip, tripData?.destination, tripData?.origin]);

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
          targetDateTime: buildWeatherTargetDateTime(item.date, item.time),
        });
        if (
          tripData.type === 'general-trip' &&
          typeof tripData.destinationLat === 'number' &&
          typeof tripData.destinationLng === 'number'
        ) {
          params.set('lat', String(tripData.destinationLat));
          params.set('lng', String(tripData.destinationLng));
        } else {
          params.set('airport', airportCode);
        }

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
    if (!shouldDiscoverParkingForTrip(tripData)) return;
    if (loading || !recommendationsLoadedKeyRef.current) return;
    if (recommendationRouteUnavailableForRefresh) return;

    const tripExtras = tripData as TripDataWithExtras;
    const refreshDateTime =
      tripData.type === 'general-trip'
        ? localDateTimeParam(tripData.arrivalDate, tripData.arrivalTime)
        : tripData.type === 'one-way-departure'
          ? localDateTimeParam(tripData.departureDate, tripData.departureTime)
          : tripData.type === 'round-trip'
            ? localDateTimeParam(tripData.departureDate, tripData.departureTime)
            : undefined;
    const checkInAt =
      tripExtras.parkingCheckInDate && tripExtras.parkingCheckInTime
        ? localDateTimeParam(tripExtras.parkingCheckInDate, tripExtras.parkingCheckInTime)
        : refreshDateTime;
    const checkOutAt =
      tripExtras.parkingCheckOutDate && tripExtras.parkingCheckOutTime
        ? localDateTimeParam(tripExtras.parkingCheckOutDate, tripExtras.parkingCheckOutTime)
        : tripData.type === 'general-trip' && tripData.parkingDuration
          ? addMinutesToLocalDateTimeParam(checkInAt, tripData.parkingDuration)
          : undefined;
    const body = {
      airportCode: isCityDestinationTrip(tripData) ? undefined : getTripAirportCode(tripData),
      origin: tripData.origin,
      destination: tripData.destination,
      destinationKind: tripData.destinationKind ?? 'airport',
      destinationLat: tripData.destinationLat,
      destinationLng: tripData.destinationLng,
      dateTime: refreshDateTime,
      parkingDurationMinutes: calculateParkingDuration(tripData),
      checkInDate: tripExtras.parkingCheckInDate,
      checkOutDate: tripExtras.parkingCheckOutDate,
      checkInAt,
      checkOutAt,
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
              parking: mergeRefreshedParkingOptions(prev.parking, refreshed),
              parkingDataStatus: 'available',
              parkingDataMessage: undefined,
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
    if (isCityDestinationTrip(tripData)) return;

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

  const { smartPickParkingOptions, cheapestSmartPickOptions } = useMemo(() => {
    if (!recommendation || !tripData) {
      return {
        smartPickParkingOptions: [] as ParkingOption[],
        cheapestSmartPickOptions: [] as ParkingOption[],
      };
    }

    return computeSmartPickParkingBundles({
      recommendation,
      tripData,
      sort,
      sortedOptions,
      aprLivePrices,
      matchedParkingPrices,
    });
  }, [recommendation, tripData, sort, sortedOptions, aprLivePrices, matchedParkingPrices]);

  const smartPickOption = cheapestSmartPickOptions[0] || null;

  const airportCompanionCard = useMemo((): AirportCompanionCardData | null => {
    if (!recommendation || !tripData) return null;

    const isAirportTrip =
      intent === 'flying-out' ||
      tripData.destinationKind === 'airport' ||
      Boolean((tripData as TripDataWithExtras).airportCode);

    if (!isAirportTrip) return null;

    const topOption = viableOptions[0] ?? null;
    const enrichedSmartPick = smartPickOption
      ? googleEnrichedParking[smartPickOption.id] || smartPickOption
      : null;

    let transportMode: AirportDayTransportMode = null;
    let transportModeLabel: string | null = null;
    let travelMinutes: number | null = null;
    let shuttleWalkMinutes: number | null = null;
    let bookingUrl: string | null = null;
    let directionsUrl: string | null = null;

    if (smartPickOption && enrichedSmartPick && !isParkingRouteUnavailable(enrichedSmartPick)) {
      transportMode = 'parking';
      transportModeLabel = 'Parking';
      const breakdown = parkingTimeBreakdown(enrichedSmartPick);
      const drivePart = breakdown.parts.find((part) => part.label === 'Drive to lot');
      travelMinutes = drivePart?.minutes ?? topOption?.duration ?? breakdown.totalMinutes;
      shuttleWalkMinutes = Math.max(0, breakdown.totalMinutes - (drivePart?.minutes ?? 0));
      bookingUrl = enrichedSmartPick.sourceLink ?? null;
      const routeLinks = parkingRouteLinks(enrichedSmartPick, tripData);
      directionsUrl = routeLinks.routeToParkingUrl || enrichedSmartPick.mapLink || null;
    } else if (topOption?.type === 'rideshare') {
      transportMode = 'rideshare';
      transportModeLabel = 'Rideshare / taxi';
      travelMinutes = topOption.duration;
    } else if (topOption?.type === 'transit') {
      transportMode = 'transit';
      transportModeLabel = 'Transit';
      travelMinutes = topOption.duration;
    } else if (topOption?.type === 'parking') {
      transportMode = 'parking';
      transportModeLabel = 'Parking';
      travelMinutes = topOption.duration;
    } else if (recommendation.trafficEstimate?.duration) {
      travelMinutes = recommendation.trafficEstimate.duration;
    }

    const bagPlan =
      tripData.type === 'one-way-departure'
        ? resolveBagPlan({
            bagPlan: tripData.bagPlan,
            checkingBags: tripData.checkingBags,
          })
        : ('none' as BagPlan);

    const returnDate =
      tripData.type === 'round-trip'
        ? tripData.returnDate
        : tripData.type === 'one-way-departure'
          ? (tripData as TripDataWithExtras).parkingCheckOutDate || null
          : null;

    return {
      transportMode,
      transportModeLabel,
      travelMinutes,
      shuttleWalkMinutes,
      bookingUrl,
      directionsUrl,
      bagPlan,
      returnDate,
    };
  }, [
    recommendation,
    tripData,
    intent,
    viableOptions,
    smartPickOption,
    googleEnrichedParking,
  ]);

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

  if (isQuickGoMode(searchParams)) {
    return (
      <QuickGoResultsView
        tripData={tripData}
        recommendation={recommendation}
        rankedOptions={sortedOptions}
        searchParams={searchParams}
      />
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
  const businessMode = travelPreferences.businessTravelMode;
  const tripParkingPreference = (tripData as TripDataWithExtras).parkingPreference;
  const noParkingPreferred =
    tripParkingPreference === 'none' ||
    businessMode === 'expense_rideshare' ||
    businessMode === 'no_parking';
  const showParkingProviders =
    ((!noParkingPreferred && businessTravelModeNeedsParking(businessMode)) || showParkingAnyway) &&
    (transportAvailability === 'car' || transportAvailability === 'all');
  const showRideProviders =
    noParkingPreferred ||
    transportAvailability === 'car' ||
    transportAvailability === 'rideshare' ||
    transportAvailability === 'all';

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
      bagPlan: tripExtras.bagPlan,
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

    const resolvedBagPlan = resolveBagPlan({
      bagPlan: (tripData as TripDataWithExtras).bagPlan,
      checkingBags: !!(tripData as TripDataWithExtras).checkingBags,
    });
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
        `Bag plan: ${resolvedBagPlan === 'none' ? 'No checked bag' : resolvedBagPlan === 'checked' ? 'Checked bag' : 'Oversized / special item'}`,
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

  const sortedParkingForCurrentTab = sortRankedParkingCardsForMode({
    rankedOptions: parkingOptionsWithAprPrices,
    tripData,
    sort,
  });

  const parkingDisplayOptions = (() => {
    const options = sortedParkingForCurrentTab.map((opt) => opt.option as ParkingOption);

    const filteredOptions = filterParkingOptionsByFeatures(
      options,
      travelPreferences.parkingFilters,
    );

    const canonical = canonicalizeParkingOptions(filteredOptions);
    const available = canonical.filter((option) => !isParkingRouteUnavailable(option));
    const unavailable = canonical.filter((option) => isParkingRouteUnavailable(option));

    return [...available, ...unavailable];
  })();
  const visibleSmartPickOption = parkingDisplayOptions[0] || smartPickOption || null;
  const allParkingRoutesUnavailable =
    parkingDisplayOptions.length > 0 &&
    parkingDisplayOptions.every((option) => isParkingRouteUnavailable(option));
  const parkingEmptyStateMessage =
    recommendation.parkingDataStatus === 'unavailable'
      ? recommendation.parkingDataMessage ||
        'Parking data unavailable right now. Try again or open directions.'
      : recommendation.parkingDiscoveryNotice ||
        (recommendation.parkingDataStatus === 'empty'
          ? isCityTrip
            ? 'No parking found near this destination yet.'
            : 'No parking found near this airport yet.'
          : undefined);
  const parkingEmptyStateClass =
    recommendation.parkingDataStatus === 'unavailable'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : 'border-sky-200 bg-sky-50 text-sky-950';

  const reachableParkingDisplayOptions = parkingDisplayOptions;

  const remainingParking = sortRankedParkingCardsForMode({
    rankedOptions: parkingDisplayOptions
      .filter((parkingOption) => parkingOption.id !== visibleSmartPickOption?.id)
      .map((parkingOption) =>
        rankedParkingCardFromOption({
          option: parkingOption,
          matchedRanked: findMatchingRankedParking(sortedParkingForCurrentTab, parkingOption),
          tripData,
          sort,
        }),
      ),
    tripData,
    sort,
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
    const cached = googleEnrichedParking[parking.id];

    if (cached?.googleReviews?.length) {
      setReviewsParking(cached);
      return;
    }

    setReviewsParking(cached || parking);
  }

  return (
    <div className="airport-page-bg flex flex-1 flex-col font-sans">
      <main className="mx-auto w-full max-w-5xl flex-1 px-3 pb-24 pt-6 sm:px-4 sm:pt-8">
        {/* Hero */}
        <div className="travel-card rounded-3xl p-4 sm:p-5">
          {!airportRouteUnavailable && (bestViableLeaveByTime || recommendation.leaveByTime) ? (
            <div className="sticky top-[58px] z-30 -mx-1 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-glass px-3 py-2.5 backdrop-blur lg:hidden">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leave by</span>
              <span className="text-lg font-bold text-primary">
                {formatTimeFriendly(bestViableLeaveByTime || recommendation.leaveByTime || '')}
              </span>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            {/* Left: main decision */}
            <div>
              <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase text-primary">
                {tripBadgeLabel}
              </div>

              <h1 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">
                {routeUnavailableBlocksParking
                  ? 'Route unavailable from this origin'
                  : airportRouteUnavailable && isCityTrip
                    ? 'Drive time unavailable'
                  : noViableFlyingOut
                    ? 'No reliable option gets you airport-ready on time'
                    : intent === 'flying-out' && tripData.type === 'one-way-departure' && bestViableLeaveByTime
                      ? `You should leave at ${formatTimeFriendly(bestViableLeaveByTime)}`
                      : recommendation.leaveByTime
                        ? `You should leave at ${formatTimeFriendly(recommendation.leaveByTime)}`
                        : 'Your best options'}
              </h1>

              {airportRouteUnavailable && (
                <div className="mt-3 rounded-xl border border-warning/25 bg-warning/10 p-3 text-sm text-foreground">
                  <div className="font-semibold">
                    {isCityTrip
                      ? 'Drive time is unavailable for this result.'
                      : 'We could not calculate a real route from your starting location to this destination.'}
                  </div>
                  <div className="mt-1">
                    {isCityTrip
                      ? 'Parking expectations are still shown. Open directions to confirm timing.'
                      : `Try an origin near ${displayDestination}, rideshare/taxi, or another transportation option.`}
                  </div>
                  {airportRouteUnavailableReason && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {airportRouteUnavailableReason}
                    </div>
                  )}
                </div>
              )}

              {noViableFlyingOut && bestTooLateSummary?.bestLatestSafeLeave && bestTooLateSummary?.bestArrival && (
                <div className="mt-2 text-sm text-muted-foreground">
                  Best available attempt leaves at {formatTimeFriendly(bestTooLateSummary.bestLatestSafeLeave)} and reaches terminal around {formatTimeFriendly(bestTooLateSummary.recommendedBy || bestTooLateSummary.bestArrival)}.
                </div>
              )}

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {displayDestination}
                {intent ? ` • ${intent.replace(/-/g, ' ')}` : ''}
                {airlineDisplay ? ` • ${airlineDisplay}` : ''}
              </p>

              {(tripData.type === 'one-way-departure' || tripData.type === 'round-trip') &&
                recommendation.tsaEstimate && (
                  <TsaWaitTimesCard
                    tsaEstimate={recommendation.tsaEstimate}
                    airportCode={tripData?.airportCode}
                    selectedSecurityOption={(tripData as TripDataWithExtras | null)?.securityOption}
                  />
                )}

              <p className="mt-2 text-sm text-muted-foreground">
                {isCityTrip
                  ? airportRouteUnavailable
                    ? 'Route timing is unavailable; destination parking options may still be useful.'
                    : recommendation.trafficEstimate?.trustStatus === 'live'
                      ? 'Live traffic + destination parking analyzed'
                      : 'Estimated route timing + destination parking analyzed'
                  : airportRouteUnavailable
                  ? 'Airport readiness and TSA timing shown only; ground route timing is unavailable.'
                  : recommendation.trafficEstimate?.trustStatus === 'live'
                    ? 'Live traffic + airport timing + parking pricing analyzed'
                    : 'Estimated route timing + airport timing + parking pricing analyzed'}
              </p>

              {aprLiveChecking && parkingPricesChecking && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  Updating provider parking prices…
                </div>
              )}

              {aprLivePartial && !aprLiveChecking && (
                <div className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-foreground">
                  Some provider prices could not be refreshed. Confirm final parking rates before booking.
                </div>
              )}

              {!isCityTrip && airlineOrFlight ? (
                <AirlineLookupPanel
                  airportCode={currentAirportCode}
                  airlineOrFlight={airlineOrFlight}
                  className="mt-3"
                />
              ) : null}
            </div>

            {/* Right: supporting context */}
            <div className="space-y-3 lg:border-l lg:border-border lg:pl-5">
              {isCityTrip && tripData ? (
                <DestinationParkingSummary
                  destination={cityDestinationText}
                  origin={tripData.origin}
                  destinationKind={tripData.destinationKind}
                  airportCode={(tripData as TripDataWithExtras).airportCode}
                  onCheckNearbyParking={scrollToParkingOptions}
                />
              ) : (
                <>
                  <AirportTripCard
                    airportCode={currentAirportCode}
                    airlineOrFlight={airlineOrFlight || null}
                    leaveByTime={
                      airportRouteUnavailable
                        ? null
                        : bestViableLeaveByTime || recommendation.leaveByTime || null
                    }
                    parkingPickName={
                      smartPickOption
                        ? (googleEnrichedParking[smartPickOption.id] || smartPickOption).name
                        : null
                    }
                    bagPlan={
                      airportCompanionCard?.bagPlan ??
                      resolveBagPlan({
                        bagPlan: 'bagPlan' in tripData ? tripData.bagPlan : undefined,
                        checkingBags: 'checkingBags' in tripData ? !!tripData.checkingBags : false,
                      })
                    }
                    checkingBags={
                      'checkingBags' in tripData ? !!tripData.checkingBags : false
                    }
                    transportMode={airportCompanionCard?.transportMode ?? null}
                    transportModeLabel={airportCompanionCard?.transportModeLabel ?? null}
                    travelMinutes={airportCompanionCard?.travelMinutes ?? null}
                    shuttleWalkMinutes={airportCompanionCard?.shuttleWalkMinutes ?? null}
                    departureTime={
                      tripData.type === 'one-way-departure' ? tripData.departureTime : null
                    }
                    airportBufferMinutes={airportReadiness?.bufferMinutes ?? null}
                    bookingUrl={airportCompanionCard?.bookingUrl ?? null}
                    directionsUrl={airportCompanionCard?.directionsUrl ?? null}
                    returnDate={airportCompanionCard?.returnDate ?? null}
                    intent={intent}
                    tripData={tripData}
                  />
                  <RouteLookaheadPanel
                    origin={tripData.origin}
                    destination={
                      currentAirport.routingAddress ||
                      currentAirport.destinationName ||
                      currentAirport.label
                    }
                    destinationLatLng={currentAirport.geoLocation}
                    airportCode={currentAirportCode}
                    departureDate={
                      tripData.type === 'one-way-departure' || tripData.type === 'round-trip'
                        ? tripData.departureDate
                        : null
                    }
                    departureTime={
                      tripData.type === 'one-way-departure' || tripData.type === 'round-trip'
                        ? tripData.departureTime
                        : null
                    }
                    airportBufferMinutes={airportReadiness?.bufferMinutes ?? null}
                    disabled={airportRouteUnavailable || !tripData.origin?.trim()}
                  />
                </>
              )}
              {(recommendation.weatherImpact || recommendation.weatherContext) && (
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/60 p-3 text-sm">
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
                {tripData ? (
                  <SaveAccountTripButton tripData={tripData} intent={intent} />
                ) : null}
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
                {recommendation.trafficEstimate?.trustStatus === 'fallback'
                  ? 'Using cached estimate. Open directions to confirm.'
                  : recommendation.trafficEstimate?.trustStatus === 'estimated'
                    ? 'Using cached estimate'
                    : recommendation.trafficEstimate?.congestion
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

            const transitDuration =
              typeof bestTransit?.duration === 'number' && bestTransit.duration < 999999
                ? bestTransit.duration
                : bestTransitOption?.duration ?? null;

            const hasReliableTransit =
              Boolean(bestTransit) &&
              bestTransitOption?.trustStatus !== 'fallback' &&
              transitDuration !== null;

            const transitCost =
              bestTransitOption && tripData && hasReliableTransit
                ? getTransitTripTotalCost(bestTransitOption, tripData)
                : typeof bestTransit?.cost === 'number' && bestTransit.cost < 999999
                  ? bestTransit.cost
                  : null;

            const transitCostDisplay =
              bestTransitOption && tripData
                ? formatTransitCostDisplay(bestTransitOption, tripData)
                : null;

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

              if (noParkingPreferred) {
                if (mode.key === 'rideshare') score += 180;
                if (mode.key === 'parking') score -= 180;
                if (mode.key === 'transit' && businessMode === 'no_parking') score += 18;
              }

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
                  ? noParkingPreferred
                    ? 'Best fit because you marked that parking is not needed for this trip.'
                    : 'Best fit if you want the lowest effort and do not want to leave a car parked.'
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
                  ? noParkingPreferred
                    ? 'Hidden by preference'
                    : recommendationMode === 'parking'
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
                cost: transitCostDisplay && hasReliableTransit
                  ? transitCostDisplay.primary
                  : 'Check route',
                time: transitDuration !== null && hasReliableTransit ? formatMinutes(transitDuration) : 'Check route',
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
                    <div className="space-y-2">
                      <div>
                        <span className="font-semibold text-zinc-950">
                          Overnight trip detected
                        </span>
                        <span className="text-zinc-800">
                          {' '}
                          ({Math.max(1, Math.round(calculateParkingDuration(tripData) / (24 * 60)))}{' '}
                          {Math.round(calculateParkingDuration(tripData) / (24 * 60)) === 1
                            ? 'day'
                            : 'days'}
                          )
                        </span>
                      </div>
                      <p>
                        Park &amp; Ride options are not recommended because overnight parking rules
                        are often unverified. Airport and off-airport hotel lots were prioritized
                        for this trip length.
                      </p>
                      {showParkRideReason && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                          <div className="font-semibold">
                            Why Park & Ride is unavailable for this trip
                          </div>
                          <div className="mt-1">
                            This trip appears to require overnight parking. Most Park & Ride lots are
                            meant for same-day commuter use, and PodPaiGo should not recommend leaving
                            your car overnight unless the lot has verified overnight parking rules.
                          </div>
                          <div className="mt-2 text-xs text-amber-800">
                            Safer choices: use airport/off-airport parking, rideshare, taxi, or a
                            verified overnight parking provider.
                          </div>
                        </div>
                      )}
                    </div>
                  ) : cheapestMode && fastestMode ? (
                    <>
                      <span className="font-semibold text-zinc-950">Quick read:</span>{' '}
                      Cheapest is {cheapestMode.label}{' '}
                      {cheapestMode.key === 'transit' && transitCostDisplay
                        ? `at ${transitCostDisplay.primary}`
                        : `around $${Math.round(cheapestMode.cost)}`}
                      {cheapestMode.key === 'transit' && transitCostDisplay?.secondary
                        ? ` (${transitCostDisplay.secondary})`
                        : ''}
                      .
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
          <SortTabs value={sort} onChange={handleSortChange} />
        </div>

        {recommendation.accessStrategies?.options?.some((option) => option.isHiddenGem) ? (
          <HiddenAccessOptionsSection
            options={recommendation.accessStrategies.options.filter((option) => option.isHiddenGem)}
          />
        ) : null}

        {isPodPaiGoDebugUIEnabled() &&
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

        <TravelPreferencesPanel
          className="mt-6"
          value={travelPreferences}
          onChange={setTravelPreferences}
        />

        {noParkingPreferred ? (
          <section className="mt-6 rounded-3xl border border-blue-100 bg-blue-50/80 p-4 text-sm text-blue-950 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-base font-semibold">
                  No parking needed / rideshare strategy
                </div>
                <p className="mt-1 leading-6">
                  Parking cards are hidden because this trip is marked as rideshare/no-parking.
                  Use ride providers or transit links below, and open directions to confirm timing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowParkingAnyway((current) => !current)}
                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
              >
                {showParkingAnyway ? 'Hide parking again' : 'Show parking anyway'}
              </button>
            </div>
          </section>
        ) : null}

        {
          showParkingProviders && shouldDiscoverParkingForTrip(tripData) && parkingEmptyStateMessage && parkingDisplayOptions.length === 0 && !routeUnavailableBlocksParking && (
            <div className={`mt-6 rounded-xl border p-4 text-sm ${parkingEmptyStateClass}`}>
              {parkingEmptyStateMessage}
            </div>
          )
        }

        {
          showParkingProviders && parkingDisplayOptions.length > 0 && !routeUnavailableBlocksParking && (
            <div id="parking-options-section" className="mt-6 scroll-mt-6">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-bold">
                  {allParkingRoutesUnavailable
                    ? `Parking options near ${isCityTrip ? displayDestination : currentAirport.id}`
                    : 'Parking options'}
                </h2>
              </div>

              {recommendation.parkingDiscoveryNotice ? (
                <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
                  {recommendation.parkingDiscoveryNotice}
                </div>
              ) : null}

              {allParkingRoutesUnavailable && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  Parking lots near {isCityTrip ? displayDestination : currentAirport.id} are shown for reference, but route timing is unavailable from your current origin.
                </div>
              )}

              {parkingDisplayOptions.length > 0 && visibleSmartPickOption && (
                <ParkingSmartPick
                  options={parkingDisplayOptions.map((p) => googleEnrichedParking[p.id] || p)}
                  tripData={tripData}
                  sortMode={sort}
                  leaveByTime={routeUnavailableBlocksParking ? null : recommendation.leaveByTime}
                  selectedOption={
                    googleEnrichedParking[visibleSmartPickOption.id] || visibleSmartPickOption
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
                    onClick={() => {
                      trackEvent('map_tab_clicked', {
                        accessToken,
                        eventProperties: {
                          airportCode: isCityTrip ? undefined : tripData?.airportCode || currentAirport.id,
                        },
                      });
                      setShowMapModal(true);
                    }}
                    className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98]"
                  >
                    <span className="text-base leading-none">🗺️</span>
                    <span>Map</span>
                  </button>

                  {!isCityTrip ? (
                    <button
                      type="button"
                      onClick={() => {
                        trackEvent('airport_tab_clicked', {
                          accessToken,
                          eventProperties: {
                            airportCode: currentAirportCode,
                          },
                        });
                        setShowAirportGuideModal(true);
                      }}
                      className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98]"
                    >
                      <span className="text-base leading-none">✈️</span>
                      <span>Airport</span>
                    </button>
                  ) : null}
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
                          You are viewing lots around {isCityTrip ? displayDestination : currentAirport.id}
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
                        airportCode={isCityTrip ? undefined : tripData?.airportCode}
                        originAddress={tripData?.origin}
                        destinationLatLng={
                          isCityTrip &&
                          typeof tripData?.destinationLat === 'number' &&
                          typeof tripData?.destinationLng === 'number'
                            ? {
                                lat: tripData.destinationLat,
                                lng: tripData.destinationLng,
                              }
                            : null
                        }
                        destinationLabel={isCityTrip ? displayDestination : null}
                        parkingOptions={parkingDisplayOptions}
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
              <div className="text-base font-semibold text-zinc-900">
                {noParkingPreferred
                  ? 'No-parking strategy is available below'
                  : transportAvailability === 'rideshare'
                    ? 'Ride provider links are available below'
                    : transportAvailability === 'transit'
                      ? 'Transit-only route not reliable yet from this origin'
                      : 'No ranked route cards yet'}
              </div>
              <div className="mt-2 text-sm text-zinc-600">
                {noParkingPreferred
                  ? 'Parking cards are hidden for this trip. Use ride providers, transit links, or open directions to confirm timing.'
                  : transportAvailability === 'rideshare'
                    ? 'Live ride estimates may be unavailable, but Uber and Lyft links are still shown so you can open the provider app.'
                    : transportAvailability === 'transit'
                      ? 'Live transit routing is not connected yet, so we can’t reliably generate a transit-only route here.'
                      : 'Try adjusting your trip details and recalculating, or open directions to confirm timing.'}
              </div>
              <div className="mt-4 text-sm text-zinc-700">
                {transportAvailability === 'transit' ? (
                  <ul className="list-disc space-y-1 pl-5">
                    <li>If you can use rideshare/taxi, switch to “No car / rideshare”.</li>
                    <li>If driving is okay, switch to “I have a car” to see parking options.</li>
                    <li>Or choose “Compare all” to compare all available modes.</li>
                  </ul>
                ) : noParkingPreferred || transportAvailability === 'rideshare' ? (
                  <div>
                    Open a ride provider link below. If you want parking anyway, change the trip preference and recalculate.
                  </div>
                ) : (
                  <div>Try adjusting your trip details and recalculating.</div>
                )}
              </div>
              {tripData ? (
                <a
                  href={googleMapsDirectionsLink(
                    tripData.origin,
                    isCityTrip ? displayDestination : currentAirport.routingAddress,
                    transportAvailability === 'transit' ? 'transit' : 'driving',
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  {transportAvailability === 'transit' ? 'Open transit directions' : 'Open directions'}
                </a>
              ) : null}
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
              {displayableRemainingParking.length > 0 && !routeUnavailableBlocksParking && (
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

                    {!routeUnavailableBlocksParking && canShowMoreParking && (
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

                  {routeUnavailableBlocksParking ? (
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
                          accessToken={accessToken}
                          tripId={searchParams.get('tripId')}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {routeUnavailableBlocksParking && (
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
                        accessToken={accessToken}
                        tripId={searchParams.get('tripId')}
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
        {!routeUnavailableBlocksParking &&
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
              tripData={tripData}
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
      </main>
      {tripData && recommendation ? (
        <PodPaiGoAssistant
          page="results"
          resultsContext={{
            tripData,
            recommendation,
            leaveByTime: bestViableLeaveByTime || recommendation.leaveByTime || null,
          }}
        />
      ) : null}
    </div>
  );
}

const editableDateHelperText = 'Format: MM/DD/YYYY or YYYY-MM-DD.';

function normalizeEditableDateInputValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);

  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : us
      ? { year: Number(us[3]), month: Number(us[1]), day: Number(us[2]) }
      : null;

  if (!parts) return null;

  const { year, month, day } = parts;
  if (![year, month, day].every(Number.isFinite)) return null;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return formatLocalYYYYMMDD(parsed);
}

function readableEditInputClass(className = ''): string {
  return [
    'ppg-readable-input mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

function EditDateTextInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="MM/DD/YYYY or YYYY-MM-DD"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className={readableEditInputClass()}
      />
      <p className="mt-2 text-xs text-zinc-500">{editableDateHelperText}</p>
    </>
  );
}

export function EditTripForm({
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
  const [parkingPreference, setParkingPreference] = useState<ParkingPreference>(
    (initialData as TripDataWithExtras).parkingPreference || 'nearby'
  );

  const showAirportTimingControls = intent === 'flying-out' && initialData.type === 'one-way-departure';

  const [bagPlan, setBagPlan] = useState<BagPlan>(() =>
    resolveBagPlan({
      bagPlan: (initialData as TripDataWithExtras).bagPlan,
      checkingBags: !!(initialData as TripDataWithExtras).checkingBags,
    }),
  );
  const [securityOption, setSecurityOption] = useState<SecurityOption>(((initialData as TripDataWithExtras).securityOption || 'standard') as SecurityOption);
  const [flightType, setFlightType] = useState<FlightType>(((initialData as TripDataWithExtras).flightType || 'domestic') as FlightType);
  const [cabin, setCabin] = useState<CabinClass>(((initialData as TripDataWithExtras).cabin || 'economy') as CabinClass);

  const [parkingDurationHours, setParkingDurationHours] = useState(
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

  const [parkingCheckInDate, setParkingCheckInDate] = useState(
    (initialData as TripDataWithExtras).parkingCheckInDate || ''
  );

  const [parkingCheckInTime, setParkingCheckInTime] = useState(
    (initialData as TripDataWithExtras).parkingCheckInTime || ''
  );

  const [parkingCheckOutDate, setParkingCheckOutDate] = useState(
    (initialData as TripDataWithExtras).parkingCheckOutDate || ''
  );

  const [parkingCheckOutTime, setParkingCheckOutTime] = useState(
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
  const [showAdvancedGeneralParkingTime, setShowAdvancedGeneralParkingTime] = useState(false);
  const [generalParkingWindowOverridden, setGeneralParkingWindowOverridden] = useState(() => {
    if (initialData.type !== 'general-trip') return false;

    const parkingDuration = initialData.parkingDuration ?? (initialData.tripMode === 'quick-go' ? 2 * 60 : 8 * 60);
    return hasCustomParkingWindow({
      arrivalDate: initialData.arrivalDate,
      arrivalTime: initialData.arrivalTime,
      durationMinutes: parkingDuration,
      parkingCheckInDate: initialData.parkingCheckInDate,
      parkingCheckInTime: initialData.parkingCheckInTime,
      parkingCheckOutDate: initialData.parkingCheckOutDate,
      parkingCheckOutTime: initialData.parkingCheckOutTime,
    });
  });

  const isDeparture = initialData.type === 'one-way-departure';
  const isDropoffPickup = initialData.type === 'dropoff-pickup';
  const isArrival = initialData.type === 'one-way-arrival';
  const isRoundTrip = initialData.type === 'round-trip';
  const isGeneralTripEdit = initialData.type === 'general-trip';
  const normalizedArrivalDateForParking = normalizeEditableDateInputValue(arrivalDate) || arrivalDate;
  const normalizedParkingCheckInDateForParking =
    parkingCheckInDate ? normalizeEditableDateInputValue(parkingCheckInDate) || parkingCheckInDate : '';
  const normalizedParkingCheckOutDateForParking =
    parkingCheckOutDate ? normalizeEditableDateInputValue(parkingCheckOutDate) || parkingCheckOutDate : '';
  const generalParkingDurationMinutes =
    parkingDurationHours ? Math.round(Number(parkingDurationHours) * 60) : initialData.parkingDuration ?? (initialData.tripMode === 'quick-go' ? 2 * 60 : 8 * 60);
  const generalParkingWindow = resolveParkingWindow({
    arrivalDate: normalizedArrivalDateForParking,
    arrivalTime,
    durationMinutes: generalParkingDurationMinutes,
    parkingCheckInDate: generalParkingWindowOverridden
      ? normalizedParkingCheckInDateForParking
      : '',
    parkingCheckInTime: generalParkingWindowOverridden ? parkingCheckInTime : '',
    parkingCheckOutDate: generalParkingWindowOverridden
      ? normalizedParkingCheckOutDateForParking
      : '',
    parkingCheckOutTime: generalParkingWindowOverridden ? parkingCheckOutTime : '',
  });
  const generalParkingSummary = formatParkingWindowSummary(generalParkingWindow);

  const durationFromEditWindow = (
    checkInDate: string,
    checkInTime: string,
    checkOutDate: string,
    checkOutTime: string,
  ): number | null => {
    const normalizedCheckInDate = normalizeEditableDateInputValue(checkInDate) || checkInDate;
    const normalizedCheckOutDate = normalizeEditableDateInputValue(checkOutDate) || checkOutDate;
    const checkIn = buildLocalDateTime(normalizedCheckInDate, checkInTime);
    const checkOut = buildLocalDateTime(normalizedCheckOutDate, checkOutTime);
    if (!checkIn || !checkOut) return null;

    const minutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
    return minutes > 0 ? minutes : null;
  };

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

      const normalizedDate = normalizeEditableDateInputValue(dateString);
      if (!normalizedDate) {
        next.push(`Enter the ${label.toLowerCase()} date as MM/DD/YYYY or YYYY-MM-DD.`);
        return;
      }

      const combined = buildLocalDateTime(normalizedDate, timeString);
      if (!combined) {
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

    if (initialData.type === 'general-trip') {
      validateCombinedDateTime(arrivalDate, arrivalTime, 'Arrival');
    }

    if (initialData.type === 'round-trip') {
      // Validate both legs relative to now.
      validateCombinedDateTime(departureDate, departureTime, 'Departure');
      validateCombinedDateTime(returnDate, returnTime, 'Return');

      // Validate ordering if both parse.
      if (departureDate && departureTime && returnDate && returnTime) {
        const normalizedDepartureDate = normalizeEditableDateInputValue(departureDate);
        const normalizedReturnDate = normalizeEditableDateInputValue(returnDate);
        const dep =
          normalizedDepartureDate ? buildLocalDateTime(normalizedDepartureDate, departureTime) : null;
        const ret =
          normalizedReturnDate ? buildLocalDateTime(normalizedReturnDate, returnTime) : null;
        if (dep && ret && ret.getTime() < dep.getTime()) {
          next.push('Return date must be after departure date.');
        }
      }
    }

    if (parkingCheckInDate && !normalizeEditableDateInputValue(parkingCheckInDate)) {
      next.push('Enter the parking check-in date as MM/DD/YYYY or YYYY-MM-DD.');
    }

    if (parkingCheckOutDate) {
      if (!normalizeEditableDateInputValue(parkingCheckOutDate)) {
        next.push('Enter the parking check-out date as MM/DD/YYYY or YYYY-MM-DD.');
        return next;
      }

      const checkInDate = parkingCheckInDate || (isGeneralTripEdit ? arrivalDate : departureDate);
      const checkInTime = parkingCheckInTime || (isGeneralTripEdit ? arrivalTime : departureTime) || '12:00';
      const checkOutTime = parkingCheckOutTime || checkInTime;

      const minutes = durationFromEditWindow(
        checkInDate,
        checkInTime,
        parkingCheckOutDate,
        checkOutTime,
      );

      if (minutes === null) {
        next.push('Parking check-out must be after parking check-in.');
      }
    }

    if (parkingDurationHours) {
      const hours = Number(parkingDurationHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        next.push('Parking duration must be a positive number of hours.');
      }
    }

    if (
      isGeneralTripEdit &&
      parkingPreference !== 'none' &&
      generalParkingWindowOverridden &&
      !generalParkingWindow
    ) {
      next.push('Custom parking window must end after it starts.');
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

    const selectedAirport = isGeneralTripEdit
      ? null
      : getAirportById(selectedAirportCode) || getAirportById('SEA')!;
    const destination = isGeneralTripEdit
      ? initialData.destination
      : selectedAirport!.routingAddress || selectedAirport!.destinationName;

    const normalizedDepartureDate = normalizeEditableDateInputValue(departureDate) || departureDate;
    const normalizedArrivalDate = normalizeEditableDateInputValue(arrivalDate) || arrivalDate;
    const normalizedReturnDate = normalizeEditableDateInputValue(returnDate) || returnDate;
    const normalizedAirportTripDate =
      normalizeEditableDateInputValue(airportTripDate) || airportTripDate;
    const normalizedParkingCheckInDate =
      parkingCheckInDate ? normalizeEditableDateInputValue(parkingCheckInDate) || parkingCheckInDate : '';
    const normalizedParkingCheckOutDate =
      parkingCheckOutDate ? normalizeEditableDateInputValue(parkingCheckOutDate) || parkingCheckOutDate : '';

    let data: TripData;

    if (initialData.type === 'general-trip') {
      const checkInDate = normalizedParkingCheckInDate || normalizedArrivalDate;
      const checkInTime = parkingCheckInTime || arrivalTime;
      const defaultDuration = initialData.tripMode === 'quick-go' ? 2 * 60 : 8 * 60;
      parkingDuration = parkingDuration ?? defaultDuration;
      const parkingWindow = resolveParkingWindow({
        arrivalDate: normalizedArrivalDate,
        arrivalTime,
        durationMinutes: parkingDuration,
        parkingCheckInDate: generalParkingWindowOverridden ? checkInDate : '',
        parkingCheckInTime: generalParkingWindowOverridden ? checkInTime : '',
        parkingCheckOutDate: generalParkingWindowOverridden ? normalizedParkingCheckOutDate : '',
        parkingCheckOutTime: generalParkingWindowOverridden ? parkingCheckOutTime : '',
      });

      data = {
        type: 'general-trip',
        origin,
        destination,
        destinationKind: initialData.destinationKind || 'general',
        destinationName: initialData.destinationName || destination,
        destinationLat: initialData.destinationLat,
        destinationLng: initialData.destinationLng,
        tripMode: initialData.tripMode,
        arrivalDate: normalizedArrivalDate,
        arrivalTime,
        parkingDuration: parkingWindow?.parkingDuration ?? parkingDuration ?? initialData.parkingDuration,
        parkingCheckInDate: parkingWindow?.parkingCheckInDate ?? normalizedArrivalDate,
        parkingCheckInTime: parkingWindow?.parkingCheckInTime ?? arrivalTime,
        parkingCheckOutDate: parkingWindow?.parkingCheckOutDate ?? '',
        parkingCheckOutTime: parkingWindow?.parkingCheckOutTime ?? '',
        transportAvailability,
        transitPayment,
        parkingPreference,
      };
    } else if (initialData.type === 'one-way-departure') {
      const checkInDate = normalizedParkingCheckInDate || normalizedDepartureDate;
      const checkInTime = parkingCheckInTime || departureTime || '12:00';
      const checkOutTime = parkingCheckOutTime || checkInTime;
      if (normalizedParkingCheckOutDate) {
        parkingDuration = durationFromEditWindow(
          checkInDate,
          checkInTime,
          normalizedParkingCheckOutDate,
          checkOutTime,
        ) ?? parkingDuration;
      }

      data = {
        type: initialData.type,
        origin,
        destination,
        airportCode: selectedAirport!.id,
        destinationKind: 'airport',
        departureDate: normalizedDepartureDate,
        departureTime,
        timeAnchor: (initialData as TripDataWithExtras).timeAnchor || 'flight-departure',
        parkingDuration,
        parkingCheckInDate: checkInDate,
        parkingCheckInTime: checkInTime,
        parkingCheckOutDate: normalizedParkingCheckOutDate || undefined,
        parkingCheckOutTime: normalizedParkingCheckOutDate ? checkOutTime : undefined,
        transportAvailability,
        bagPlan: showAirportTimingControls ? bagPlan : (initialData as TripDataWithExtras).bagPlan,
        checkingBags: showAirportTimingControls ? bagPlan !== 'none' : (initialData as TripDataWithExtras).checkingBags,
        securityOption: showAirportTimingControls ? securityOption : (initialData as TripDataWithExtras).securityOption,
        flightType: showAirportTimingControls ? flightType : (initialData as TripDataWithExtras).flightType,
        cabin: showAirportTimingControls ? cabin : (initialData as TripDataWithExtras).cabin,
        checkedInAtAirport: (initialData as TripDataWithExtras).checkedInAtAirport,
        transitPayment,
        parkingPreference,
      };
    } else if (initialData.type === 'dropoff-pickup') {
      data = {
        type: initialData.type,
        origin,
        destination,
        airportTripDate: normalizedAirportTripDate,
        airportTripTime,
        transportAvailability,
        airportCode: selectedAirport!.id,
        destinationKind: 'airport',
        transitPayment,
        parkingPreference,
      };
    } else if (initialData.type === 'one-way-arrival') {
      data = {
        type: initialData.type,
        origin,
        destination,
        arrivalDate: normalizedArrivalDate,
        arrivalTime,
        transportAvailability,
        airportCode: selectedAirport!.id,
        destinationKind: 'airport',
        transitPayment,
        parkingPreference,
      };
    } else {
      const checkInDate = normalizedParkingCheckInDate || normalizedDepartureDate;
      const checkInTime = parkingCheckInTime || departureTime;
      const checkOutDate = normalizedParkingCheckOutDate || normalizedReturnDate;
      const checkOutTime = parkingCheckOutTime || returnTime;
      parkingDuration = durationFromEditWindow(
        checkInDate,
        checkInTime,
        checkOutDate,
        checkOutTime,
      ) ?? parkingDuration;

      data = {
        type: 'round-trip',
        origin,
        destination,
        airportCode: selectedAirport!.id,
        destinationKind: 'airport',
        departureDate: normalizedDepartureDate,
        departureTime,
        returnDate: normalizedReturnDate,
        returnTime,
        parkingDuration,
        parkingCheckInDate: checkInDate,
        parkingCheckInTime: checkInTime,
        parkingCheckOutDate: checkOutDate,
        parkingCheckOutTime: checkOutTime,
        transportAvailability,
        transitPayment,
        parkingPreference,
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
          {!isGeneralTripEdit ? (
            <AirportSearchPicker
              value={selectedAirportCode}
              onChange={(airportCode) => {
                setSelectedAirportCode(airportCode.toUpperCase());
              }}
            />
          ) : null}
          <div className="text-sm font-medium text-zinc-900">What can you use today?</div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                { key: 'car' as const, title: 'I have a car', sub: 'Show parking normally and still compare strong ride or transit options.' },
                { key: 'rideshare' as const, title: 'No car / rideshare', sub: 'Prioritize rideshare, taxi, and non-car transit where available.' },
                { key: 'transit' as const, title: 'Transit only', sub: 'No car or rideshare.' },
                { key: 'all' as const, title: 'Compare all', sub: 'Show car, rideshare, taxi, transit, parking, and park-and-ride.' },
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
              airportCode={airportCode}
              className="mt-4"
            />
          )}

          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
            <div className="text-sm font-medium text-zinc-900">Parking preference</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { key: 'nearby' as const, label: 'I’m driving / need parking' },
                { key: 'none' as const, label: 'No parking needed' },
                { key: 'destination' as const, label: 'Compare all' },
              ].map((opt) => {
                const selected = parkingPreference === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setParkingPreference(opt.key)}
                    className={
                      'rounded-xl border px-3 py-2 text-left text-sm font-medium transition ' +
                      (selected
                        ? 'border-blue-500 bg-blue-50 text-blue-950'
                        : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50')
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {showAirportTimingControls && (
          <div className="sm:col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-sm font-medium text-zinc-900">Airport timing</div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="text-sm font-medium text-zinc-800">Bag plan</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      { key: 'none' as const, label: 'No checked bag' },
                      { key: 'checked' as const, label: 'Checked bag' },
                      { key: 'oversized' as const, label: 'Oversized / special item' },
                    ] as Array<{ key: BagPlan; label: string }>
                  ).map((opt) => {
                    const selected = bagPlan === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setBagPlan(opt.key)}
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

        {isGeneralTripEdit && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Arrival date</label>
              <EditDateTextInput
                value={arrivalDate}
                onChange={setArrivalDate}
                ariaLabel="Arrival date"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Arrival time</label>
              <input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {parkingPreference !== 'none' ? (
              <div className="sm:col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-medium text-zinc-900">Parking time</div>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-800">
                      Duration
                    </label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={parkingDurationHours}
                      onChange={(e) => setParkingDurationHours(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                    <div className="text-sm font-semibold text-slate-950">
                      {generalParkingSummary}
                    </div>
                    {generalParkingWindowOverridden ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-600">
                          Using custom parking window
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setGeneralParkingWindowOverridden(false);
                            setParkingCheckInDate('');
                            setParkingCheckInTime('');
                            setParkingCheckOutDate('');
                            setParkingCheckOutTime('');
                          }}
                          className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                        >
                          Reset to arrival + duration
                        </button>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-slate-600">
                        Park from defaults to arrival. Park until updates with duration.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAdvancedGeneralParkingTime((current) => !current)}
                    className="text-sm font-semibold text-blue-700 hover:text-blue-800"
                    aria-expanded={showAdvancedGeneralParkingTime}
                  >
                    {showAdvancedGeneralParkingTime
                      ? 'Hide advanced parking time'
                      : 'Advanced parking time'}
                  </button>

                  {showAdvancedGeneralParkingTime ? (
                    <div className="grid grid-cols-1 gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-zinc-800">
                          Park from date
                        </label>
                        <EditDateTextInput
                          value={
                            generalParkingWindowOverridden
                              ? parkingCheckInDate
                              : generalParkingWindow?.parkingCheckInDate || ''
                          }
                          onChange={(value) => {
                            setGeneralParkingWindowOverridden(true);
                            setParkingCheckInDate(value);
                          }}
                          ariaLabel="Park from date"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-800">
                          Park from time
                        </label>
                        <input
                          type="time"
                          aria-label="Park from time"
                          value={
                            generalParkingWindowOverridden
                              ? parkingCheckInTime
                              : generalParkingWindow?.parkingCheckInTime || ''
                          }
                          onChange={(e) => {
                            setGeneralParkingWindowOverridden(true);
                            setParkingCheckInTime(e.target.value);
                          }}
                          className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-800">
                          Park until date
                        </label>
                        <EditDateTextInput
                          value={
                            generalParkingWindowOverridden
                              ? parkingCheckOutDate
                              : generalParkingWindow?.parkingCheckOutDate || ''
                          }
                          onChange={(value) => {
                            setGeneralParkingWindowOverridden(true);
                            setParkingCheckOutDate(value);
                          }}
                          ariaLabel="Park until date"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-800">
                          Park until time
                        </label>
                        <input
                          type="time"
                          aria-label="Park until time"
                          value={
                            generalParkingWindowOverridden
                              ? parkingCheckOutTime
                              : generalParkingWindow?.parkingCheckOutTime || ''
                          }
                          onChange={(e) => {
                            setGeneralParkingWindowOverridden(true);
                            setParkingCheckOutTime(e.target.value);
                          }}
                          className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}

        {isDeparture && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Date</label>
              <EditDateTextInput
                value={departureDate}
                onChange={setDepartureDate}
                ariaLabel="Departure date"
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

            <div className="sm:col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-medium text-zinc-900">Parking time</div>
              <p className="mt-1 text-xs text-zinc-500">
                Optional. Exact check-in/check-out times can change provider checkout prices.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-800">
                    Parking check-in date
                    <span className="ml-1 text-xs font-normal text-zinc-500">Optional</span>
                  </label>
                  <EditDateTextInput
                    value={parkingCheckInDate}
                    onChange={setParkingCheckInDate}
                    ariaLabel="Parking check-in date"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-800">
                    Parking check-in time
                    <span className="ml-1 text-xs font-normal text-zinc-500">Optional</span>
                  </label>
                  <input
                    type="time"
                    value={parkingCheckInTime}
                    onChange={(e) => setParkingCheckInTime(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-800">
                    Parking check-out date
                    <span className="ml-1 text-xs font-normal text-zinc-500">Optional</span>
                  </label>
                  <EditDateTextInput
                    value={parkingCheckOutDate}
                    onChange={setParkingCheckOutDate}
                    ariaLabel="Parking check-out date"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-800">
                    Parking check-out time
                    <span className="ml-1 text-xs font-normal text-zinc-500">Optional</span>
                  </label>
                  <input
                    type="time"
                    value={parkingCheckOutTime}
                    onChange={(e) => setParkingCheckOutTime(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-800">
                    Parking duration
                    <span className="ml-1 text-xs font-normal text-zinc-500">Fallback when check-out is blank</span>
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={parkingDurationHours}
                    onChange={(e) => setParkingDurationHours(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
            </div>

          </>
        )}

        {isDropoffPickup && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Date</label>
              <EditDateTextInput
                value={airportTripDate}
                onChange={setAirportTripDate}
                ariaLabel="Airport trip date"
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
              <EditDateTextInput
                value={arrivalDate}
                onChange={setArrivalDate}
                ariaLabel="Arrival date"
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
              <EditDateTextInput
                value={departureDate}
                onChange={setDepartureDate}
                ariaLabel="Departure date"
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
              <EditDateTextInput
                value={returnDate}
                onChange={setReturnDate}
                ariaLabel="Return date"
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
