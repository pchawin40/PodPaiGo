import { ParkingOption, TripData } from '../types';
import type { PriceableParkingLike } from '../access/types';
import {
  canDisplayParkingPrice as ladderCanDisplay,
  formatParkingPriceLine,
  getParkingDailyFromRange,
  getParkingTotalFromRange,
} from '../access/pricingLadder';

type DisplayableParkingPriceOption = PriceableParkingLike;

export function canDisplayParkingPrice(option: DisplayableParkingPriceOption): boolean {
  return ladderCanDisplay(option);
}

export function getParkingTotalPrice(
  option: ParkingOption,
  tripData: TripData | null
): number | null {
  if (!ladderCanDisplay(option)) return null;
  return getParkingTotalFromRange(option, tripData);
}

export function getParkingDailyPrice(
  option: ParkingOption,
  tripData: TripData | null
): number | null {
  if (!ladderCanDisplay(option)) return null;
  return getParkingDailyFromRange(option, tripData);
}

export function parkingPriceLine(
  option: ParkingOption,
  tripData: TripData | null
): { primary: string; secondary: string | null; confidence?: string } {
  const line = formatParkingPriceLine(option, tripData);
  return {
    primary: line.primary,
    secondary: line.secondary,
    confidence: line.confidence,
  };
}
