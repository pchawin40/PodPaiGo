import type { ParkingOption } from '../../types';
import type { DestinationKind } from '../../types';

export type { ParkingOption };

export interface AirportCoordinates {
  lat: number;
  lng: number;
}

export interface ParkingSearchContext {
  airportCode: string;
  airportCoordinates?: AirportCoordinates;
  destination: string;
  origin?: string;
  checkInDate?: string;
  checkOutDate?: string;
  destinationKind?: DestinationKind;
  destinationLat?: number;
  destinationLng?: number;
  dateTime?: string;
  parkingDurationMinutes?: number;
}

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'offline';

export interface ProviderHealth {
  status: ProviderHealthStatus;
  message?: string;
  checkedAt: string;
}

export type PriceFreshness = 'live' | 'recent' | 'estimated' | 'unknown';

export interface ParkingProviderSearchResult {
  providerId: string;
  options: ParkingOption[];
  health: ProviderHealth;
  error?: string;
}

export interface ParkingProvider {
  id: string;
  enabled(): boolean;
  health(): Promise<ProviderHealth>;
  search(context: ParkingSearchContext): Promise<ParkingOption[]>;
}

export interface ParkingAvailabilityResult {
  status: 'available' | 'unavailable' | 'unknown';
  fetchedAt: string;
  providerSource: string;
}

export interface ParkingPricingResult {
  price: number;
  priceUnit?: 'per-day' | 'per-hour' | 'total';
  freshness: PriceFreshness;
  fetchedAt: string;
  providerSource: string;
}

export interface ParkingLotMetadata {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  serviceAirportCode: string;
  distanceToAirport?: number;
  providerSource: string;
}

export function tagParkingFreshness(
  option: ParkingOption,
  providerSource: string,
  priceFreshness: PriceFreshness,
  fetchedAt = new Date().toISOString(),
): ParkingOption {
  return {
    ...option,
    providerSource: option.providerSource ?? providerSource,
    fetchedAt: option.fetchedAt ?? fetchedAt,
    priceFreshness: option.priceFreshness ?? priceFreshness,
  };
}

export function inferPriceFreshness(option: ParkingOption): PriceFreshness {
  if (option.priceFreshness) return option.priceFreshness;
  if (option.trustStatus === 'live' || option.priceDisplay === 'live') return 'live';
  if (option.trustStatus === 'verified-source') return 'recent';
  if (option.trustStatus === 'estimated' || option.priceDisplay === 'estimated') {
    return 'estimated';
  }
  return 'unknown';
}
