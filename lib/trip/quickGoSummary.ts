import {
  canDisplayParkingPrice,
  deriveParkingTotalRange,
  resolvePricingConfidence,
} from '../access/pricingLadder';
import { estimateParkingDays } from '../tripTime';
import type { RankedRecommendation } from '../domain';
import { buildParkingMonetizationCtas } from '../monetization/outboundClickTypes';
import {
  buildProviderOutboundUrl,
  resolveProviderKind,
  resolveProviderReserveLabel,
  resolveProviderViewLabel,
} from '../monetization/providerUrls';
import { isLiveParkWhizOption } from '../parking/parkWhizMatch';
import type { ParkingOption, TripData } from '../types';

function formatMoney(amount: number): string {
  return `$${Math.round(amount)}`;
}

function formatMoneyRange(min: number, max: number): string {
  if (min === max) return formatMoney(min);
  return `${formatMoney(min)}–${formatMoney(max)}`;
}

export function formatQuickGoBestWayPriceSuffix(
  option: ParkingOption,
  tripData: TripData,
): string | null {
  if (option.priceDisplay === 'check-live' || option.priceDisplay === 'unavailable') {
    return 'Check live price';
  }

  const confidence = resolvePricingConfidence(option);
  if (confidence === 'final_on_provider' && !canDisplayParkingPrice(option)) {
    return 'Check live price';
  }

  const hasExplicitRange =
    typeof option.priceMin === 'number' &&
    typeof option.priceMax === 'number' &&
    option.priceMin > 0 &&
    option.priceMax > 0 &&
    option.priceMin !== option.priceMax;

  const days = Math.max(1, estimateParkingDays(tripData));
  const singleDisplayTotal =
    typeof option.price === 'number' && option.price > 0 && !hasExplicitRange
      ? option.priceUnit === 'total'
        ? option.price
        : option.price * days
      : null;

  const total = deriveParkingTotalRange(option, tripData);
  if (total.min <= 0 && total.max <= 0 && singleDisplayTotal == null) {
    return null;
  }

  if (!hasExplicitRange && singleDisplayTotal != null) {
    if (confidence === 'live') {
      return formatMoney(singleDisplayTotal);
    }
    return `~${formatMoney(singleDisplayTotal)} est.`;
  }

  if (total.min <= 0 || total.max <= 0) {
    return null;
  }

  const isRange = total.min !== total.max;
  const rangeText = formatMoneyRange(total.min, total.max);

  if (confidence === 'live' && !isRange) {
    return formatMoney(total.min);
  }

  if (isRange) {
    return `${rangeText} est.`;
  }

  return `~${formatMoney(total.min)} est.`;
}

export function formatQuickGoBestWayDisplayLabel(
  bestWayLabel: string,
  bestOption: RankedRecommendation | null,
  tripData: TripData,
): string {
  if (!bestOption || bestOption.type !== 'parking') return bestWayLabel;

  const suffix = formatQuickGoBestWayPriceSuffix(bestOption.option as ParkingOption, tripData);
  if (!suffix) return bestWayLabel;

  return `${bestWayLabel} · ${suffix}`;
}

export type QuickGoProviderCta = {
  label: string;
  url: string;
  eventType: 'reserve_parking' | 'view_provider';
  useCopyThenOpen: boolean;
  searchQuery: string;
  provider: string | null;
  parkingLotId: string | null;
  parkingLotName: string | null;
  tripType: string | null;
  airportCode: string | null;
  priceTotal: number | null;
  priceLabel: string | null;
  priceSource: string | null;
  affiliateAttached: boolean;
  outboundSubIdParam: string | null;
};

function isLiveProviderBooking(option: ParkingOption): boolean {
  if (isLiveParkWhizOption(option)) return true;

  const kind = resolveProviderKind({
    bookingProvider: option.bookingProvider,
    sourceName: option.sourceName,
    url: option.sourceLink,
  });

  return (
    kind === 'parkwhiz' &&
    (option.priceSource === 'parkwhiz-live' ||
      option.priceDisplay === 'live' ||
      option.trustStatus === 'live' ||
      option.pricingConfidence === 'live')
  );
}

