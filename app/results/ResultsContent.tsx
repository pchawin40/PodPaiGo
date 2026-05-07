'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  rankRecommendations,
  sortRankedRecommendations,
  RecommendationSortMode,
} from '../../lib/domain';
import { RankedRecommendation } from '../../lib/domain';
import { resolveSeatacCheckinZone } from '../../lib/airports/seatacCheckin';
import { PROVIDER_LINKS } from '../../lib/providerCatalog';
import { AddressInput } from '../trip/AddressInput';
import { AIRPORTS_CATALOG, getAirportById } from '../../lib/airports/catalog';
import ParkingSmartPick from './ParkingSmartPick';
import { withAprLivePrice, getAprLivePrice } from '../../lib/parking/aprLivePrice';
import { formatMinutes, parkingKeySafe, parkingTimeBreakdown } from '../../lib/parking/routeDisplay';
import { parseLocalDate } from '../../lib/tripTime';
import { googleMapsSearchLink, googleMapsDirectionsLink } from '../../lib/maps';
import { dedupeAndSortParkingOptions } from '../../lib/parking/googlePlacesDedupe';
import ParkingLotsMap from './ParkingLotsMap';
import AirportTerminalMap from './AirportTerminalMap';
import { calculateAirportReadinessBuffer } from '../../lib/airports/airportReadiness';
import {
  parkingPriceLine,
  getParkingTotalPrice,
  getParkingDailyPrice,
} from '../../lib/parking/priceDisplay';
import {
  parkingRouteBreakdown,
  routeUrlForOption,
  googleMapsParkingRouteLink,
  hasRealParkingPrice
} from '../../lib/parking/routeDisplay';

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
  ParkingOption
} from '../../lib/types';
import {
  costOf,
  formatMoney,
  formatMoneyCents
} from '../utils/formatter';
import { getAirportSecurityEstimate } from '@/lib/airports/airportSecurity';
import ParkingReviewsModal from './ParkingReviewsModal';
import { attachGooglePlaceToParking } from '@/lib/parking/googlePlaceMatch';

