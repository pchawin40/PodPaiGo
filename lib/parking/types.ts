import type { ParkingOption } from '../types';

export type ParkingCategory =
  | 'airport-garage'
  | 'offsite-shuttle'
  | 'park-and-ride'
  | 'hotel-parking'
  | 'marketplace'
  | 'unknown';

export type PriceConfidenceLevel = 'live' | 'estimated' | 'unavailable';

export type NormalizedBookingSource = {
  providerName: string;
  url?: string;
  pricePerDay?: number;
  totalPrice?: number;
  priceConfidence: PriceConfidenceLevel;
  label?: string;
};

export type NormalizedParkingOption = {
  id: string;
  airportId?: string;
  name: string;
  providerName?: string;
  bookingUrl?: string;
  sourceUrl?: string;
  category: ParkingCategory;
  address?: string;
  distanceMiles?: number;
  driveMinutes?: number;
  shuttleMinutes?: number;
  walkMinutes?: number;
  pricePerDay?: number;
  totalPrice?: number;
  currency?: 'USD';
  priceConfidence: PriceConfidenceLevel;
  images?: string[];
  imageAlt?: string;
  reviewScore?: number;
  reviewCount?: number;
  covered?: boolean;
  shuttleIncluded?: boolean;
  open24Hours?: boolean;
  tags?: string[];
  notes?: string[];
  bookingSources?: NormalizedBookingSource[];
};

export type ParkingProviderResult = {
  provider: string;
  options: NormalizedParkingOption[];
};

export type ParkingProvider = (args: {
  airportId: string;
  startDate?: string;
  endDate?: string;
}) => Promise<ParkingProviderResult>;

export function categoryToLegacyType(category: ParkingCategory): ParkingOption['type'] {
  return category === 'airport-garage' ? 'official' : 'off-airport';
}

export type LiveParkingQuote = {
  id: string;
  lotName: string;
  bookingUrl?: string;
  pricePerDay?: number;
  totalPrice?: number;
  currency?: 'USD';
  fetchedAt?: string;
};
