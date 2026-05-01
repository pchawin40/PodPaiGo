import { ParkingOption } from '../types';

type PricingResolution = Pick<
  ParkingOption,
  'price' | 'priceDisplay' | 'priceUnit' | 'priceNote' | 'priceSource' | 'priceConfidence' | 'bookingProvider'
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
    priceNote: 'Known SEA parking lot. Estimated daily rate — check live price before booking.',
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

export function resolveParkingPricing(args: {
  airportCode: string;
  lotName: string;
}): PricingResolution {
  const airportCode = args.airportCode.toUpperCase();
  const lotName = args.lotName.toLowerCase();

  if (airportCode === 'SEA') {
    const matchedKey = Object.keys(SEA_KNOWN_PRICES).find((key) =>
      lotName.includes(key)
    );

    if (matchedKey) {
      return SEA_KNOWN_PRICES[matchedKey];
    }
  }

  return {
    price: 30,
    priceDisplay: 'check-live',
    priceUnit: undefined,
    priceNote: 'Real nearby parking listing. Open listing or provider site to confirm live price.',
    priceSource: 'google-places',
    priceConfidence: 'low',
    bookingProvider: 'Google Places',
  };
}