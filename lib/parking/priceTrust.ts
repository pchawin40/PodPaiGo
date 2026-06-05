import type { ParkingOption, TripData } from '../types';
import { getParkingTotalPrice } from './priceDisplay';

export type ParkingPriceTrustKind =
  | 'live_final_provider_price'
  | 'live_marketplace_price'
  | 'official_rate'
  | 'estimated_range'
  | 'baseline_estimate'
  | 'price_unknown'
  | 'check_provider';

export type ParkingPriceTrust = {
  kind: ParkingPriceTrustKind;
  label: string;
  badgeClassName: string;
  disclosure: string;
  providerControlsFinalPrice: boolean;
  canTreatAsConfirmed: boolean;
};

function providerText(option: Pick<ParkingOption, 'bookingProvider' | 'sourceName'>): string {
  return `${option.bookingProvider || ''} ${option.sourceName || ''}`.toLowerCase();
}

export function resolveParkingPriceTrust(
  option: ParkingOption,
  tripData: TripData | null,
): ParkingPriceTrust {
  const provider = providerText(option);
  const total = getParkingTotalPrice(option, tripData);
  const hasNumericPrice = typeof total === 'number' && total >= 0;
  const isMarketplace =
    provider.includes('parkwhiz') ||
    provider.includes('airportparkingreservations') ||
    provider.includes('spothero') ||
    provider.includes('way.com') ||
    provider.includes('way ');

  if (option.priceDisplay === 'unavailable') {
    return {
      kind: 'price_unknown',
      label: 'Price unavailable',
      badgeClassName: 'border-slate-200 bg-slate-50 text-slate-700',
      disclosure: 'Open the provider or lot website to check current price and availability.',
      providerControlsFinalPrice: true,
      canTreatAsConfirmed: false,
    };
  }

  if (option.priceDisplay === 'live' && option.pricingConfidence === 'live' && !isMarketplace) {
    return {
      kind: 'live_final_provider_price',
      label: 'Live provider price',
      badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      disclosure: 'Pulled from the provider for the selected parking window. Confirm vehicle options and fees at checkout.',
      providerControlsFinalPrice: true,
      canTreatAsConfirmed: true,
    };
  }

  if (option.priceDisplay === 'live' || (option.pricingConfidence === 'live' && isMarketplace)) {
    return {
      kind: 'live_marketplace_price',
      label: 'Live marketplace price',
      badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      disclosure: 'Live marketplace quote for the selected parking window. Provider checkout controls final price.',
      providerControlsFinalPrice: true,
      canTreatAsConfirmed: true,
    };
  }

  if (option.priceSource === 'official-rate' || option.pricingConfidence === 'official') {
    return {
      kind: 'official_rate',
      label: 'Official provider price',
      badgeClassName: 'border-indigo-200 bg-indigo-50 text-indigo-800',
      disclosure: 'Estimated from an official rate card. Times, validations, vehicle type, and posted rules may change the final price.',
      providerControlsFinalPrice: true,
      canTreatAsConfirmed: false,
    };
  }

  if (!hasNumericPrice || option.priceDisplay === 'check-live') {
    return {
      kind: 'check_provider',
      label: 'Check provider',
      badgeClassName: 'border-slate-200 bg-white text-slate-700',
      disclosure: 'PodPaiGo does not have a selected-window final price. Open the provider and enter the shown dates/times.',
      providerControlsFinalPrice: true,
      canTreatAsConfirmed: false,
    };
  }

  if (option.priceMin != null || option.priceMax != null || option.priceDisplay === 'estimated') {
    return {
      kind: 'estimated_range',
      label: 'Estimated range',
      badgeClassName: 'border-amber-200 bg-amber-50 text-amber-900',
      disclosure: 'Estimated for comparison only. Confirm at provider; times and vehicle options may change price.',
      providerControlsFinalPrice: true,
      canTreatAsConfirmed: false,
    };
  }

  return {
    kind: 'baseline_estimate',
    label: 'Baseline estimate',
    badgeClassName: 'border-amber-200 bg-amber-50 text-amber-900',
    disclosure: 'Baseline estimate for ranking. Provider controls final price.',
    providerControlsFinalPrice: true,
    canTreatAsConfirmed: false,
  };
}