export function resolveQuickGoProviderCta(
  bestOption: RankedRecommendation | null,
  tripData: TripData,
): QuickGoProviderCta | null {
  if (!bestOption || bestOption.type !== 'parking') return null;

  const option = bestOption.option as ParkingOption;
  const rawUrl = option.sourceLink?.trim();
  if (!rawUrl) return null;

  const kind = resolveProviderKind({
    bookingProvider: option.bookingProvider,
    sourceName: option.sourceName,
    url: rawUrl,
  });
  const isSpotHero = kind === 'spothero' || /spothero\.com/i.test(rawUrl);

  const outbound = buildProviderOutboundUrl(option, {
    tripType: tripData.type,
    airportCode: option.serviceAirportCode ?? null,
    searchQuery: option.searchQuery ?? tripData.destinationName ?? tripData.destination,
    provider: option.bookingProvider || option.sourceName,
  });

  if (!outbound.url?.trim()) return null;

  const liveBooking = isLiveProviderBooking(option);
  const reserveLabelFromProvider = resolveProviderReserveLabel(option);
  const viewLabelFromProvider = resolveProviderViewLabel(option);

  let label: string;
  if (isSpotHero) {
    label = 'Compare parking';
  } else if (liveBooking) {
    label =
      reserveLabelFromProvider === 'Reserve'
        ? 'Reserve parking'
        : reserveLabelFromProvider || 'Reserve parking';
  } else {
    label =
      viewLabelFromProvider === 'Compare on SpotHero'
        ? 'Compare parking'
        : 'Check provider';
  }

  const ctas = buildParkingMonetizationCtas({
    bookingUrl: liveBooking ? outbound.url : null,
    providerUrl: outbound.url,
    reserveLabel: label,
    viewProviderLabel: label,
    infoOnlyBooking: option.type === 'official' && !option.bookingProvider,
  });

  if (ctas.reserveEnabled && liveBooking) {
    return {
      label: ctas.reserveLabel,
      url: ctas.reserveUrl!,
      eventType: 'reserve_parking',
      useCopyThenOpen: kind === 'parkwhiz',
      searchQuery:
        option.searchQuery?.trim() ||
        option.name?.trim() ||
        tripData.destinationName ||
        tripData.destination,
      provider: option.bookingProvider || option.sourceName || null,
      parkingLotId: option.id || null,
      parkingLotName: option.name || null,
      tripType: tripData.type,
      airportCode: option.serviceAirportCode ?? null,
      priceTotal: typeof option.price === 'number' ? option.price : null,
      priceLabel: formatQuickGoBestWayPriceSuffix(option, tripData),
      priceSource: option.priceSource ?? null,
      affiliateAttached: option.outboundAffiliateAttached ?? outbound.affiliateAttached,
      outboundSubIdParam: option.outboundSubIdParam ?? outbound.subIdParam ?? null,
    };
  }

  if (ctas.viewProviderEnabled || (!liveBooking && outbound.url)) {
    return {
      label,
      url: ctas.viewProviderUrl || outbound.url,
      eventType: 'view_provider',
      useCopyThenOpen: false,
      searchQuery:
        option.searchQuery?.trim() ||
        option.name?.trim() ||
        tripData.destinationName ||
        tripData.destination,
      provider: option.bookingProvider || option.sourceName || null,
      parkingLotId: option.id || null,
      parkingLotName: option.name || null,
      tripType: tripData.type,
      airportCode: option.serviceAirportCode ?? null,
      priceTotal: typeof option.price === 'number' ? option.price : null,
      priceLabel: formatQuickGoBestWayPriceSuffix(option, tripData),
      priceSource: option.priceSource ?? null,
      affiliateAttached: option.outboundAffiliateAttached ?? outbound.affiliateAttached,
      outboundSubIdParam: option.outboundSubIdParam ?? outbound.subIdParam ?? null,
    };
  }

  return null;
}
