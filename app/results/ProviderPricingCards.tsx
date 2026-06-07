'use client';

import { formatTransitCostDisplay } from '../../lib/domain';
import { formatParkingPriceLine } from '../../lib/access/pricingLadder';
import { formatRidesharePriceDisplay, RIDESHARE_ESTIMATE_DISCLAIMER } from '../../lib/rideshare/estimate';
import {
  getTransitPassAppliedBadge,
  getTransitPassCoveredLabel,
  resolveTransitPaymentRegionContext,
} from '../../lib/transit/transitPaymentLabels';
import type {
  ParkingOption,
  PriceDisplay,
  RideshareEstimateConfidence,
  TransitOption,
  TransitPaymentOption,
  TripData,
  TrustStatus,
} from '../../lib/types';
import { formatMoney } from '../utils/formatter';

export type ProviderLinkItem = {
  id?: string;
  name: string;
  price?: number;
  priceDisplay?: PriceDisplay;
  priceNote?: string;
  priceRangeLabel?: string;
  rideshareEstimateConfidence?: RideshareEstimateConfidence;
  trustStatus?: TrustStatus;
  sourceLink?: string;
  mapLink?: string;
};

function bestLink(option: ProviderLinkItem): string | null {
  return option.sourceLink || option.mapLink || null;
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

function confidenceFromTrust(trust: TrustStatus): { label: string; className: string } {
  switch (trust) {
    case 'verified-source':
      return { label: 'High confidence', className: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-100 dark:border-blue-800' };
    case 'live':
      return { label: 'Live', className: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-100 dark:border-emerald-800' };
    case 'estimated':
      return { label: 'Medium confidence', className: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-100 dark:border-amber-800' };
    case 'fallback':
    default:
      return { label: 'Low confidence', className: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600' };
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
        className: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-100 dark:border-amber-800',
      };
    case 'unavailable':
      return {
        label: 'Unavailable',
        className: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600',
      };
    default:
      return null;
  }
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

function formatProviderPrice(it: ProviderLinkItem): { primary: string; secondary?: string } {
  const line = formatParkingPriceLine(it as ParkingOption, null);
  return {
    primary: line.primary,
    secondary: line.secondary || it.priceNote,
  };
}

function getTripAirportCode(tripData: TripData | null): string {
  return ((tripData as (TripData & { airportCode?: string }) | null)?.airportCode || 'SEA').toUpperCase();
}

const primaryButtonClass =
  'inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-center text-sm font-semibold leading-tight text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600';
const secondaryButtonClass =
  'inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-center text-sm font-medium leading-tight text-zinc-800 hover:bg-zinc-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

export function PricingLinksSection({
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
    <div className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
      {items.map((it) => {
        const trust = confidenceFromTrust((it.trustStatus || 'estimated') as TrustStatus);
        const rideshareConfidence = rideshareConfidenceMeta(it.rideshareEstimateConfidence);
        const ridesharePricing = isRideSection ? formatRidesharePriceDisplay(it) : null;
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
        const primaryHref =
          isTransitSection && primaryCta === 'View route'
            ? it.mapLink || link
            : link;
        const showSecondaryRouteButton = Boolean(
          it.mapLink && !sourceAndMapSame && !(isTransitSection && primaryCta === 'View route')
        );

        const fareSublabel =
          isTransitSection && transitPriceDisplay
            ? transitPayment === 'orca-pass'
              ? getTransitPassAppliedBadge(transitPassContext)
              : transitPriceDisplay.includesReturnLeg
                ? 'round-trip fare estimate'
                : 'one-way fare estimate'
            : isTransitSection && !transitPriceDisplay && typeof it.price === 'number'
              ? transitPayment === 'orca-pass'
                ? getTransitPassAppliedBadge(transitPassContext)
                : 'fare estimate'
              : isRideSection && ridesharePricing?.primary === 'Open app for live price'
                ? 'live price unavailable'
              : isRideSection && typeof it.price === 'number'
                ? 'ride estimate'
                : null;

        const rideDisclaimer =
          isRideSection && ridesharePricing?.primary === 'Open app for live price'
            ? 'Live Uber/Lyft fares are not available in PodPaiGo. Open the provider app for current pricing.'
            : isRideSection
              ? RIDESHARE_ESTIMATE_DISCLAIMER
              : null;

        return (
          <div key={it.id || it.name} className="px-3 py-3 sm:px-5 sm:py-4">
            <div className="flex min-w-0 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-sky-800">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sm font-bold text-slate-900 ring-1 ring-sky-100 dark:bg-sky-950/50 dark:text-slate-100 dark:ring-sky-900 sm:h-12 sm:w-12">
                {providerIcon(it.name)}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="break-words text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
                  {it.name}
                </div>

                {shouldShowPrice && primaryPrice ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-600 dark:bg-slate-800/50">
                    <div className="break-words text-base font-bold leading-tight text-zinc-900 dark:text-zinc-100">
                      {primaryPrice}
                    </div>
                    {fareSublabel ? (
                      <div className="mt-1 text-xs font-medium leading-snug text-zinc-500 dark:text-zinc-400">
                        {fareSublabel}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {isRideSection && ridesharePricing?.secondary ? (
                  <div className="text-sm font-medium leading-snug text-zinc-600 dark:text-zinc-300">
                    {ridesharePricing.secondary}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {rideshareConfidence ? (
                    <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + rideshareConfidence.className}>
                      {rideshareConfidence.label}
                    </span>
                  ) : null}
                  <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + trust.className}>
                    {trust.label}
                  </span>
                  {shouldShowPriceKindBadge ? (
                    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-slate-600 dark:bg-slate-900 dark:text-zinc-200">
                      {pricingKindLabel(kind)}
                    </span>
                  ) : null}
                </div>

                {secondaryPrice && !isRideSection ? (
                  <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {secondaryPrice}
                  </p>
                ) : null}

                {rideDisclaimer ? (
                  <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {rideDisclaimer}
                  </p>
                ) : null}

                {(primaryHref || showSecondaryRouteButton) ? (
                  <div className="mt-auto flex flex-col gap-2 sm:flex-row">
                    {showSecondaryRouteButton && it.mapLink ? (
                      <a
                        href={it.mapLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={secondaryButtonClass}
                      >
                        View route
                      </a>
                    ) : null}

                    {primaryHref ? (
                      <a
                        href={primaryHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={primaryButtonClass}
                      >
                        {primaryCta}
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
