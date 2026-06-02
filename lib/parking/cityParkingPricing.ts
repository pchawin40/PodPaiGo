import type { ParkingOption } from '../types';

export type CityParkingPricing = Pick<
  ParkingOption,
  | 'price'
  | 'priceMin'
  | 'priceMax'
  | 'priceDisplay'
  | 'priceUnit'
  | 'priceNote'
  | 'priceSource'
  | 'priceConfidence'
  | 'pricingConfidence'
  | 'trustStatus'
  | 'assumptions'
>;

const URBAN_HOURLY_MIN = 6;
const URBAN_HOURLY_MAX = 12;
const URBAN_DAILY_MIN = 25;
const URBAN_DAILY_MAX = 45;
const SHORT_TRIP_HOUR_THRESHOLD = 12;

const PIKE_PLACE_TIERS = [
  { maxHours: 1, price: 8 },
  { maxHours: 2, price: 16 },
  { maxHours: 3, price: 24 },
  { maxHours: 4, price: 32 },
  { maxHours: 10, price: 36 },
  { maxHours: 24, price: 40 },
] as const;

export function isPikePlaceMarketGarage(name: string, address?: string | null): boolean {
  const text = `${name} ${address || ''}`.toLowerCase();

  return (
    text.includes('pike place') &&
    (text.includes('garage') || text.includes('parking') || text.includes('market'))
  );
}

export function estimatePikePlaceMarketPrice(durationMinutes: number): number {
  const hours = Math.max(1, Math.ceil(durationMinutes / 60));

  for (const tier of PIKE_PLACE_TIERS) {
    if (hours <= tier.maxHours) {
      return tier.price;
    }
  }

  return PIKE_PLACE_TIERS[PIKE_PLACE_TIERS.length - 1].price;
}

export function estimateUrbanCoreParkingRange(args: {
  durationMinutes: number;
  covered?: boolean;
}): { min: number; max: number; unit: 'total' | 'per-day'; note: string } {
  const hours = Math.max(1, args.durationMinutes / 60);
  const coveredBump = args.covered ? 1.1 : 1;

  if (hours < SHORT_TRIP_HOUR_THRESHOLD) {
    const min = Math.round(URBAN_HOURLY_MIN * hours * coveredBump);
    const max = Math.round(URBAN_HOURLY_MAX * hours * coveredBump);

    return {
      min: Math.max(URBAN_HOURLY_MIN, min),
      max: Math.max(min + 4, max),
      unit: 'total',
      note: 'Estimated urban core hourly parking total for your selected duration.',
    };
  }

  return {
    min: Math.round(URBAN_DAILY_MIN * coveredBump),
    max: Math.round(URBAN_DAILY_MAX * coveredBump),
    unit: 'per-day',
    note: 'Estimated urban core daily/max parking rate for a full-day stay.',
  };
}

export function resolveCityParkingPricing(args: {
  name: string;
  address?: string | null;
  durationMinutes: number;
  covered?: boolean;
}): CityParkingPricing {
  const { name, address, durationMinutes, covered } = args;

  if (isPikePlaceMarketGarage(name, address)) {
    const total = estimatePikePlaceMarketPrice(durationMinutes);

    return {
      price: total,
      priceMin: total,
      priceMax: total,
      priceDisplay: 'estimated',
      priceUnit: 'total',
      pricingConfidence: 'official',
      priceSource: 'official-rate',
      priceConfidence: 'high',
      trustStatus: 'verified-source',
      priceNote:
        'Official Pike Place Market Parking Garage rate card estimate for your selected duration. Early bird $17 may apply with qualifying entry/exit times.',
      assumptions: [
        'Estimated from the official Pike Place Market Parking Garage rate card.',
        'Early bird pricing ($17) applies only when entry/exit conditions match the published rules.',
        'Confirm current rates and hours on the official garage page before booking.',
      ],
    };
  }

  const urban = estimateUrbanCoreParkingRange({ durationMinutes, covered });
  const midpoint = Math.round((urban.min + urban.max) / 2);

  return {
    price: midpoint,
    priceMin: urban.min,
    priceMax: urban.max,
    priceDisplay: 'estimated',
    priceUnit: urban.unit,
    pricingConfidence: 'estimated',
    priceSource: 'estimated',
    priceConfidence: 'medium',
    trustStatus: 'estimated',
    priceNote: urban.note,
    assumptions: [
      'Conservative urban core parking estimate.',
      urban.unit === 'total'
        ? 'Short-trip pricing uses an hourly model ($6–$12/hr).'
        : 'Full-day pricing uses an urban daily/max model ($25–$45/day).',
      'Open the provider or garage page to confirm live rates.',
    ],
  };
}

export function mergeLiveCityParkWhizPricing(
  option: ParkingOption,
  liveOption: ParkingOption,
): ParkingOption {
  if (liveOption.priceDisplay !== 'live' || !(liveOption.price > 0)) {
    return option;
  }

  return {
    ...option,
    ...liveOption,
    id: option.id,
    name: liveOption.name || option.name,
    priceDisplay: 'live',
    priceUnit: 'total',
    pricingConfidence: 'live',
    trustStatus: 'live',
    priceFreshness: 'live',
    googlePlaceId: option.googlePlaceId ?? liveOption.googlePlaceId,
    googleMapsUri: option.googleMapsUri ?? liveOption.googleMapsUri,
    imageUrl: option.imageUrl ?? liveOption.imageUrl,
    images: option.images ?? liveOption.images,
    reviewScore: option.reviewScore ?? liveOption.reviewScore,
    reviewCount: option.reviewCount ?? liveOption.reviewCount,
    lat: option.lat ?? liveOption.lat,
    lng: option.lng ?? liveOption.lng,
    transferType: liveOption.transferType === 'shuttle' ? 'shuttle' : 'walk',
    shuttleMinutes: liveOption.transferType === 'shuttle' ? liveOption.shuttleMinutes : undefined,
    shuttleWaitMinutes: undefined,
    bufferRiskMinutes: undefined,
    walkingMinutes:
      liveOption.transferType === 'shuttle'
        ? undefined
        : liveOption.walkingMinutes ?? option.walkingMinutes,
    transferToTerminalMinutes:
      liveOption.transferType === 'shuttle'
        ? liveOption.transferToTerminalMinutes
        : liveOption.walkingMinutes ?? liveOption.transferToTerminalMinutes ?? option.transferToTerminalMinutes,
    assumptions: [
      ...(liveOption.assumptions || []),
      'Live ParkWhiz quote used instead of generic city estimate.',
    ],
  };
}