type PriceableOption = {
  id?: string;
  name: string;
  price?: number;
  priceDisplay?: PriceDisplay;
  priceUnit?: PriceUnit;
  priceNote?: string;
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

function weatherAdjustedParkingSortScore(
  option: ParkingOption,
  tripData: TripData | null,
  weatherImpact?: Recommendation['weatherImpact']
): number {
  const totalPrice = getParkingTotalPrice(option, tripData) ?? 999999;
  const time = parkingTimeBreakdown(option).totalMinutes || 999;

  let weatherPenalty = 0;

  if (weatherImpact) {
    const adj = weatherImpact.parkingScoreAdjustments;

    if (option.covered) weatherPenalty -= adj.coveredBonus * 3;
    if (option.type === 'official') weatherPenalty -= adj.officialGarageBonus * 3;
    if (option.transferType === 'shuttle') weatherPenalty -= adj.shuttlePenalty * 3;
    if (!option.covered && option.type === 'off-airport') {
      weatherPenalty -= adj.uncoveredPenalty * 3;
    }
  }

  return totalPrice + time * 1.5 + weatherPenalty;
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
  const drive = typeof option.distance === 'number' ? option.distance : 0;
  const park = typeof option.parkingBufferMinutes === 'number' ? option.parkingBufferMinutes : 0;
  const transfer = typeof option.transferToTerminalMinutes === 'number' ? option.transferToTerminalMinutes : 0;

  const isShuttle = option.transferType === 'shuttle';
  const isGarage = option.transferType === 'airport-garage';

  const shuttleWait = isShuttle ? 8 : 0;
  const walkInside = isGarage ? 5 : 2;
  const buffer = 5;

  const total = drive + park + shuttleWait + transfer + walkInside + buffer;

  return {
    total,
    parts: [
      { label: 'Drive', minutes: drive },
      { label: 'Park', minutes: park },
      ...(isShuttle
        ? [{ label: 'Shuttle', minutes: shuttleWait + transfer }]
        : [{ label: isGarage ? 'Garage walk' : 'Walk', minutes: transfer }]
      ),
      { label: 'Inside airport', minutes: walkInside },
      { label: 'Buffer', minutes: buffer },
    ].filter((p) => p.minutes > 0),
  };
}

function getTransferLabel(option: ParkingOption): string {
  const transfer = option.transferToTerminalMinutes ?? 0;
  const isShuttle = option.transferType === 'shuttle';

  const shuttleWait = isShuttle ? 8 : 0;
  const totalTransfer = transfer + shuttleWait;

  if (isShuttle) {
    return `Shuttle ${formatMiniMinutes(totalTransfer)} to terminal`;
  }

  if (option.transferType === 'airport-garage') {
    return `Walk ${formatMiniMinutes(transfer)} inside garage`;
  }

  if (option.transferType === 'walk') {
    return `Walk ${formatMiniMinutes(transfer)} to terminal`;
  }

  return `Transfer ${formatMiniMinutes(transfer)}`;
}

function ParkingTimeSummary({
  option,
  compact = false,
}: {
  option: ParkingOption;
  compact?: boolean;
}) {
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

function getTripAirportCode(tripData: TripData | null): string {
  return ((tripData as TripDataWithExtras | null)?.airportCode || 'SEA').toUpperCase();
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

function pricingKindLabel(kind?: string): string {
  switch (kind) {
    case 'live':
      return 'Live';
    case 'estimated':
      return 'Estimated';
    case 'mock':
      return 'Mock data';
    case 'check-live':
      return 'Check live price';
    case 'from-per-day':
      return 'From / day';
    default:
      return '—';
  }
}

function formatProviderPrice(it: PriceableOption): { primary: string; secondary?: string } {
  const kind = it.priceDisplay as string | undefined;
  const unit = it.priceUnit as string | undefined;

  if (kind === 'check-live') {
    if (typeof it.price === 'number' && it.price > 0) {
      return {
        primary: `From ${formatMoney(it.price)}/day`,
        secondary: 'Latest cached rate — check live price before booking',
      };
    }

    return { primary: 'Check live price', secondary: it.priceNote };
  }

  if (kind === 'from-per-day' && unit === 'per-day' && typeof it.price === 'number') {
    return {
      primary: formatParkingDailyPrice({
        price: it.price,
        bestFor: it.bestFor,
        priceNote: it.priceNote,
      }),
      secondary: it.priceNote,
    };
  }

  if ((kind === 'estimated' || kind === 'mock') && typeof it.price === 'number') {
    const prefix = kind === 'mock' ? 'Mock:' : 'Est.';
    return { primary: `${prefix} ${formatMoney(it.price)}`, secondary: it.priceNote };
  }

  if (typeof it.price === 'number') {
    return { primary: formatMoney(it.price), secondary: it.priceNote };
  }

  return { primary: 'Check price', secondary: it.priceNote };
}

function PriceLegend() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
      <div className="font-semibold text-zinc-900">Price legend</div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <div className="font-medium">Live</div>
          <div className="text-xs text-zinc-600">Pulled from provider/API</div>
        </div>
        <div>
          <div className="font-medium">Estimated</div>
          <div className="text-xs text-zinc-600">Calculated or based on typical rates</div>
        </div>
        <div>
          <div className="font-medium">From / day</div>
          <div className="text-xs text-zinc-600">Daily rate; trip total may vary by length of stay</div>
        </div>
        <div>
          <div className="font-medium">Check live price</div>
          <div className="text-xs text-zinc-600">App does not have reliable live pricing yet; open provider to confirm</div>
        </div>
      </div>
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
}: {
  title: string;
  items: ProviderLinkItem[];
}) {
  if (!items || items.length === 0) return null;

  const isRideSection = title.toLowerCase().includes('ride');
  const isTransitSection = title.toLowerCase().includes('transit');

  return (
    <div className="divide-y divide-zinc-100 bg-white">
      {items.map((it: ProviderLinkItem) => {
        const trust = confidenceFromTrust((it.trustStatus || 'estimated') as TrustStatus);
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
          isRideSection && typeof it.price === 'number'
            ? `Est. ${formatMoney(it.price)}`
            : price.primary;

        const secondaryPrice =
          isRideSection
            ? it.priceNote || 'Prices vary by demand, traffic, and pickup time'
            : it.priceNote || price.secondary;

        const primaryCta =
          it.id === 'soundtransit-planner'
            ? 'Official website'
            : isTransitSection
              ? 'View route'
              : isRideSection
                ? 'Check live'
                : 'View deal';

        const sourceAndMapSame = Boolean(link && it.mapLink && link === it.mapLink);

        return (
          <div key={it.id || it.name} className="px-5 py-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow-md">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-sm font-bold text-zinc-900">
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
                      </div>
                    </div>

                    {shouldShowPrice && (
                      <div className="shrink-0 text-left sm:text-right">
                        <div className="text-lg font-bold text-zinc-900">
                          {primaryPrice}
                        </div>

                        {isTransitSection && typeof it.price === 'number' && (
                          <div className="text-xs font-medium text-zinc-500">
                            fare estimate
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
    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={
              'rounded-xl px-3 py-2 text-left transition ' +
              (active ? 'bg-blue-600 text-white' : 'bg-white text-zinc-900 hover:bg-zinc-50')
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
    if (typeof option?.price === 'number' && option.price > 0) {
      return {
        primary: formatMoney(option.price),
        secondary: option?.priceNote,
      };
    }

    return {
      primary: 'Check live price',
      secondary: option?.priceNote,
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
  const wayUrl = `https://www.way.com/parking/search?query=${encodeURIComponent(airportSearchName)}`;
  const parkWhizUrl = `https://www.parkwhiz.com/search/?destination=${encodeURIComponent(airportSearchName)}`;

  // Marketplace estimates (clearly labeled estimated)
  const spotHeroEst = null;
  const wayEst = null;

  const rows: BookingSourceRow[] = [
    mkRow({
      provider: directProvider,
      type: isOfficialAirport ? 'official source' : 'direct booking',
      trust: 'high',
      notes: directNotes,
      link: String(parking?.sourceLink || airport.officialParkingUrl || googleMapsSearchLink(airportSearchName)),
      ctaLabel: isOfficialAirport ? 'Book official' : 'Check live',
      pricePerDay: directPricePerDay,
      priceDisplay: directPriceDisplay,
    }),
    mkRow({
      provider: 'SpotHero',
      type: 'marketplace',
      trust: 'high',
      notes: spotHeroEst != null ? 'Major marketplace (estimated)' : 'Major marketplace (check live)',
      link: spotHeroUrl,
      ctaLabel: 'Check live',
      pricePerDay: spotHeroEst,
      priceDisplay: spotHeroEst != null ? 'estimated' : 'check-live',
    }),
    mkRow({
      provider: 'Way.com',
      type: 'marketplace',
      trust: 'medium',
      notes: wayEst != null ? 'Deals vary (estimated)' : 'Deals vary (check live)',
      link: wayUrl,
      ctaLabel: 'Check live',
      pricePerDay: wayEst,
      priceDisplay: wayEst != null ? 'estimated' : 'check-live',
    }),
    mkRow({
      provider: 'ParkWhiz',
      type: 'compare marketplace',
      trust: 'medium',
      notes: 'Compare rates (check live)',
      link: parkWhizUrl,
      ctaLabel: 'Check live',
      pricePerDay: null,
      priceDisplay: 'check-live',
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
  const opt = withAprLivePrice(item.option as AppOption, aprLivePrices) as AppOption;

  const isAprFetching =
    aprLiveChecking &&
    item.type === 'parking' &&
    isAprOption(opt);

  const [reviewsParking, setReviewsParking] = useState<ParkingOption | null>(null);
  const parking = item.type === "parking"
    ? ((googleEnrichedParking?.[opt.id || ""] || opt) as ParkingOption)
    : null;


  const airportCode = getTripAirportCode(tripData);
  const airport = getAirportById(airportCode) || getAirportById('SEA')!;
  const safeParkingSearchQuery = `${airport.label} ${airport.id} airport parking`;

  const trust = confidenceFromTrust((opt.trustStatus || 'estimated') as TrustStatus);

  const sourceLink = opt.sourceLink || null;
  const parkingLotDestinationForTerminalRoute =
    String((opt as ParkingOption).name || (opt as ParkingOption).routeDestination || '');

  const parkingLotRouteLink =
    item.type === 'parking'
      ? googleMapsParkingRouteLink(opt as ParkingOption, tripData?.origin || null)
      : null;

  const parkingToTerminalRouteLink =
    item.type === 'parking'
      ? googleMapsDirectionsLink(
        parkingLotDestinationForTerminalRoute,
        airport.routingAddress || airport.destinationName || airport.label,
        'driving'
      )
      : null;

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
        price:
          hasRealParkingPrice(opt)
            ? opt.price ?? 0
            : typeof item.cost === 'number' && item.cost > 0 && item.cost < 500
              ? item.cost
              : 0,
        priceDisplay:
          hasRealParkingPrice(opt)
            ? opt.priceDisplay
            : 'check-live',
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

  const parkingTotalText =
    item.type === 'parking' && parkingPrice?.secondary
      ? parkingPrice.secondary
      : null;

  const timing = computeTimingStatus({
    intent,
    tripData,
    optionTotalMinutes: item.duration,
  });
  const timingMeta = timingBadge(timing.status);

  const timingSummary = (() => {
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
    typeof opt.price === 'number' && opt.price > 0
      ? `${opt.priceDisplay === 'estimated' ? 'Est. ' : ''}${formatMoney(opt.price)}`
      : visiblePrice.primary;

  return (
    <div
      id={`option-${item.type}-${String(opt?.id || rank)}`}
      className={
        'rounded-2xl border bg-white p-5 shadow-sm ' +
        (timing.status === 'too-late' ? 'border-red-200' : 'border-zinc-200')
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-zinc-900">{opt.name}</div>

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
                {isAprFetching
                  ? 'Checking live price…'
                  : item.type === 'parking'
                    ? parkingPrice?.primary
                    : nonParkingPrice}
              </span>

              {parkingTotalText && (
                <span className="text-sm font-semibold text-zinc-600">
                  · {parkingTotalText.replace('Est. total: ', '')}
                </span>
              )}

              {item.type !== 'parking' && (
                <span className="text-sm text-zinc-600">
                  · {formatMinutes(item.duration)}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className={"rounded-full border px-2.5 py-1 text-xs font-medium " + trust.className}>
                {trust.label}
              </div>

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
                        {parking.reviewCount ? (
                          <span className="text-amber-700/70">
                            ({Intl.NumberFormat("en", { notation: "compact" }).format(parking.reviewCount)})
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

          {item.type === 'parking' && (
            <ParkingTimeSummary option={opt as ParkingOption} compact={compact} />
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

          {timing.status === 'too-late' && timing.recommendedInsideArrivalBy && timing.youReachTerminalAround && shortByMinutes != null && (
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

          {item.type === 'parking' && !compact && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium text-zinc-900">Compare booking sources</div>
                <div className="text-xs text-zinc-500">Known/baseline prices are labeled; confirm final rate before booking.</div>
              </div>

              {(() => {
                const rows = buildBookingSourceRows(opt, tripData);
                const days = estimateParkingDays(tripData);

                return (
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
                          const priceCell = r.pricePerDay == null
                            ? 'Check live'
                            : r.priceDisplay === 'live'
                              ? `Live ${formatMoneyCents(r.pricePerDay)}/day`
                              : `Est. ${formatMoney(r.pricePerDay)}/day`;

                          const typeLabel = r.type;

                          return (
                            <tr key={r.provider} className="border-t border-zinc-100">
                              <td className="break-words py-3 font-medium text-zinc-900">{r.provider}</td>
                              <td className="break-words py-3 text-zinc-900">{priceCell}</td>
                              <td className="py-3">
                                <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + r.trustClassName}>
                                  {r.trustLabel}
                                </span>
                              </td>
                              <td className="py-3 text-zinc-700">
                                <div className="flex flex-col gap-1">
                                  <div>
                                    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                                      {typeLabel}
                                    </span>
                                  </div>
                                  <div className="text-xs text-zinc-700 space-y-1">
                                    <div>{r.notes}</div>
                                    {r.estimatedTripTotal != null && (
                                      <div>
                                        <span className="font-medium">Trip total:</span>{" "}
                                        {formatMoneyCents(r.estimatedTripTotal)} for {days} day(s)
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    copyTextThenOpen(
                                      opt.searchQuery || safeParkingSearchQuery,
                                      r.link
                                    )
                                  }
                                  className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                                >
                                  {r.ctaLabel === 'Check live' ? 'Copy + open' : r.ctaLabel}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-stretch">
          {compact ? (
            <div className="flex flex-col gap-2">
              {sourceLink && (
                <button
                  type="button"
                  onClick={() =>
                    item.type === 'parking'
                      ? copyTextThenOpen(opt.searchQuery || safeParkingSearchQuery, sourceLink)
                      : window.open(sourceLink, '_blank', 'noopener,noreferrer')
                  }
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {item.type === 'parking'
                    ? opt.bookingProvider === 'AirportParkingReservations' || opt.sourceName === 'AirportParkingReservations'
                      ? 'View deal'
                      : opt.type === 'official'
                        ? 'Book official'
                        : 'Check price'
                    : 'View'}
                </button>
              )}

              {item.type === 'parking' && parkingLotRouteLink && (
                <a
                  href={parkingLotRouteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Route to parking
                </a>
              )}

              {item.type === 'parking' && parkingToTerminalRouteLink && (
                <a
                  href={parkingToTerminalRouteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Parking to terminal
                </a>
              )}
            </div>
          ) : (
            <>
              {sourceLink && item.type === 'parking' ? (
                <button
                  type="button"
                  onClick={() =>
                    copyTextThenOpen(opt.searchQuery || safeParkingSearchQuery, sourceLink)
                  }
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {opt.bookingProvider === 'AirportParkingReservations' || opt.sourceName === 'AirportParkingReservations'
                    ? 'View deal'
                    : opt.type === 'official'
                      ? 'Book official'
                      : 'Copy search + open'}
                </button>
              ) : sourceLink ? (
                <a
                  href={sourceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {item.type === 'rideshare' &&
                    (opt.id === 'taxi' || String(opt.name || '').toLowerCase().includes('taxi'))
                    ? 'Find taxi'
                    : 'View / Book'}
                </a>
              ) : null}

              {item.type === 'parking' && parkingLotRouteLink && (
                <a
                  href={parkingLotRouteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Route to parking
                </a>
              )}

              {item.type === 'parking' && parkingToTerminalRouteLink && (
                <a
                  href={parkingToTerminalRouteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Parking to terminal
                </a>
              )}

              {item.type !== 'parking' && routeLink && (
                <a
                  href={routeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
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
            {timing.status !== 'n/a' && timing.flightDeparts && timing.recommendedInsideArrivalBy && timing.latestSafeLeaveTime && typeof timing.optionTravelMinutes === 'number' && (
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

            {item.type === 'parking' && !compact && parkingBreakdown && (
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
      byKey.set(key, item);
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

    byKey.set(key, winner);
  }

  return Array.from(byKey.values());
}

function ProviderDropdownSection({
  title,
  subtitle,
  items,
  defaultOpen = false,
}: {
  title: string;
  subtitle: string;
  items: ProviderLinkItem[];
  defaultOpen?: boolean;
}) {
  if (!items || items.length === 0) return null;

  return (
    <details
      open={defaultOpen}
      className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300"
    >
      <summary className="cursor-pointer list-none border-b border-zinc-200 bg-zinc-50 px-5 py-4 marker:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-zinc-900">
                {title}
              </h3>

              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
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

      <PricingLinksSection title={title} items={items} />
    </details>
  );
}

function TsaWaitTimesCard({
  tsaEstimate,
  airportCode,
}: {
  tsaEstimate: Recommendation['tsaEstimate'];
  airportCode?: string;
}) {
  const waitTimes = tsaEstimate.waitTimes;

  const airportSecurity = getAirportSecurityEstimate(
    airportCode || 'SEA',
    (tsaEstimate.selectedLane || 'standard') as SecurityOption
  );

  const isSea = (airportCode || 'SEA').toUpperCase() === 'SEA';

  const laneLabels: Record<string, string> = {
    standard: 'Standard',
    precheck: 'PreCheck',
    clear: 'CLEAR',
    'clear-precheck': 'CLEAR + PreCheck',
  };

  if (!waitTimes) {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
        <span className="font-semibold text-zinc-900">
          {airportSecurity.label}
        </span>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-800">
          {tsaEstimate.waitTime}m
        </span>
        <span className="text-zinc-500">{tsaEstimate.sourceName}</span>
      </div>
    );
  }

  const selectedLane = tsaEstimate.selectedLane ?? 'standard';
  const selectedLabel = laneLabels[selectedLane] ?? 'Standard';

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

  const selectedLaneData =
    allLanes.find((lane) => lane.key === selectedLane) ?? null;

  const fastestLane =
    allLanes.length > 0
      ? [...allLanes].sort((a, b) => {
        if (a.minutes !== b.minutes) return a.minutes - b.minutes;

        const priority: Record<string, number> = {
          'clear-precheck': 0,
          precheck: 1,
          clear: 2,
          standard: 3,
        };

        return (priority[a.key] ?? 99) - (priority[b.key] ?? 99);
      })[0]
      : null;

  const otherLanes = allLanes.filter(
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
          {airportSecurity.note}
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
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 ring-1 ring-zinc-200">
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

export default function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [googleEnrichedParking, setGoogleEnrichedParking] = useState<Record<string, ParkingOption>>({});
  const [reviewsParking, setReviewsParking] = useState<ParkingOption | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [rankedOptions, setRankedOptions] = useState<RankedRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tripData, setTripData] = useState<TripData | null>(null);

  async function enrichParkingListWithGoogle(parkingOptions: ParkingOption[]) {
    const firstFew = parkingOptions.slice(0, 8);

    const enrichedPairs = await Promise.all(
      firstFew.map(async (parking) => {
        const enriched = await attachGooglePlaceToParking(parking, tripData);
        return [parking.id, enriched] as const;
      })
    );

    setGoogleEnrichedParking((prev: Record<string, ParkingOption>) => {
      const next = { ...prev };

      enrichedPairs.forEach(([id, enriched]) => {
        next[id] = enriched;
      });

      return next;
    });
  }

  useEffect(() => {
    if (!recommendation?.parking?.length || !tripData) return;

    enrichParkingListWithGoogle(recommendation.parking);
  }, [recommendation?.parking, tripData]);

  useEffect(() => {
    if (!recommendation?.parking?.length || !tripData) return;

    const aprOptions = recommendation.parking.filter((p) =>
      p.bookingProvider === 'AirportParkingReservations' ||
      p.sourceName === 'AirportParkingReservations'
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

  const airportSecurity = useMemo(() => {
    const airportCode = getTripAirportCode(tripData);
    const selectedSecurity =
      (tripData as TripDataWithExtras | null)?.securityOption || 'standard';

    return getAirportSecurityEstimate(airportCode, selectedSecurity);
  }, [tripData]);

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


  const [parkingPricesChecking, setParkingPricesChecking] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editingData, setEditingData] = useState<TripData | null>(null);
  const editTripRef = useRef<HTMLDivElement | null>(null);
  const [editTripJustOpened, setEditTripJustOpened] = useState(false);


  const [showTooLate, setShowTooLate] = useState(false);

  const [showMoreParking, setShowMoreParking] = useState(false);

  const [matchedParkingPrices, setMatchedParkingPrices] = useState<Record<string, {
    price: number;
    priceUnit?: PriceUnit;
    provider?: string;
    sourceLink?: string;
  }>>({});

  const [aprLivePrices, setAprLivePrices] = useState<Record<string, number>>({});
  const [aprLiveChecking, setAprLiveChecking] = useState(false);
  const [aprLivePartial, setAprLivePartial] = useState(false);

  const [selectedParkingId, setSelectedParkingId] = useState<string | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showAirportGuideModal, setShowAirportGuideModal] = useState(false);

  const aprFetchIdRef = useRef(0);
  const aprRequestKeyRef = useRef('');
  const priceMatchKeyRef = useRef('');

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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const type = searchParams.get('type') as TripData['type'] | null;
    const origin = searchParams.get('origin') || '';
    const destination = searchParams.get('destination') || '';
    const airportCode = searchParams.get('airport') || 'SEA'; // default to SEA if not provided
    const parkingDurationStr = searchParams.get('parkingDuration');
    const parkingDuration = parkingDurationStr ? parseInt(parkingDurationStr, 10) : undefined;
    const parkingCheckInDate = searchParams.get('parkingCheckInDate') || '';
    const parkingCheckOutDate = searchParams.get('parkingCheckOutDate') || '';

    const transportRaw = searchParams.get('transport') || 'all';
    const transportAvailability = isOneOf(transportRaw, ['car', 'rideshare', 'transit', 'all'] as const)
      ? transportRaw
      : 'all';

    const intentParam = searchParams.get('intent') || '';

    const timeAnchorRaw = searchParams.get('timeAnchor');
    const timeAnchor: 'flight-departure' | 'airport-arrival' =
      timeAnchorRaw === 'airport-arrival' ? 'airport-arrival' : 'flight-departure';

    const checkingBags = (searchParams.get('bags') || 'no').toLowerCase() === 'yes';
    const checkedInRaw = (searchParams.get('checkedInAtAirport') || 'yes').toLowerCase();
    const checkedInAtAirport = checkedInRaw !== 'no';

    const securityRaw = searchParams.get('security') || 'standard';
    const securityOption: SecurityOption = isOneOf(
      securityRaw,
      ['standard', 'precheck', 'clear', 'clear-precheck'] as const
    )
      ? securityRaw
      : 'standard';

    const flightTypeRaw = searchParams.get('flightType') || 'domestic';
    const flightType: FlightType = isOneOf(
      flightTypeRaw,
      ['domestic', 'international'] as const
    )
      ? flightTypeRaw
      : 'domestic';

    const cabinRaw = searchParams.get('cabin') || 'economy';
    const cabin: CabinClass = isOneOf(
      cabinRaw,
      ['economy', 'premium'] as const
    )
      ? cabinRaw
      : 'economy';

    let data: TripData | null = null;

    if (type === 'one-way-departure') {
      const departureDate = searchParams.get('departureDate') || '';
      const departureTime = searchParams.get('departureTime') || '';

      let computedParkingDuration = parkingDuration;
      if (!computedParkingDuration && parkingCheckInDate && parkingCheckOutDate) {
        const checkIn = parseLocalDate(parkingCheckInDate);
        const checkOut = parseLocalDate(parkingCheckOutDate);
        if (checkIn && checkOut) {
          const diffMs = checkOut.getTime() - checkIn.getTime();
          const diffMinutes = Math.round(diffMs / 60000);

          if (diffMinutes > 0) {
            computedParkingDuration = Math.max(24 * 60, diffMinutes);
          }
        }
      }

      if (departureDate && departureTime && origin && destination) {
        data = intentParam === 'flying-out'
          ? {
            type,
            origin,
            destination,
            departureDate,
            departureTime,
            timeAnchor,
            parkingDuration: computedParkingDuration,
            parkingCheckInDate,
            parkingCheckOutDate,
            transportAvailability,
            checkingBags,
            securityOption,
            flightType,
            cabin,
            checkedInAtAirport,
            airportCode,
          }
          : {
            type,
            origin,
            destination,
            airportCode,
            departureDate,
            departureTime,
            timeAnchor,
            parkingDuration: computedParkingDuration,
            parkingCheckInDate,
            parkingCheckOutDate,
            transportAvailability,
            checkedInAtAirport,
          };
      }
    } else if (type === 'one-way-arrival') {
      const arrivalDate = searchParams.get('arrivalDate') || '';
      const arrivalTime = searchParams.get('arrivalTime') || '';
      if (arrivalDate && arrivalTime && origin && destination) {
        data = { type, origin, destination, arrivalDate, arrivalTime, transportAvailability };
      }
    } else if (type === 'round-trip') {
      const departureDate = searchParams.get('departureDate') || '';
      const departureTime = searchParams.get('departureTime') || '';
      const returnDate = searchParams.get('returnDate') || '';
      const returnTime = searchParams.get('returnTime') || '';
      if (departureDate && departureTime && returnDate && returnTime && origin && destination) {
        data = { type, origin, destination, departureDate, departureTime, returnDate, returnTime, parkingDuration, transportAvailability };
      }
    } else if (type === 'dropoff-pickup') {
      const airportTripDate = searchParams.get('airportTripDate') || '';
      const airportTripTime = searchParams.get('airportTripTime') || '';
      if (airportTripDate && airportTripTime && origin && destination) {
        data = { type, origin, destination, airportTripDate, airportTripTime, transportAvailability };
      }
    }

    if (data) { // Ensure airport code is included in trip data for consistent processing, even if not explicitly in URL params for some trip types
      data = { ...data, airportCode } as TripData;
    }

    if (data) {
      // Always show loading state for URL-driven recomputes (date/time/origin changes, etc.)
      setLoading(true);
      setShowTooLate(false);
      setRecommendation(null);
      setRankedOptions([]);

      fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })
        .then((response) => response.json())
        .then((rec: Recommendation) => {
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
        })
        .catch((error) => {
          console.error('Error fetching recommendations:', error);
          setLoading(false);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [searchParams]);

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

  const handleRecalculate = async (newTripData: TripData) => {
    // Reset old state immediately so stale high-risk/no-viable UI doesn't linger.
    setLoading(true);
    setShowTooLate(false);
    setRecommendation(null);
    setRankedOptions([]);

    try {
      const fetchStartTime = Date.now();
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTripData),
      });

      const rec: Recommendation = await response.json();
      const fetchDurationMs = Date.now() - fetchStartTime;

      setRecommendation(rec);
      setTripData(newTripData);

      const ranked = rankRecommendations(
        newTripData,
        rec.parking,
        rec.rideshare,
        rec.transit,
        rec.tsaEstimate
      );
      setRankedOptions(ranked);

      setIsEditing(false);
      setEditingData(null);

      const params = new URLSearchParams();

      params.set('type', newTripData.type);
      params.set('origin', newTripData.origin);
      params.set('destination', newTripData.destination);

      const nextTrip = newTripData as TripDataWithExtras;

      if (nextTrip.airportCode) {
        params.set('airport', nextTrip.airportCode);
      }

      if (nextTrip.transportAvailability) {
        params.set('transport', nextTrip.transportAvailability);
      }

      if (nextTrip.checkingBags !== undefined) {
        params.set('bags', nextTrip.checkingBags ? 'yes' : 'no');
      }

      if (nextTrip.securityOption) {
        params.set('security', nextTrip.securityOption);
      }

      if (nextTrip.flightType) {
        params.set('flightType', nextTrip.flightType);
      }

      if (nextTrip.cabin) {
        params.set('cabin', nextTrip.cabin);
      }

      params.set('sort', sort);

      // Preserve consumer-only context.
      const existingIntent = searchParams.get('intent');
      const existingAirlineOrFlight = searchParams.get('airlineOrFlight');
      if (existingIntent) params.set('intent', existingIntent);
      if (existingAirlineOrFlight) params.set('airlineOrFlight', existingAirlineOrFlight);

      if (newTripData.type === 'one-way-departure') {
        params.set('departureDate', newTripData.departureDate);
        params.set('departureTime', newTripData.departureTime);

        const nextTimeAnchor = (newTripData as TripDataWithExtras).timeAnchor;

        if (nextTimeAnchor) {
          params.set('timeAnchor', nextTimeAnchor);
        }
        params.set('checkedInAtAirport', (newTripData as TripDataWithExtras).checkedInAtAirport === false ? 'no' : 'yes');
        if (newTripData.parkingDuration) {
          params.set('parkingDuration', newTripData.parkingDuration.toString());
        }
        if (nextTrip.parkingCheckInDate) {
          params.set('parkingCheckInDate', nextTrip.parkingCheckInDate);
        }

        if (nextTrip.parkingCheckOutDate) {
          params.set('parkingCheckOutDate', nextTrip.parkingCheckOutDate);
        }
      } else if (newTripData.type === 'one-way-arrival') {
        params.set('arrivalDate', newTripData.arrivalDate);
        params.set('arrivalTime', newTripData.arrivalTime);
      } else if (newTripData.type === 'round-trip') {
        params.set('departureDate', newTripData.departureDate);
        params.set('departureTime', newTripData.departureTime);
        params.set('returnDate', newTripData.returnDate);
        params.set('returnTime', newTripData.returnTime);
        if (newTripData.parkingDuration) {
          params.set('parkingDuration', newTripData.parkingDuration.toString());
        }
      } else if (newTripData.type === 'dropoff-pickup') {
        params.set('airportTripDate', newTripData.airportTripDate);
        params.set('airportTripTime', newTripData.airportTripTime);
      }

      const newUrl = `/results?${params.toString()}`;

      // Use router.replace so Next's useSearchParams updates and TripData is rebuilt from the URL.
      router.replace(newUrl);
    } catch (error) {
      console.error('Error recalculating recommendations:', error);
      setLoading(false);
    } finally {
      // NOTE: We don't set loading to false here because the URL change will trigger useEffect
      // which will set loading back to true. We let the URL-driven fetch handle the final loading state.
    }
  };

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
      return { opt, timing: t };
    });

    const tooLate = timed.filter((x) => x.timing.status === 'too-late').map((x) => x.opt);
    const viable = timed.filter((x) => x.timing.status !== 'too-late').map((x) => x.opt);

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
  }, [sortedOptions, intent, tripData]);

  const bestViableLeaveByTime = useMemo(() => {
    const isFlyingOut = intent === 'flying-out' && tripData?.type === 'one-way-departure';
    if (!isFlyingOut || !tripData) return null;
    if (viableOptions.length === 0) return null;

    const first = viableOptions[0];
    const t = computeTimingStatus({ intent, tripData, optionTotalMinutes: first.duration });
    return t.latestSafeLeaveTime || null;
  }, [intent, tripData, viableOptions]);

  const currentAirportCode = ((tripData as TripDataWithExtras)?.airportCode || searchParams.get('airport') || 'SEA').toUpperCase();

  const currentAirport = getAirportById(currentAirportCode) || getAirportById('SEA')!;
  const displayDestination = currentAirport.label;

  const extraRideProviders = useMemo(
    () => [
      {
        id: 'uber-link',
        name: 'Uber',
        trustStatus: 'estimated' as const,
        priceDisplay: 'check-live' as const,
        priceNote: 'Prices vary widely by time and demand',
        sourceName: PROVIDER_LINKS.uberDeepLink.sourceName,
        sourceLink: PROVIDER_LINKS.uberDeepLink.url,
      },
      {
        id: 'lyft-link',
        name: 'Lyft',
        trustStatus: 'estimated' as const,
        priceDisplay: 'check-live' as const,
        priceNote: 'Prices vary widely by time and demand',
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
    if (!tripData) return;

    const refresh = async () => {
      try {
        const res = await fetch('/api/parking/live-refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            airportCode: tripData.airportCode,
            destination: tripData.destination,
            checkInDate: tripData.parkingCheckInDate,
            checkOutDate: tripData.parkingCheckOutDate,
          }),
        });

        const data = await res.json();

        if (data?.parking?.length) {
          if (Array.isArray(data?.parking) && data.parking.length > 0) {
            setRecommendation((prev) => {
              if (!prev) return prev;

              return {
                ...prev,
                parking: data.parking,
              };
            });
          }
        }
      } catch (e) {
        console.warn('live parking refresh failed');
      }
    };

    refresh();
  }, [tripData]);

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
        p.bookingProvider === 'AirportParkingReservations' ||
        p.sourceName === 'AirportParkingReservations'
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
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50">
        <div className="text-lg text-zinc-700">Loading options…</div>
      </div>
    );
  }

  if (!tripData || !recommendation) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="text-lg font-medium text-zinc-900">We couldn’t read your trip.</div>
        <div className="mt-1 text-sm text-zinc-600">Go back and try again.</div>
        <Link href="/trip" className="mt-5 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700">
          Plan a trip
        </Link>
      </div>
    );
  }

  const parkingOptions = recommendation.parking ?? [];

  const parkingOptionsWithLive = parkingOptions.map((p) => {
    const aprUpdated = withAprLivePrice(p, aprLivePrices) as ParkingOption;
    const matched =
      matchedParkingPrices[String(p.id || '')] ||
      matchedParkingPrices[String(p.name || '')] ||
      matchedParkingPrices[extractBrandKey(p.name)];

    if (!matched) return aprUpdated;

    return {
      ...aprUpdated,
      price: matched.price,
      priceUnit: matched.priceUnit || 'per-day',
      priceDisplay: 'from-per-day',
      priceNote: `Matched price from ${matched.provider || 'parking provider'}. Confirm final checkout price before booking.`,
      priceSource: 'provider-match',
      priceConfidence: 'medium',
      trustStatus: 'live',
      sourceName: matched.provider || aprUpdated.sourceName,
      sourceLink: matched.sourceLink || aprUpdated.sourceLink,
      bestFor: [
        ...(aprUpdated.bestFor || []),
        'Live Price',
      ],
    };
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

    const readiness = calculateAirportReadinessBuffer({
      checkingBags: !!tripExtras.checkingBags,
      securityOption: (tripExtras.securityOption || 'standard') as SecurityOption,
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

  const visibleResultOptions = sortedOptions.filter((o) => o.type !== 'parking');

  const parkingOptionsOnly = parkingOptionsWithLive.map((p, idx) => {
    const matchedRanked = sortedOptions.find((o) => {
      const rankedKey = parkingKeySafe(o.option as AppOption);
      const parkingKey = parkingKeySafe(p as AppOption);
      return rankedKey && parkingKey && rankedKey === parkingKey;
    });

    const breakdown = parkingTimeBreakdown(p as ParkingOption);

    return {
      ...(matchedRanked || {
        type: 'parking',
        score: 0,
        stressScore: 0,
        reasons: ['Available parking option'],
        cost: typeof p.price === 'number' ? p.price : 999,
        duration: breakdown.totalMinutes,
      }),
      type: 'parking',
      option: p,
      cost: typeof p.price === 'number' ? p.price : matchedRanked?.cost ?? 999,
    } as RankedRecommendation;
  });

  const parkingOptionsWithAprPricesRaw = parkingOptionsOnly.map((o) => {
    const updatedOption = withAprLivePrice(o.option as AppOption, aprLivePrices) as AppOption;
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

    const aTotal = getParkingComparableTotal(aOption as AppOption, tripData) ?? getParkingTotalPrice(aOption, tripData) ?? costOf(a) ?? 999999;
    const bTotal = getParkingComparableTotal(bOption as AppOption, tripData) ?? getParkingTotalPrice(bOption, tripData) ?? costOf(b) ?? 999999;

    const aDaily = getParkingDailyPrice(aOption, tripData) ?? aTotal;
    const bDaily = getParkingDailyPrice(bOption, tripData) ?? bTotal;

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
          sortedParkingForCurrentTab.map((opt) => opt.option as ParkingOption),
          tripData
        )
        : sortedParkingForCurrentTab.map((opt) => opt.option as ParkingOption);

    const canonical = canonicalizeParkingOptions(options);

    if (sort === 'cheapest') {
      const priced = canonical.filter((option) => hasRealParkingPrice(option));
      return priced.length > 0 ? priced : canonical;
    }

    return canonical;
  })();

  const cheapestSmartPickOptions =
    sort === 'cheapest'
      ? [...smartPickParkingOptions].sort((a, b) => {
        const aPrice = getParkingDailyPrice(a, tripData) ?? 999999;
        const bPrice = getParkingDailyPrice(b, tripData) ?? 999999;
        return aPrice - bPrice;
      })
      : smartPickParkingOptions;

  const smartPickOption = cheapestSmartPickOptions[0] || null;

  const smartPickKey = parkingKeySafe(smartPickOption);

  const isSameAsSmartPick = (option: AppOption | null | undefined): boolean => {
    const otherKey = option ? parkingKeySafe(option) : null;
    return Boolean(smartPickKey && otherKey && smartPickKey === otherKey);
  };

  const rawRecommendedPicks: RankedRecommendation[] = visibleResultOptions.slice(0, 3);

  const visibleMoreParkingCount = 10;
  const maxParkingDisplayCount = 25;

  const remainingParking = smartPickParkingOptions.slice(1).map((parkingOption: ParkingOption) => {
    const matchedRanked = sortedParkingForCurrentTab.find((ranked) => {
      const rankedKey = parkingKeySafe(ranked.option as AppOption);
      const parkingKey = parkingKeySafe(parkingOption as AppOption);
      return rankedKey && parkingKey && rankedKey === parkingKey;
    });

    return {
      ...(matchedRanked || {
        type: 'parking',
        score: 0,
        stressScore: 0,
        reasons: ['Available parking option'],
        cost: getParkingTotalPrice(parkingOption, tripData) ?? parkingOption.price ?? 999999,
        duration:
          (typeof parkingOption.distance === 'number' ? parkingOption.distance : 45) +
          (typeof parkingOption.parkingBufferMinutes === 'number' ? parkingOption.parkingBufferMinutes : 10) +
          (typeof parkingOption.transferToTerminalMinutes === 'number' ? parkingOption.transferToTerminalMinutes : 10),
      }),
      type: 'parking',
      option: parkingOption,
      cost: getParkingTotalPrice(parkingOption, tripData) ?? parkingOption.price ?? matchedRanked?.cost ?? 999999,
    } as RankedRecommendation;
  });

  const initiallyVisibleParking = remainingParking.slice(0, visibleMoreParkingCount);
  const expandedParking = remainingParking.slice(0, maxParkingDisplayCount);
  const hiddenParking = remainingParking.slice(visibleMoreParkingCount, maxParkingDisplayCount);
  const displayedParking = showMoreParking ? expandedParking : initiallyVisibleParking;

  async function handleShowReviews(parking: ParkingOption) {
    setReviewsParking(parking);

    const enriched = await attachGooglePlaceToParking(parking, tripData);

    setReviewsParking(enriched);
  }

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans">
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pb-24 pt-8">
        {/* Hero */}
        {/* Hero */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            {/* Left: main decision */}
            <div>
              <div className="text-sm font-medium text-zinc-500">
                {searchParams.get('airport') || 'SEA'}
              </div>

              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
                {noViableFlyingOut
                  ? 'No reliable option gets you airport-ready on time'
                  : intent === 'flying-out' && tripData.type === 'one-way-departure' && bestViableLeaveByTime
                    ? `You should leave at ${formatTimeFriendly(bestViableLeaveByTime)}`
                    : recommendation.leaveByTime
                      ? `You should leave at ${formatTimeFriendly(recommendation.leaveByTime)}`
                      : 'Your best options'}
              </h1>

              {noViableFlyingOut && bestTooLateSummary?.bestLatestSafeLeave && bestTooLateSummary?.bestArrival && (
                <div className="mt-2 text-sm text-zinc-600">
                  Best available attempt leaves at {formatTimeFriendly(bestTooLateSummary.bestLatestSafeLeave)} and reaches terminal around {formatTimeFriendly(bestTooLateSummary.recommendedBy || bestTooLateSummary.bestArrival)}.
                </div>
              )}

              <p className="mt-2 text-sm text-zinc-600">
                {displayDestination}
                {intent ? ` • ${intent.replace(/-/g, ' ')}` : ''}
                {airlineOrFlight ? ` • ${airlineOrFlight}` : ''}
              </p>

              {(tripData.type === 'one-way-departure' || tripData.type === 'round-trip') &&
                recommendation.tsaEstimate && (
                  <TsaWaitTimesCard
                    tsaEstimate={recommendation.tsaEstimate}
                    airportCode={tripData?.airportCode}
                  />
                )}

              <p className="mt-2 text-sm text-zinc-500">
                Live traffic + airport timing + parking pricing analyzed
              </p>

              {aprLiveChecking && parkingPricesChecking && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  Checking live parking prices and availability…
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
            <div className="space-y-3 lg:border-l lg:border-zinc-100 lg:pl-5">
              {recommendation.weatherImpact && (
                <div className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3 text-sm">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${weatherToneBg}`}>
                    {recommendation.weatherImpact.condition === 'rain'
                      ? '🌧️'
                      : recommendation.weatherImpact.condition === 'snow'
                        ? '🌨️'
                        : recommendation.weatherImpact.condition === 'storm'
                          ? '⛈️'
                          : recommendation.weatherImpact.condition === 'wind'
                            ? '🌬️'
                            : '☀️'}
                  </div>

                  <div className="flex flex-col">
                    <span className={`font-medium ${weatherTone}`}>
                      {recommendation.weatherImpact.summary}
                      {typeof recommendation.weatherImpact.temperatureF === 'number'
                        ? ` · ${recommendation.weatherImpact.temperatureF}°F`
                        : ''}
                    </span>

                    <span className="text-xs text-zinc-500">
                      {recommendation.weatherImpact.riskLevel === 'low'
                        ? 'Normal travel conditions'
                        : recommendation.weatherImpact.riskLevel === 'medium'
                          ? 'May impact comfort'
                          : 'Plan for weather impact'}
                    </span>
                  </div>
                </div>
              )}

              {heroAirportTiming && (
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <div className="text-sm text-zinc-500">
                    Recommended inside-airport arrival by
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
          <div className="rounded-xl bg-zinc-50 p-4">
            <div className="text-xs font-medium text-zinc-500">Origin</div>
            <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{tripData.origin}</div>
          </div>

          <div className="rounded-xl bg-zinc-50 p-4">
            <div className="text-xs font-medium text-zinc-500">Destination</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">
              {displayDestination}
            </div>
          </div>

          <div className="rounded-xl bg-zinc-50 p-4">
            <div className="text-xs font-medium text-zinc-500">Traffic estimate</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">
              {recommendation.trafficEstimate ? formatMinutes(recommendation.trafficEstimate.duration) : '—'}
            </div>
            <div className="mt-1 text-xs text-zinc-600">
              {recommendation.trafficEstimate ? (
                recommendation.trafficEstimate.trustStatus === 'live' ? (
                  <>
                    <span>Live traffic data · Updated just now</span>
                    {recommendation.trafficEstimate.staticDuration && (
                      <div className="text-xs text-zinc-600">
                        Typical: {formatMinutes(Math.min(recommendation.trafficEstimate.staticDuration, recommendation.trafficEstimate.duration))}-{formatMinutes(Math.max(recommendation.trafficEstimate.staticDuration, recommendation.trafficEstimate.duration))}
                      </div>
                    )}
                  </>
                ) : (
                  `${recommendation.trafficEstimate.congestion} congestion`
                )
              ) : 'No traffic estimate'}
            </div>
          </div>
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

        {/* Edit panel */}
        {
          isEditing && editingData && (
            <div id="edit-trip-panel" className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
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
                    'scroll-mt-6 rounded-3xl border bg-white p-6 shadow-sm transition-all duration-300 ' +
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
                    onSubmit={(data) => {
                      const params = new URLSearchParams(searchParams.toString());

                      Object.entries(data).forEach(([key, value]) => {
                        if (value !== undefined && value !== null && value !== '') {
                          params.set(key, String(value));
                        }
                      });

                      const selectedAirport =
                        getAirportById(((data as TripDataWithExtras).airportCode || 'SEA').toUpperCase()) ||
                        getAirportById('SEA')!;

                      params.set('airportCode', selectedAirport.id);
                      params.set('airport', selectedAirport.id);
                      params.set('airportName', selectedAirport.label);
                      params.set('destination', selectedAirport.routingAddress);
                      params.set('rideshareDestinationName', selectedAirport.rideshareDestinationName);
                      params.set('airportCheckinNote', selectedAirport.checkinNote || '');

                      params.set('airportLat', String(selectedAirport.geoLocation.lat));
                      params.set('airportLng', String(selectedAirport.geoLocation.lng));

                      params.set('intent', intent || params.get('intent') || 'flying-out');

                      const nextUrl = `/results?${params.toString()}`;

                      setIsEditing(false);
                      setEditingData(null);

                      router.push(nextUrl);
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

        {
          showParkingProviders && smartPickParkingOptions.length > 0 && (
            <div className="mt-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">Parking options</h2>
              </div>

              <ParkingSmartPick
                options={cheapestSmartPickOptions.map((p) => googleEnrichedParking[p.id] || p)}
                tripData={tripData}
                leaveByTime={recommendation.leaveByTime}
                selectedOption={
                  smartPickOption
                    ? googleEnrichedParking[smartPickOption.id] || smartPickOption
                    : smartPickOption
                }
                aprLivePrices={aprLivePrices}
                aprLiveChecking={aprLiveChecking}
                weatherImpact={recommendation?.weatherImpact}
                onShowReviews={handleShowReviews}
              />
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
                <div className="fixed inset-0 z-[100] bg-black/50 p-3 sm:p-6">
                  <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">

                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Parking map</div>
                        <div className="text-xs text-zinc-500">Available lots around airport</div>
                      </div>

                      <button
                        onClick={() => setShowMapModal(false)}
                        className="cursor-pointer rounded-full border px-3 py-1 text-sm"
                      >
                        Close
                      </button>
                    </div>

                    {/* Map */}
                    <div className="flex-1">
                      <ParkingLotsMap
                        airportCode={tripData?.airportCode}
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
              {remainingParking.length > 0 && (
                <section className="mt-8">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-900">More parking options</h2>
                      <p className="mt-1 text-sm text-zinc-600">
                        Additional live and baseline parking choices.
                      </p>
                    </div>

                    {hiddenParking.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowMoreParking((v) => !v)}
                        className="text-sm font-medium text-blue-700 hover:text-blue-800"
                      >
                        {showMoreParking ? 'Show top 5 only' : `Show ${hiddenParking.length} more parking options`}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {displayedParking.map((opt, idx) => (
                      <OptionCard
                        aprLivePrices={aprLivePrices}
                        aprLiveChecking={aprLiveChecking}
                        compact
                        key={`parking-${opt.type}-${(opt.option as AppOption).id || idx}`}
                        item={opt}
                        rank={idx + 1}
                        tripData={tripData}
                        intent={intent}
                        sort={sort}
                        onShowReviews={setReviewsParking}
                        googleEnrichedParking={googleEnrichedParking}
                      />
                    ))}
                  </div>
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
        <div className="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {showRideProviders && (
            <ProviderDropdownSection
              title="Ride providers"
              subtitle="Compare Uber, Lyft, taxi, and live provider links."
              items={rideProviderItems}
              defaultOpen={false}
            />
          )}

          <ProviderDropdownSection
            title="Transit options"
            subtitle="Compare route planning, fares, confidence, and links."
            items={[...(transitOptions), ...extraTransitProviders]}
            defaultOpen={false}
          />

          <ParkingReviewsModal
            parking={reviewsParking}
            open={!!reviewsParking}
            onClose={() => setReviewsParking(null)}
          />
        </div>

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
}: {
  initialData: TripData;
  onSubmit: (data: TripData) => void;
  onCancel: () => void;
  intent: string;
  airportCode: string;
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

  const showAirportTimingControls = intent === 'flying-out' && initialData.type === 'one-way-departure';

  const [checkingBags, setCheckingBags] = useState<boolean>(!!(initialData as TripDataWithExtras).checkingBags);
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

  const [refreshingParking, setRefreshingParking] = useState(false);

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

    if (initialData.type === 'one-way-departure') {
      data = {
        type: initialData.type,
        origin,
        destination,
        airportCode: selectedAirport.id,
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
      };
    } else {
      data = {
        type: initialData.type,
        origin,
        destination,
        airportCode: selectedAirport.id,
        departureDate,
        departureTime,
        returnDate,
        returnTime,
        parkingDuration,
        transportAvailability,
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
            <label className="block text-sm font-medium text-zinc-800">Airport</label>
            <select
              value={selectedAirportCode}
              onChange={(e) => {
                const nextCode = e.target.value.toUpperCase();
                console.log('airport changed', nextCode);
                setSelectedAirportCode(nextCode);
              }}
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {AIRPORTS_CATALOG.map((airport) => (
                <option key={airport.id} value={airport.id}>
                  {airport.id} — {airport.label}
                </option>
              ))}
            </select>
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


            {/* <div>
              <label className="block text-sm font-medium text-zinc-800">
                Return / parking check-out time
                <span className="ml-1 text-xs font-normal text-zinc-500">Optional</span>
              </label>
              <input
                type="time"
                value={parkingCheckOutTime}
                onChange={(e) => setParkingCheckOutTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <div className="mt-2 text-xs text-zinc-500">
                Optional — defaults to your flight time if blank.
              </div>
            </div> */}
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

        {/* {(isDeparture || isRoundTrip) && (
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-800">
              Parking duration (hours)
              <span className="ml-1 text-xs font-normal text-zinc-500">Optional</span>
            </label>
            <input
              type="number"
              value={parkingDurationHours}
              onChange={(e) => setParkingDurationHours(e.target.value)}
              min="0.5"
              step="0.5"
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        )} */}
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
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Recalculate
        </button>
      </div>
    </form>
  );
}

