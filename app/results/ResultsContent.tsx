'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CabinClass, FlightType, SecurityOption, TransportAvailability, Recommendation, TripData, TrustStatus } from '../../lib/types';
import { RecommendationEngine } from '../../lib/recommendationEngine';
import { RankedRecommendation } from '../../lib/domain';
import { resolveSeatacCheckinZone } from '../../lib/airports/seatacCheckin';
import { PROVIDER_LINKS } from '../../lib/providerCatalog';
import ParkingBookingComparison from './ParkingBookingComparison';
import { AddressInput } from '../trip/AddressInput';
import { AIRPORTS_CATALOG, getAirportById } from '../../lib/airports/catalog';
import ParkingSmartPick from './ParkingSmartPick';

type SortTab = 'easiest' | 'cheapest' | 'fastest';

function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded % 1 === 0 ? `$${rounded.toFixed(0)}` : `$${rounded.toFixed(2)}`;
}

function formatMoneyCents(n: number): string {
  return `$${n.toFixed(2)}`;
}

function parkingKey(v: any): string {
  const raw = String(v?.id || v?.name || '')
    .toLowerCase()
    .replace(/parking/g, '')
    .replace(/official/g, '')
    .replace(/[^a-z0-9]/g, '');

  if (raw.includes('doubletree')) return 'doubletree';
  if (raw.includes('wally')) return 'wallypark';
  if (raw.includes('master')) return 'masterpark';
  if (raw.includes('jiffy')) return 'jiffy';
  if (raw.includes('general')) return 'officialgeneral';
  if (raw.includes('reserved')) return 'officialreserved';

  return raw;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;

  const days = Math.floor(min / (60 * 24));
  const hours = Math.floor((min % (60 * 24)) / 60);
  const minutes = min % 60;

  let result = '';
  if (days > 0) {
    result += `${days}d `;
  }
  if (hours > 0 || days > 0) {
    result += `${hours}h `;
  }
  if (minutes > 0) {
    result += `${minutes}m`;
  }

  return result.trim();
}

