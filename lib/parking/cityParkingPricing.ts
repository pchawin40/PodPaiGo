import type { ParkingOption, ParkingRateRule } from '../types';
import { resolveDestinationParkingRate } from './destinationParkingRates';
import { selectBestParkingPhotoFields } from './parkingLotPhotoShared';

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
  | 'rateRules'
  | 'activeRate'
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

export function buildPikePlaceMarketRateRules(): ParkingRateRule[] {
  const tierRules: ParkingRateRule[] = PIKE_PLACE_TIERS.map((tier, index) => ({
      id: `pike-place-tier-${tier.maxHours}`,
      label:
        index === 0
          ? 'Published 0-1 hour garage rate'
          : `Published ${PIKE_PLACE_TIERS[index - 1]!.maxHours}-${tier.maxHours} hour garage rate`,
      kind: 'flat',
      amount: tier.price,
      minDurationMinutes: index === 0 ? undefined : PIKE_PLACE_TIERS[index - 1]!.maxHours * 60 + 1,
      maxDurationMinutes: tier.maxHours * 60,
      priority: 30,
      sourceName: 'Pike Place Market Parking Garage',
      sourceUrl: 'https://www.pikeplacemarket.org/parking-directions/',
      confidence: 'high',
      notes: [
        'Published Pike Place garage rate card tier for the selected duration.',
      ],
    }));

  return [
    ...tierRules,
    {
      id: 'pike-place-early-bird',
      label: 'Early bird rate',
      kind: 'early_bird',
      amount: 17,
      entryWindow: { start: '05:00', end: '08:59' },
      exitBy: '21:00',
      priority: 70,
      sourceName: 'Pike Place Market Parking Garage',
      sourceUrl: 'https://www.pikeplacemarket.org/parking-directions/',
      confidence: 'high',
      notes: ['Requires entry before 9 a.m. and exit by 9 p.m.'],
    },
    {
      id: 'pike-place-evening',
      label: 'Flat evening rate',
      kind: 'evening',
      amount: 10,
      startTime: '17:00',
      exitBy: '02:00',
      priority: 65,
      sourceName: 'Pike Place Market Parking Garage',
      sourceUrl: 'https://www.pikeplacemarket.org/parking-directions/',
      confidence: 'high',
      notes: ['Applies after 5 p.m.; cars left past 2 a.m. are subject to daily hourly rates.'],
    },
    {
      id: 'pike-place-weekend-special-possible',
      label: 'Weekend/special rate possible',
      kind: 'weekend',
      amount: 40,
      appliesOnDays: [0, 6],
      priority: 20,
      sourceName: 'Pike Place Market Parking Garage',
      sourceUrl: 'https://www.pikeplacemarket.org/parking-directions/',
      confidence: 'medium',
      estimated: true,
      notes: ['Weekend parking still uses posted garage rules unless a special is published.'],
    },
    {
      id: 'pike-place-event-override',
      label: 'Event rate estimate',
      kind: 'event',
      amount: 45,
      priority: 100,
      sourceName: 'Estimated event parking override',
      sourceUrl: 'https://www.pikeplacemarket.org/parking-directions/',
      confidence: 'low',
      estimated: true,
      notes: ['Nearby events may override normal parking rates.'],
    },
  ];
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
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  eventLikely?: boolean;
}): CityParkingPricing {
  const { name, address, durationMinutes, covered } = args;

  if (isPikePlaceMarketGarage(name, address)) {
    const rateRules = buildPikePlaceMarketRateRules();
    const resolved = resolveDestinationParkingRate({
      rateRules,
      fallbackPrice: estimatePikePlaceMarketPrice(durationMinutes),
      arrivalDate: args.arrivalDate,
      arrivalTime: args.arrivalTime,
      durationMinutes,
      eventLikely: args.eventLikely,
    });
    const total = resolved.total ?? estimatePikePlaceMarketPrice(durationMinutes);

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
      rateRules,
      activeRate: resolved,
      priceNote:
        `${resolved.label}. Official Pike Place Market Parking Garage rate card estimate for your selected duration. Special rates may apply only when posted entry/exit rules match.`,
      assumptions: [
        'Estimated from the official Pike Place Market Parking Garage rate card.',
        'Early bird pricing applies only when entry/exit conditions match the published rules.',
        'Flat evening pricing may apply after 5 p.m. if the car exits before the posted overnight cutoff.',
        'Event rates may override normal pricing near major venues or waterfront events.',
        ...resolved.warnings,
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
  const photoFields = selectBestParkingPhotoFields(option, liveOption);

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
    ...photoFields,
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
