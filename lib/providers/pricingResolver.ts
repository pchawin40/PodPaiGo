import { ParkingOption } from '../types';

type PricingResolution = Pick<
  ParkingOption,
  | 'price'
  | 'priceMin'
  | 'priceMax'
  | 'priceDisplay'
  | 'priceUnit'
  | 'priceNote'
  | 'priceSource'
  | 'priceConfidence'
  | 'bookingProvider'
>;

const SEA_KNOWN_PRICES: Record<string, PricingResolution> = {
  wally: {
    price: 32,
    priceDisplay: 'check-live',
    priceUnit: undefined,
    priceNote: 'Known SEA parking lot. Open provider to confirm live rate, coupons, and availability.',
    priceSource: 'direct-lot-rate',
    priceConfidence: 'medium',
    bookingProvider: 'WallyPark',
  },
  masterpark: {
    price: 34,
    priceDisplay: 'from-per-day' as const,
    priceUnit: 'per-day' as const,
    priceNote: 'Known SEA parking lot. Estimated daily rate — confirm final rate on provider before booking.',
    priceSource: 'direct-lot-rate',
    priceConfidence: 'medium',
    bookingProvider: 'MasterPark',
  },
  'doug fox': {
    price: 28,
    priceDisplay: 'check-live',
    priceUnit: undefined,
    priceNote: 'Known SEA parking lot. Open provider to confirm live rate.',
    priceSource: 'direct-lot-rate',
    priceConfidence: 'medium',
    bookingProvider: 'Doug Fox Parking',
  },
  'park n jet': {
    price: 22,
    priceDisplay: 'check-live',
    priceUnit: undefined,
    priceNote: 'Known SEA parking lot. Open provider to confirm live rate.',
    priceSource: 'direct-lot-rate',
    priceConfidence: 'medium',
    bookingProvider: 'Park N Jet',
  },
  ajax: {
    price: 20,
    priceDisplay: 'check-live',
    priceUnit: undefined,
    priceNote: 'Known nearby SEA parking lot. Open listing to confirm live rate.',
    priceSource: 'direct-lot-rate',
    priceConfidence: 'medium',
    bookingProvider: 'Ajax Parking R Us',
  },
  jiffy: {
    price: 20,
    priceDisplay: 'check-live',
    priceUnit: undefined,
    priceNote: 'Known nearby SEA parking lot. Open listing to confirm live rate.',
    priceSource: 'direct-lot-rate',
    priceConfidence: 'medium',
    bookingProvider: 'Jiffy Airport Parking',
  },
  mvp: {
    price: 22,
    priceDisplay: 'check-live',
    priceUnit: undefined,
    priceNote: 'Known nearby SEA parking lot. Open listing to confirm live rate.',
    priceSource: 'direct-lot-rate',
    priceConfidence: 'medium',
    bookingProvider: 'MVP Airport Parking',
  },
};

export type ParkingLotKind = 'official' | 'off-airport' | 'park-and-ride';

function unknownGooglePricing(lotKind: ParkingLotKind): PricingResolution {
  if (lotKind === 'official') {
    return {
      price: 35,
      priceMin: 25,
      priceMax: 45,
      priceDisplay: 'estimated',
      priceUnit: 'per-day',
      priceNote: 'Estimated official airport parking rate; confirm on airport site.',
      priceSource: 'google-places',
      priceConfidence: 'low',
    };
  }

  if (lotKind === 'park-and-ride') {
    return {
      price: 10,
      priceMin: 5,
      priceMax: 15,
      priceDisplay: 'estimated',
      priceUnit: 'per-day',
      priceNote: 'Typical park-and-ride or transit station parking rate; confirm on site.',
      priceSource: 'google-places',
      priceConfidence: 'low',
    };
  }

  return {
    price: 20,
    priceMin: 12,
    priceMax: 28,
    priceDisplay: 'estimated',
    priceUnit: 'per-day',
    priceNote: 'Estimated nearby off-airport parking rate; confirm on provider.',
    priceSource: 'google-places',
    priceConfidence: 'low',
  };
}

export function resolveParkingPricing(args: {
  airportCode: string;
  lotName: string;
  lotKind?: ParkingLotKind;
}): PricingResolution {
  const airportCode = args.airportCode.toUpperCase();
  const lotName = args.lotName.toLowerCase();
  const lotKind = args.lotKind ?? 'off-airport';

  if (airportCode === 'SEA') {
    const matchedKey = Object.keys(SEA_KNOWN_PRICES).find((key) =>
      lotName.includes(key)
    );

    if (matchedKey) {
      return SEA_KNOWN_PRICES[matchedKey];
    }
  }

  return unknownGooglePricing(lotKind);
}