function parseHHMMToMinutes(time24: string): number | null {
  const m = time24.match(/^([0-2]\d):([0-5]\d)$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function minutesToHHMM(totalMinutes: number): string {
  const m = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatTimeFriendly(time24: string): string {
  const m = time24.match(/^([0-2]\d):([0-5]\d)$/);
  if (!m) return time24;
  let hours = Number(m[1]);
  const minutes = m[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${ampm}`;
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

function bestLink(option: any): string | null {
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

function formatProviderPrice(it: any): { primary: string; secondary?: string } {
  const kind = it.priceDisplay as string | undefined;
  const unit = it.priceUnit as string | undefined;

  if (kind === 'check-live') {
    if (typeof it.price === 'number' && it.price > 0) {
      return {
        primary:
          it.priceUnit === 'per-day'
            ? `${formatMoney(it.price)}/day`
            : formatMoney(it.price),
        secondary: it.priceNote,
      };
    }

    return { primary: 'Check live price', secondary: it.priceNote };
  }

  if (kind === 'from-per-day' && unit === 'per-day' && typeof it.price === 'number') {
    return { primary: `From ${formatMoney(it.price)}/day`, secondary: it.priceNote };
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

function PricingLinksSection({
  title,
  items,
}: {
  title: string;
  items: Array<any>;
}) {
  if (!items || items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
        <p className="mt-1 text-sm text-zinc-600">Pricing + links (best-effort, may vary).</p>
      </div>
      <div className="divide-y divide-zinc-100">
        {items.map((it: any) => {
          const trust = confidenceFromTrust((it.trustStatus || 'estimated') as TrustStatus);
          const price = formatProviderPrice(it);
          const link = bestLink(it);
          const kind = it.priceDisplay as string | undefined;

          return (
            <div key={it.id || it.name} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-900">{it.name}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + trust.className}>
                    {trust.label}
                  </div>
                  {kind && (
                    <div className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
                      {pricingKindLabel(kind)}
                    </div>
                  )}
                </div>
                {price.secondary && (
                  <div className="mt-2 text-xs text-zinc-500">{price.secondary}</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-zinc-900">{price.primary}</div>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Check
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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

function optionPriceSummary(option: any, computedTotal: number, tripData: TripData | null): { primary: string; secondary?: string; badge?: string } {
  const kind = option?.priceDisplay as string | undefined;
  const unit = option?.priceUnit as string | undefined;

  if (kind === 'check-live') {
    if (typeof option?.price === 'number' && option.price > 0) {
      return {
        primary:
          option.priceUnit === 'per-day'
            ? `${formatMoney(option.price)}/day`
            : formatMoney(option.price),
        secondary: option?.priceNote,
        badge: option.priceConfidence === 'medium'
          ? 'Baseline price'
          : undefined,
      };
    }

    return {
      primary: 'Check live price',
      secondary: option?.priceNote,
      badge: 'Check live price',
    };
  }

  if (kind === 'from-per-day' && unit === 'per-day' && typeof option?.price === 'number') {
    // If parking duration is available in tripData, compute estimated trip total using ceiling(days).
    if (tripData && 'parkingDuration' in tripData && tripData.parkingDuration) {
      const minutes = tripData.parkingDuration as number;
      const hours = minutes / 60;
      const days = Math.max(1, Math.ceil(hours / 24));
      const tripTotal = option.price * days;
      return {
        primary: `From ${formatMoney(option.price)}/day`,
        secondary: `Est. trip total: ${formatMoney(tripTotal)} for ${days} day(s) · Check final price with provider`,
        badge: undefined,
      };
    }

    return {
      primary: `From ${formatMoney(option.price)}/day`,
      secondary: option?.priceNote,
      badge: undefined,
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
      badge: undefined,
    };
  }

  // Default legacy behavior
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
  priceDisplay: 'estimated' | 'check-live' | 'live';
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

function estimateParkingDays(tripData: TripData | null): number {
  if (!tripData) return 1;
  if ((tripData.type === 'one-way-departure' || tripData.type === 'round-trip') && (tripData as any).parkingDuration) {
    const minutes = (tripData as any).parkingDuration as number;
    const hours = minutes / 60;
    return Math.max(1, Math.ceil(hours / 24));
  }
  return 1;
}

function googleMapsSearchLink(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildLocalDateTime(dateString: string, timeString: string): Date | null {
  // Construct a local Date reliably (avoids timezone quirks of Date.parse on YYYY-MM-DD strings).
  const mDate = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mTime = timeString.match(/^(\d{2}):(\d{2})$/);
  if (!mDate || !mTime) return null;

  const y = Number(mDate[1]);
  const mo = Number(mDate[2]);
  const d = Number(mDate[3]);
  const hh = Number(mTime[1]);
  const mm = Number(mTime[2]);

  if (![y, mo, d, hh, mm].every(Number.isFinite)) return null;
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

function formatLocalYYYYMMDD(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildBookingSourceRows(parking: any, tripData: TripData | null): BookingSourceRow[] {
  const id = String(parking?.id || '').toLowerCase();
  const name = String(parking?.name || '').toLowerCase();

  const isWally = id.includes('wally') || name.includes('wally');
  const isMaster = id.includes('master') || name.includes('master');
  const airportCode = ((tripData as any)?.airportCode || 'SEA').toUpperCase();
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
    priceDisplay: 'estimated' | 'check-live' | 'live';
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

  const directPriceDisplay: 'estimated' | 'check-live' | 'live' =
    parking?.trustStatus === 'live' || parking?.bookingProvider === 'AirportParkingReservations'
      ? 'live'
      : parking?.priceDisplay === 'live'
        ? 'live'
        : (directPricePerDay != null ? 'estimated' : 'check-live');

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

function computeAirportReadyBufferMinutes(tripData: TripData): { bufferMinutes: number; assumptions: string[] } | null {
  if (tripData.type !== 'one-way-departure') return null;

  const checkingBags = !!(tripData as any).checkingBags;
  const securityOption = String((tripData as any).securityOption || 'standard');
  const flightType = String((tripData as any).flightType || 'domestic');
  const cabin = String((tripData as any).cabin || 'economy');
  const checkedInAtAirport = (tripData as any).checkedInAtAirport !== false; // default: true

  let buffer = 90;
  if (flightType === 'international') buffer = 180;
  else if (checkingBags) buffer = 120;

  if (securityOption === 'precheck') buffer -= 15;
  else if (securityOption === 'clear') buffer -= 10;
  else if (securityOption === 'clear-precheck') buffer -= 25;

  if (cabin === 'premium') buffer -= 5;

  // Add 15 minutes if not already checked in
  if (!checkedInAtAirport) buffer += 15;

  buffer = Math.max(60, buffer);

  const assumptions: string[] = [];
  assumptions.push(flightType === 'international' ? 'International flight' : 'Domestic flight');
  assumptions.push(checkingBags ? 'Checked bags: Yes' : 'Checked bags: No');

  const secLabel = securityOption === 'precheck'
    ? 'TSA PreCheck'
    : securityOption === 'clear'
      ? 'CLEAR'
      : securityOption === 'clear-precheck'
        ? 'CLEAR + PreCheck'
        : 'Standard TSA';
  assumptions.push(`Security: ${secLabel}`);

  assumptions.push(cabin === 'premium' ? 'Cabin: Premium/Business/First' : 'Cabin: Economy');
  assumptions.push(checkedInAtAirport ? 'Already checked in: Yes' : 'Already checked in: No');
  assumptions.push(`Airport-ready buffer: ${buffer} min (min 60 min)`);

  return { bufferMinutes: buffer, assumptions };
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
  if (!depDt || isNaN(depDt.getTime())) return { status: 'n/a' };

  const todayLocal = formatLocalYYYYMMDD(now);
  const isFutureDate = tripData.departureDate !== todayLocal;

  const computeCushionMinutes = (leaveDt: Date): number => {
    const diffMs = leaveDt.getTime() - now.getTime();
    return diffMs >= 0 ? Math.ceil(diffMs / 60000) : Math.floor(diffMs / 60000);
  };

  // For same-day flights, apply sanity check to catch parse errors (e.g., "23:30" late-night time incorrectly parsed as next day)
  if (!isFutureDate) {
    let recommendedInsideArrivalByDt = new Date(depDt.getTime() - buf.bufferMinutes * 60000);
    let latestSafeLeaveDt = new Date(recommendedInsideArrivalByDt.getTime() - optionTotalMinutes * 60000);
    let minutesUntilLeaveBy = computeCushionMinutes(latestSafeLeaveDt);

    // Sanity check: if cushion is absurdly large (>12 hours), likely a parse error
    if (minutesUntilLeaveBy > 12 * 60) {
      const depAlt = buildLocalDateTime(todayLocal, tripData.departureTime);
      if (depAlt && !isNaN(depAlt.getTime())) {
        const recommendedAlt = new Date(depAlt.getTime() - buf.bufferMinutes * 60000);
        const leaveAlt = new Date(recommendedAlt.getTime() - optionTotalMinutes * 60000);
        const altCushion = computeCushionMinutes(leaveAlt);

        // Accept recovery only if cushion is plausible (within ±12 hours)
        if (Math.abs(altCushion) <= 12 * 60) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ViabilityDebug] Same-day parse recovery applied:', {
              original: { minutesUntilLeaveBy, depDt: depDt.toString() },
              recovered: { altCushion, depDt: depAlt.toString() },
            });
          }
          depDt = depAlt;
          recommendedInsideArrivalByDt = recommendedAlt;
          latestSafeLeaveDt = leaveAlt;
          minutesUntilLeaveBy = altCushion;
        }
      }
    }
  }

  // Now calculate final values (works for both same-day and future dates)
  const recommendedInsideArrivalByDt = new Date(depDt.getTime() - buf.bufferMinutes * 60000);
  const latestSafeLeaveDt = new Date(recommendedInsideArrivalByDt.getTime() - optionTotalMinutes * 60000);
  const minutesUntilLeaveBy = computeCushionMinutes(latestSafeLeaveDt);
  const missedBy = Math.max(0, Math.ceil((now.getTime() - latestSafeLeaveDt.getTime()) / 60000));

  const status: TimingStatus =
    missedBy > 0
      ? 'too-late'
      : minutesUntilLeaveBy <= 15
        ? 'tight'
        : 'good';

  if (process.env.NODE_ENV === 'development') {
    console.log('[ViabilityDebug] computeTimingStatus:', {
      departureDate: tripData.departureDate,
      departureTime: tripData.departureTime,
      isFutureDate,
      todayLocal,
      depDtLocal: depDt.toString(),
      nowLocal: now.toString(),
      minutesUntilLeaveBy,
      missedBy,
      status,
      optionTotalMinutes,
    });
  }

  return {
    status,
    flightDeparts: tripData.departureTime,
    recommendedInsideArrivalBy: formatHHMMFromDate(recommendedInsideArrivalByDt),
    optionTravelMinutes: optionTotalMinutes,
    latestSafeLeaveTime: formatHHMMFromDate(latestSafeLeaveDt),
    shortByMinutes: missedBy > 0 ? missedBy : undefined,
    minutesUntilLeaveBy: missedBy === 0 ? Math.max(0, minutesUntilLeaveBy) : undefined,
    youReachTerminalAround: formatHHMMFromDate(recommendedInsideArrivalByDt),
    assumptions: buf.assumptions,
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

function OptionCard({
  compact = false,
  item,
  rank,
  tripData,
  intent,
  sort,
}: {
  compact?: boolean;
  item: RankedRecommendation;
  rank: number;
  tripData: TripData | null;
  intent: string;
  sort: SortTab;
}) {
  const opt: any = item.option;

  const airportCode = ((tripData as any)?.airportCode || 'SEA').toUpperCase();
  const airport = getAirportById(airportCode) || getAirportById('SEA')!;
  const safeParkingSearchQuery = `${airport.label} ${airport.id} airport parking`;

  const trust = confidenceFromTrust((opt.trustStatus || 'estimated') as TrustStatus);

  const sourceLink = opt.sourceLink || null;
  const routeLink = opt.mapLink || null;

  const price = optionPriceSummary(opt, item.cost, tripData);

  const timing = computeTimingStatus({
    intent,
    tripData,
    optionTotalMinutes: item.duration,
  });
  const timingMeta = timingBadge(timing.status);

  const timingSummary = (() => {
    if (timing.status === 'n/a' || !timing.latestSafeLeaveTime || !timing.youReachTerminalAround) return null;

    if (process.env.NODE_ENV === 'development' && timing.debug) {
      console.log('[AirportTimingDebug]', {
        nowLocal: timing.debug.nowLocal,
        departureDate: timing.debug.departureDate,
        departureTime: timing.debug.departureTime,
        flightDepartureDateTimeLocal: timing.debug.departureLocal,
        recommendedInsideAirportArrivalByLocal: timing.debug.recommendedInsideArrivalByLocal,
        latestSafeLeaveLocal: timing.debug.latestSafeLeaveLocal,
        cushionMinutes: timing.debug.cushionMinutes,
        status: timing.status,
      });
    }

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

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="text-lg font-semibold text-zinc-900">{price.primary}</div>
            <div className="text-sm text-zinc-600">• {formatMinutes(item.duration)}</div>
            <div className={"rounded-full border px-2.5 py-1 text-xs font-medium " + trust.className}>
              {trust.label}
            </div>
            {timingMeta && (
              <div className={"rounded-full border px-2.5 py-1 text-xs font-medium " + timingMeta.className}>
                {timingMeta.label}
              </div>
            )}
            {price.badge && (
              <div className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
                {price.badge}
              </div>
            )}

            {item.type === 'parking' &&
              Array.isArray(opt.bestFor) &&
              opt.bestFor.slice(0, 3).map((tag: string) => (
                <div
                  key={tag}
                  className={
                    'rounded-full border px-2.5 py-1 text-xs font-medium ' +
                    (tag === 'Great Deal' || tag === 'Cheapest'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : tag === 'Live Price'
                        ? 'border-blue-200 bg-blue-50 text-blue-800'
                        : 'border-zinc-200 bg-white text-zinc-700')
                  }
                >
                  {tag}
                </div>
              ))}
          </div>
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

          {price.secondary && !compact && (
            <div className="mt-2 text-xs text-zinc-500">{price.secondary}</div>
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

        <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:items-stretch">
          {compact ? (
            sourceLink ? (
              <button
                type="button"
                onClick={() =>
                  item.type === 'parking'
                    ? copyTextThenOpen(opt.searchQuery || safeParkingSearchQuery, sourceLink)
                    : window.open(sourceLink, '_blank', 'noopener,noreferrer')
                }
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {item.type === 'parking' ? 'Check price' : 'View'}
              </button>
            ) : null
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
                  Copy search + open
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

              {routeLink && (
                <a
                  href={routeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Route
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

            {item.type === 'parking' && !compact && (
              <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-3">
                <div className="text-sm font-medium text-zinc-900">Time breakdown</div>
                <div className="mt-2 space-y-1 text-sm text-zinc-700">
                  <div>Drive: {formatMinutes(typeof opt.distance === 'number' ? opt.distance : 0)}</div>
                  <div>Park/check-in: {typeof opt.parkingBufferMinutes === 'number' ? opt.parkingBufferMinutes : 0} min</div>
                  <div>
                    {(opt.transferType === 'shuttle'
                      ? 'Shuttle to terminal'
                      : opt.transferType === 'airport-garage'
                        ? 'Garage to terminal'
                        : 'Walk to terminal')}
                    : {typeof opt.transferToTerminalMinutes === 'number' ? opt.transferToTerminalMinutes : 0} min
                  </div>
                  <div className="pt-1 font-medium text-zinc-900">Total: {formatMinutes(item.duration)}</div>
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

export default function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [rankedOptions, setRankedOptions] = useState<RankedRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tripData, setTripData] = useState<TripData | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editingData, setEditingData] = useState<TripData | null>(null);

  const [sort, setSort] = useState<SortTab>(() => {
    const sortParam = (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('sort') : null) as SortTab | null;
    return sortParam === 'cheapest' || sortParam === 'fastest' || sortParam === 'easiest' ? sortParam : 'easiest';
  });
  const [showTooLate, setShowTooLate] = useState(false);

  const [showMoreParking, setShowMoreParking] = useState(false);
  const [showRideshare, setShowRideshare] = useState(false);
  const [showTransit, setShowTransit] = useState(false);

  const airlineOrFlight = searchParams.get('airlineOrFlight') || '';
  const intent = searchParams.get('intent') || '';

  const seatacZone = useMemo(() => {
    if (!airlineOrFlight) return null;
    return resolveSeatacCheckinZone(airlineOrFlight);
  }, [airlineOrFlight]);

  useEffect(() => {
    const sortParam = searchParams.get('sort');
    if (sortParam === 'cheapest' || sortParam === 'fastest' || sortParam === 'easiest') {
      setSort(sortParam);
    } else {
      setSort('easiest');
    }
  }, [searchParams]);

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
    const type = searchParams.get('type') as TripData['type'] | null;
    const origin = searchParams.get('origin') || '';
    const destination = searchParams.get('destination') || '';
    const airportCode = searchParams.get('airport') || 'SEA'; // default to SEA if not provided
    const parkingDurationStr = searchParams.get('parkingDuration');
    const parkingDuration = parkingDurationStr ? parseInt(parkingDurationStr, 10) : undefined;

    const transportRaw = searchParams.get('transport') || 'all';
    const transportAvailability = (['car', 'rideshare', 'transit', 'all'] as const).includes(transportRaw as any)
      ? (transportRaw as any)
      : 'all';

    const intentParam = searchParams.get('intent') || '';

    const bagsRaw = (searchParams.get('bags') || 'no').toLowerCase();
    const checkingBags = bagsRaw === 'yes';
    const checkedInRaw = (searchParams.get('checkedInAtAirport') || 'yes').toLowerCase();
    const checkedInAtAirport = checkedInRaw !== 'no';

    const securityRaw = (searchParams.get('security') || 'standard').toLowerCase();
    const securityOption = (['standard', 'precheck', 'clear', 'clear-precheck'] as const).includes(securityRaw as any)
      ? (securityRaw as any)
      : 'standard';

    const flightTypeRaw = (searchParams.get('flightType') || 'domestic').toLowerCase();
    const flightType = (['domestic', 'international'] as const).includes(flightTypeRaw as any)
      ? (flightTypeRaw as any)
      : 'domestic';

    const cabinRaw = (searchParams.get('cabin') || 'economy').toLowerCase();
    const cabin = (['economy', 'premium'] as const).includes(cabinRaw as any)
      ? (cabinRaw as any)
      : 'economy';

    let data: TripData | null = null;

    if (type === 'one-way-departure') {
      const departureDate = searchParams.get('departureDate') || '';
      const departureTime = searchParams.get('departureTime') || '';
      if (departureDate && departureTime && origin && destination) {
        data = intentParam === 'flying-out'
          ? { type, origin, destination, departureDate, departureTime, parkingDuration, transportAvailability, checkingBags, securityOption, flightType, cabin, checkedInAtAirport }
          : { type, origin, destination, departureDate, departureTime, parkingDuration, transportAvailability, checkedInAtAirport };
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

      if (process.env.NODE_ENV === 'development') {
        console.log('[Recs] URL→TripData', {
          type: data.type,
          origin: data.origin,
          destination: data.destination,
          departureDate: (data as any).departureDate,
          departureTime: (data as any).departureTime,
          airportTripDate: (data as any).airportTripDate,
          airportTripTime: (data as any).airportTripTime,
        });
      }

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

          const ranked = RecommendationEngine.getRankedRecommendations(
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

  const handleRecalculate = async (newTripData: TripData) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[EditTrip] Recalculate started', {
        type: newTripData.type,
        origin: newTripData.origin,
        destination: newTripData.destination,
        departureDate: (newTripData as any).departureDate,
        departureTime: (newTripData as any).departureTime,
        timestamp: new Date().toISOString(),
      });
    }

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

      if (process.env.NODE_ENV === 'development') {
        console.log('[EditTrip] Recommendations fetched', {
          duration: `${fetchDurationMs}ms`,
          parkingCount: rec.parking?.length || 0,
          rideshareCount: rec.rideshare?.length || 0,
          transitCount: rec.transit?.length || 0,
          timestamp: new Date().toISOString(),
        });
      }

      setRecommendation(rec);
      setTripData(newTripData);

      const ranked = RecommendationEngine.getRankedRecommendations(
        newTripData,
        rec.parking,
        rec.rideshare,
        rec.transit,
        rec.tsaEstimate
      );
      setRankedOptions(ranked);

      if (process.env.NODE_ENV === 'development') {
        console.log('[EditTrip] Options ranked', {
          rankedCount: ranked.length,
          timestamp: new Date().toISOString(),
        });
      }

      setIsEditing(false);
      setEditingData(null);

      const params = new URLSearchParams();
      params.set('type', newTripData.type);
      params.set('origin', newTripData.origin);
      params.set('destination', newTripData.destination);
      if ((newTripData as any).airportCode) {
        params.set('airport', (newTripData as any).airportCode);
      }

      if ((newTripData as any).transportAvailability) {
        params.set('transport', (newTripData as any).transportAvailability);
      }
      if ((newTripData as any).checkingBags !== undefined) {
        params.set('bags', (newTripData as any).checkingBags ? 'yes' : 'no');
      }
      if ((newTripData as any).securityOption) {
        params.set('security', (newTripData as any).securityOption);
      }
      if ((newTripData as any).flightType) {
        params.set('flightType', (newTripData as any).flightType);
      }
      if ((newTripData as any).cabin) {
        params.set('cabin', (newTripData as any).cabin);
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
        params.set('checkedInAtAirport', (newTripData as any).checkedInAtAirport === false ? 'no' : 'yes');
        if (newTripData.parkingDuration) {
          params.set('parkingDuration', newTripData.parkingDuration.toString());
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
      if (process.env.NODE_ENV === 'development') {
        console.log('[EditTrip] URL params after update', {
          url: newUrl,
          params: Object.fromEntries(params),
          timestamp: new Date().toISOString(),
        });
      }

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

  const sortedOptions = useMemo(() => {
    const arr = [...rankedOptions];

    const timingRank = (status: TimingStatus): number => {
      if (status === 'good') return 0;
      if (status === 'tight') return 1;
      if (status === 'too-late') return 2;
      return 0;
    };

    const statusFor = (opt: RankedRecommendation): TimingStatus => {
      return computeTimingStatus({
        intent,
        tripData,
        optionTotalMinutes: opt.duration,
      }).status;
    };

    const compareByTimingFirst = (a: RankedRecommendation, b: RankedRecommendation): number => {
      const sa = statusFor(a);
      const sb = statusFor(b);
      return timingRank(sa) - timingRank(sb);
    };

    if (sort === 'cheapest') {
      return arr.sort((a, b) => {
        const sa = statusFor(a);
        const sb = statusFor(b);

        const penaltyA = sa === 'too-late' ? 500 : sa === 'tight' ? 10 : 0;
        const penaltyB = sb === 'too-late' ? 500 : sb === 'tight' ? 10 : 0;

        const effectiveA = a.cost + penaltyA;
        const effectiveB = b.cost + penaltyB;

        // Use timing as a weighted modifier; only break ties more aggressively when costs are close.
        const diff = effectiveA - effectiveB;
        if (Math.abs(diff) < 8) {
          return compareByTimingFirst(a, b) || (a.cost - b.cost) || (a.duration - b.duration);
        }

        return diff || (a.cost - b.cost) || (a.duration - b.duration);
      });
    }

    if (sort === 'fastest') {
      return arr.sort((a, b) => {
        const sa = statusFor(a);
        const sb = statusFor(b);

        const penaltyA = sa === 'too-late' ? 300 : sa === 'tight' ? 6 : 0;
        const penaltyB = sb === 'too-late' ? 300 : sb === 'tight' ? 6 : 0;

        const effectiveA = a.duration + penaltyA;
        const effectiveB = b.duration + penaltyB;

        const diff = effectiveA - effectiveB;
        if (Math.abs(diff) < 8) {
          return compareByTimingFirst(a, b) || (a.duration - b.duration) || (a.cost - b.cost);
        }

        return diff || (a.duration - b.duration) || (a.cost - b.cost);
      });
    }

    // easiest / recommended
    return arr.sort((a, b) => {
      const sa = statusFor(a);
      const sb = statusFor(b);

      const penaltyA = sa === 'too-late' ? 80 : sa === 'tight' ? 12 : 0;
      const penaltyB = sb === 'too-late' ? 80 : sb === 'tight' ? 12 : 0;

      const modeBonus = (x: RankedRecommendation): number => {
        const transport = (tripData as any)?.transportAvailability || 'all';

        if (transport === 'car') {
          if (x.type === 'parking') return 35;
          if (x.type === 'transit') return -30;
          if (x.type === 'rideshare') return 5;
        }

        if (transport === 'rideshare') {
          if (x.type === 'rideshare') return 30;
          if (x.type === 'parking') return -15;
          if (x.type === 'transit') return -10;
        }

        if (transport === 'transit') {
          if (x.type === 'transit') return 35;
          if (x.type === 'parking') return -30;
          if (x.type === 'rideshare') return -15;
        }

        return 0;
      };

      const effectiveA =
        a.score * 0.7 +
        a.stressScore * 0.3 +
        modeBonus(a) -
        penaltyA;

      const effectiveB =
        b.score * 0.7 +
        b.stressScore * 0.3 +
        modeBonus(b) -
        penaltyB;

      const diff = effectiveB - effectiveA;

      if (Math.abs(diff) < 8) {
        return compareByTimingFirst(a, b) || (b.score - a.score) || (a.cost - b.cost);
      }

      return diff;
    });
  }, [rankedOptions, sort, intent, tripData, recommendation?.leaveByTime]);

  const { viableOptions, tooLateOptions, bestTooLateSummary } = useMemo(() => {
    const isFlyingOut = intent === 'flying-out' && tripData?.type === 'one-way-departure';
    if (!isFlyingOut || !tripData) {
      return { viableOptions: sortedOptions, tooLateOptions: [], bestTooLateSummary: null as any };
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
      const recommendedByMin = depMin - buf.bufferMinutes;
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

    if (process.env.NODE_ENV === 'development') {
      const nowLocal = new Date().toString();
      const first = timed[0]?.timing;
      console.log('[ViabilityCounts]', {
        timestamp: new Date().toISOString(),
        departureDate: tripData.departureDate,
        departureTime: tripData.departureTime,
        nowLocal,
        departureLocal: first?.debug?.departureLocal,
        isFutureDate: first?.debug?.isFutureDate,
        recommendedInsideAirportArrivalByLocal: first?.debug?.recommendedInsideArrivalByLocal,
        latestSafeLeaveLocal: first?.debug?.latestSafeLeaveLocal,
        firstStatus: first?.status,
        viable: viable.length,
        tooLate: tooLate.length,
        total: timed.length,
      });
    }

    return { viableOptions: viable, tooLateOptions: tooLate, bestTooLateSummary: best };
  }, [sortedOptions, intent, tripData, recommendation?.leaveByTime]);

  const bestViableLeaveByTime = useMemo(() => {
    const isFlyingOut = intent === 'flying-out' && tripData?.type === 'one-way-departure';
    if (!isFlyingOut || !tripData) return null;
    if (viableOptions.length === 0) return null;

    const first = viableOptions[0];
    const t = computeTimingStatus({ intent, tripData, optionTotalMinutes: first.duration });
    return t.latestSafeLeaveTime || null;
  }, [intent, tripData, viableOptions]);

  const currentAirportCode = ((tripData as any)?.airportCode || searchParams.get('airport') || 'SEA').toUpperCase();

  const extraParkingProviders = useMemo(() => [], []);

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

  const extraTransitProviders = useMemo(
    () =>
      currentAirportCode === 'SEA'
        ? [
          {
            id: 'soundtransit-planner',
            name: 'Sound Transit Trip Planner',
            trustStatus: 'verified-source' as const,
            priceDisplay: 'check-live' as const,
            priceNote: 'Official schedules & fares',
            sourceName: PROVIDER_LINKS.soundTransitPlanner.sourceName,
            sourceLink: PROVIDER_LINKS.soundTransitPlanner.url,
          },
          {
            id: 'google-maps-transit',
            name: 'Google Maps Transit Directions',
            trustStatus: 'estimated' as const,
            priceDisplay: 'check-live' as const,
            priceNote: 'Route planning + live advisories',
            sourceName: PROVIDER_LINKS.googleMaps.sourceName,
            sourceLink: PROVIDER_LINKS.googleMaps.url,
          },
        ]
        : [
          {
            id: 'google-maps-transit',
            name: 'Google Maps Transit Directions',
            trustStatus: 'estimated' as const,
            priceDisplay: 'check-live' as const,
            priceNote: 'Route planning + live advisories',
            sourceName: PROVIDER_LINKS.googleMaps.sourceName,
            sourceLink: PROVIDER_LINKS.googleMaps.url,
          },
        ],
    [currentAirportCode]
  );

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

  const transportAvailability = (tripData as any).transportAvailability || 'all';
  const showParkingProviders = transportAvailability === 'car' || transportAvailability === 'all';
  const showRideProviders = transportAvailability === 'car' || transportAvailability === 'rideshare' || transportAvailability === 'all';

  const rideOptions = (recommendation.rideshare as any[]) || [];
  const hasUber = rideOptions.some((r) => String(r?.id || '').toLowerCase() === 'uber' || String(r?.name || '').toLowerCase() === 'uber');
  const hasLyft = rideOptions.some((r) => String(r?.id || '').toLowerCase() === 'lyft' || String(r?.name || '').toLowerCase() === 'lyft');
  const extraRideProvidersDeduped = extraRideProviders.filter((r) => {
    const name = String(r?.name || '').toLowerCase();
    if (name === 'uber') return !hasUber;
    if (name === 'lyft') return !hasLyft;
    return true;
  });
  const rideProviderItems = [...rideOptions, ...extraRideProvidersDeduped];

  const noViableFlyingOut = intent === 'flying-out' && tripData.type === 'one-way-departure' && viableOptions.length === 0 && tooLateOptions.length > 0;

  const heroAirportTiming = (() => {
    if (intent !== 'flying-out' || tripData.type !== 'one-way-departure') return null;

    const buf = computeAirportReadyBufferMinutes(tripData);
    const depMin = parseHHMMToMinutes(tripData.departureTime);
    if (!buf || depMin == null) return null;

    const recommendedBy = minutesToHHMM(depMin - buf.bufferMinutes);

    const checkingBags = !!(tripData as any).checkingBags;
    const flightType = String((tripData as any).flightType || 'domestic');
    const cabin = String((tripData as any).cabin || 'economy');
    const securityOption = String((tripData as any).securityOption || 'standard');

    const secLabel = securityOption === 'precheck'
      ? 'PreCheck'
      : securityOption === 'clear'
        ? 'CLEAR'
        : securityOption === 'clear-precheck'
          ? 'CLEAR + PreCheck'
          : 'TSA';

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

  const smartPickParkingOptions = sortedOptions
    .filter((opt) => opt.type === 'parking')
    .map((opt) => opt.option as any);

  const visibleResultOptions =
    intent === 'flying-out' && tripData.type === 'one-way-departure'
      ? viableOptions
      : sortedOptions;

  const parkingOptionsOnly = visibleResultOptions.filter((o) => o.type === 'parking');
  const rideshareOptionsOnly = visibleResultOptions.filter((o) => o.type === 'rideshare');
  const transitOptionsOnly = visibleResultOptions.filter((o) => o.type === 'transit');

  const cheapestParking = [...parkingOptionsOnly].sort((a, b) => a.cost - b.cost)[0] || null;
  const lowestStress = [...parkingOptionsOnly].sort((a, b) => b.stressScore - a.stressScore)[0] || null;
  const bestValue = [...parkingOptionsOnly].sort((a, b) => {
    const liveBonusA = (a.option as any).bookingProvider === 'AirportParkingReservations' ? -8 : 0;
    const liveBonusB = (b.option as any).bookingProvider === 'AirportParkingReservations' ? -8 : 0;

    return (a.cost + a.duration * 0.15 + liveBonusA) - (b.cost + b.duration * 0.15 + liveBonusB);
  })[0] || null;

  const smartPickRankedOption =
    bestValue || cheapestParking || lowestStress || parkingOptionsOnly[0] || null;

  const smartPickOption = (smartPickRankedOption?.option as any) || null;
  const smartPickKey = parkingKey(smartPickOption);

  const isSameAsSmartPick = (option: any): boolean => {
    const otherKey = parkingKey(option);
    return Boolean(smartPickKey && otherKey && smartPickKey === otherKey);
  };

  const rawRecommendedPicks = [bestValue, cheapestParking, lowestStress]
    .filter(Boolean)
    .filter((item, index, arr) => {
      const key = parkingKey((item!.option as any));
      return arr.findIndex((x) => parkingKey((x!.option as any)) === key) === index;
    }) as RankedRecommendation[];

  let recommendedPicks = rawRecommendedPicks.filter(
    (item) => !isSameAsSmartPick(item.option as any)
  );

  if (recommendedPicks.length < 3) {
    const extras = parkingOptionsOnly
      .filter((o) => {
        const key = parkingKey(o.option);

        return (
          !recommendedPicks.some((r) => parkingKey(r.option) === key) &&
          !isSameAsSmartPick(o.option)
        );
      })
      .sort(
        (a, b) =>
          ((b.score || 0) + (b.stressScore || 0)) -
          ((a.score || 0) + (a.stressScore || 0))
      );

    recommendedPicks = [...recommendedPicks, ...extras].slice(0, 2);
  }

  const recommendedKeys = new Set([
    smartPickKey,
    ...recommendedPicks.map((o) => parkingKey((o.option as any))),
  ].filter(Boolean));

  const visibleMoreParkingCount = 0;

  const remainingParking = parkingOptionsOnly.filter((o) => {
    const key = parkingKey((o.option as any));
    return !recommendedKeys.has(key) && !isSameAsSmartPick(o.option as any);
  });

  const initiallyVisibleParking = remainingParking.slice(0, visibleMoreParkingCount);
  const hiddenParking = remainingParking.slice(visibleMoreParkingCount);
  const displayedParking = showMoreParking ? remainingParking : initiallyVisibleParking;

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans">
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
                {tripData.destination}
                {intent ? ` • ${intent.replace(/-/g, ' ')}` : ''}
                {airlineOrFlight ? ` • ${airlineOrFlight}` : ''}
                {(tripData.type === 'one-way-departure' || tripData.type === 'round-trip')
                  ? ` • TSA ${recommendation.tsaEstimate.waitTime}m`
                  : ''}
              </p>

              <div className="mt-2 text-xs text-zinc-500">
                Live traffic + airport timing + parking pricing analyzed
              </div>

              {seatacZone && (
                <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  Suggested SEA check-in area:{' '}
                  <span className="font-medium">{seatacZone.destination}</span>
                  {seatacZone.note ? <span> · {seatacZone.note}</span> : null}
                </div>
              )}

              {heroAirportTiming && (
                <div className="mt-4 rounded-xl bg-zinc-50 p-4">
                  <div className="text-xs font-medium text-zinc-500">Recommended inside-airport arrival by</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{formatTimeFriendly(heroAirportTiming.recommendedBy)}</div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
                    {heroAirportTiming.lines.map((l) => (
                      <span key={l}>{l}</span>
                    ))}
                  </div>
                  {heroAirportTiming.airportTimingIsLimitingFactor && (
                    <div className="mt-2 text-xs text-amber-900">Recommended airport arrival time matters more than traffic today.</div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
              >
                Edit trip
              </button>
              <Link
                href="/trip"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                New trip
              </Link>
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
                {tripData.destination}
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
        </div>

        {/* Price legend */}
        <div className="mt-6">
          <PriceLegend />
        </div>

        {/* Edit panel */}
        {isEditing && editingData && (
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

            <div className="mt-5">
              <EditTripForm
                initialData={editingData}
                onSubmit={handleRecalculate}
                onCancel={cancelEditing}
                intent={intent}
                airportCode={searchParams.get('airport') || 'SEA'}
              />
            </div>
          </div>
        )}

        {/* Sort */}
        <div className="mt-6">
          <SortTabs value={sort} onChange={setSort} />
        </div>

        {showParkingProviders && smartPickParkingOptions.length > 0 && (
          <div className="mt-6">
            <ParkingSmartPick
              options={smartPickParkingOptions}
              tripData={tripData}
              leaveByTime={recommendation.leaveByTime}
              selectedOption={smartPickOption}
            />
          </div>
        )}

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
          ) : intent === 'flying-out' && tripData.type === 'one-way-departure' && viableOptions.length === 0 && tooLateOptions.length > 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="text-base font-semibold text-zinc-900">No viable options for this flight time</div>
              <div className="mt-2 text-sm text-zinc-600">
                Based on your airport timing settings, every option arrives after the recommended inside-airport arrival window.
              </div>

              {bestTooLateSummary && (
                <div className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700">
                  <div>Flight departs: <span className="font-medium">{formatTimeFriendly(bestTooLateSummary.flightDeparts)}</span></div>
                  <div className="mt-1">Recommended inside-airport arrival by: <span className="font-medium">{formatTimeFriendly(bestTooLateSummary.recommendedBy)}</span></div>
                  <div className="mt-1">Best available arrival: <span className="font-medium">{formatTimeFriendly(bestTooLateSummary.bestArrival)}</span></div>
                  <div className="mt-1">Missed safe leave time by: <span className="font-medium">{formatMinutes(bestTooLateSummary.shortByMinutes)}</span></div>
                </div>
              )}

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
              {recommendedPicks.length > 0 && (
                <section>
                  <div className="mb-3">
                    <h2 className="text-lg font-semibold text-zinc-900">Best Alternatives</h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      Other strong choices based on price, timing, and convenience.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {recommendedPicks.map((opt, idx) => (
                      <OptionCard
                        compact
                        key={`recommended-${opt.type}-${(opt.option as any).id || idx}`}
                        item={opt}
                        rank={idx + 1}
                        tripData={tripData}
                        intent={intent}
                        sort={sort}
                      />
                    ))}
                  </div>
                </section>
              )}

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
                        {showMoreParking ? 'Hide parking options' : `Show ${hiddenParking.length} more parking options`}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {displayedParking.map((opt, idx) => (
                      <OptionCard
                        compact
                        key={`parking-${opt.type}-${(opt.option as any).id || idx}`}
                        item={opt}
                        rank={idx + 1}
                        tripData={tripData}
                        intent={intent}
                        sort={sort}
                      />
                    ))}
                  </div>
                </section>
              )}

              {rideshareOptionsOnly.length > 0 && (
                <section className="mt-6">
                  <button
                    type="button"
                    onClick={() => setShowRideshare((v) => !v)}
                    className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm hover:bg-zinc-50"
                  >
                    <div>
                      <div className="text-lg font-semibold text-zinc-900">Rideshare</div>
                      <div className="mt-1 text-sm text-zinc-600">Uber, Lyft, taxi, and pickup options.</div>
                    </div>
                    <div className="text-sm font-medium text-blue-700">
                      {showRideshare
                        ? 'Hide rideshare'
                        : `Show rideshare (${rideshareOptionsOnly.length})`}
                    </div>
                  </button>

                  {showRideshare && (
                    <div className="mt-4 grid grid-cols-1 gap-4">
                      {rideshareOptionsOnly.map((opt, idx) => (
                        <OptionCard
                          compact
                          key={`ride-${opt.type}-${(opt.option as any).id || idx}`}
                          item={opt}
                          rank={idx + 1}
                          tripData={tripData}
                          intent={intent}
                          sort={sort}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {transitOptionsOnly.length > 0 && (
                <section className="mt-6">
                  <button
                    type="button"
                    onClick={() => setShowTransit((v) => !v)}
                    className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm hover:bg-zinc-50"
                  >
                    <div>
                      <div className="text-lg font-semibold text-zinc-900">Transit</div>
                      <div className="mt-1 text-sm text-zinc-600">Park-and-ride, light rail, and transit options.</div>
                    </div>
                    <div className="text-sm font-medium text-blue-700">
                      {showTransit
                        ? 'Hide transit'
                        : `Show transit (${transitOptionsOnly.length})`}
                    </div>
                  </button>

                  {showTransit && (
                    <div className="mt-4 grid grid-cols-1 gap-4">
                      {transitOptionsOnly.map((opt, idx) => (
                        <OptionCard
                          compact
                          key={`transit-${opt.type}-${(opt.option as any).id || idx}`}
                          item={opt}
                          rank={idx + 1}
                          tripData={tripData}
                          intent={intent}
                          sort={sort}
                        />
                      ))}
                    </div>
                  )}
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
                        key={`too-late-${opt.type}-${(opt.option as any).id || idx}`}
                        item={opt}
                        rank={idx + 1}
                        tripData={tripData}
                        intent={intent}
                        sort={sort}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pricing links */}
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {showParkingProviders && (
            <div>
              <PricingLinksSection
                title="Parking providers"
                items={[
                  ...[...(recommendation.parking as any), ...extraParkingProviders].filter((p) => {
                    const key = parkingKey(p);

                    return ![
                      smartPickOption,
                      ...(recommendedPicks || []).map((x) => x.option),
                      ...(remainingParking || []).map((x) => x.option),
                    ].some((shown) => parkingKey(shown) === key);
                  }),
                ]}
              />
              {/* Parking booking comparison (compact, expandable) */}
              <ParkingBookingComparison parkingOptions={[...(recommendation.parking as any), ...extraParkingProviders]} tripData={tripData} />
            </div>
          )}

          {showRideProviders && (
            <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <summary className="cursor-pointer px-5 py-4 text-base font-semibold text-zinc-900">
                Need rideshare instead? Show ride prices
              </summary>
              <div className="px-5 pb-5">
                <PricingLinksSection
                  title="Ride providers"
                  items={rideProviderItems}
                />
              </div>
            </details>
          )}

          <div className={showParkingProviders && showRideProviders ? 'lg:col-span-2' : undefined}>
            <PricingLinksSection
              title="Transit options"
              items={[...(recommendation.transit as any), ...extraTransitProviders]}
            />
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/trip"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Plan another trip
          </Link>
        </div>
      </main>
    </div>
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
  const [selectedAirportCode, setSelectedAirportCode] = useState(airportCode || 'SEA');
  const [transportAvailability, setTransportAvailability] = useState<TransportAvailability>(
    initialData.transportAvailability || 'all'
  );

  const showAirportTimingControls = intent === 'flying-out' && initialData.type === 'one-way-departure';

  const [checkingBags, setCheckingBags] = useState<boolean>(!!(initialData as any).checkingBags);
  const [securityOption, setSecurityOption] = useState<SecurityOption>(((initialData as any).securityOption || 'standard') as SecurityOption);
  const [flightType, setFlightType] = useState<FlightType>(((initialData as any).flightType || 'domestic') as FlightType);
  const [cabin, setCabin] = useState<CabinClass>(((initialData as any).cabin || 'economy') as CabinClass);

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

    const parkingDuration = parkingDurationHours ? Math.round(Number(parkingDurationHours) * 60) : undefined;

    const selectedAirport = getAirportById(selectedAirportCode) || getAirportById('SEA')!;
    const destination = selectedAirport.destinationName;

    let data: TripData;

    if (initialData.type === 'one-way-departure') {
      data = {
        type: initialData.type,
        origin,
        destination,
        departureDate,
        departureTime,
        parkingDuration,
        transportAvailability,
        checkingBags: showAirportTimingControls ? checkingBags : (initialData as any).checkingBags,
        securityOption: showAirportTimingControls ? securityOption : (initialData as any).securityOption,
        flightType: showAirportTimingControls ? flightType : (initialData as any).flightType,
        cabin: showAirportTimingControls ? cabin : (initialData as any).cabin,
      };
    } else if (initialData.type === 'dropoff-pickup') {
      data = {
        type: initialData.type,
        origin,
        destination,
        airportTripDate,
        airportTripTime,
        transportAvailability,
      };
    } else if (initialData.type === 'one-way-arrival') {
      data = {
        type: initialData.type,
        origin,
        destination,
        arrivalDate,
        arrivalTime,
        transportAvailability,
      };
    } else {
      data = {
        type: initialData.type,
        origin,
        destination,
        departureDate,
        departureTime,
        returnDate,
        returnTime,
        parkingDuration,
        transportAvailability,
      };
    }

    (data as any).airportCode = selectedAirport.id;

    onSubmit(data);
  };

  const isDeparture = initialData.type === 'one-way-departure';
  const isDropoffPickup = initialData.type === 'dropoff-pickup';
  const isArrival = initialData.type === 'one-way-arrival';
  const isRoundTrip = initialData.type === 'round-trip';

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
              onChange={(e) => setSelectedAirportCode(e.target.value)}
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

        {(isDeparture || isRoundTrip) && (
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
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Recalculate
        </button>
      </div>
    </form>
  );
}