import { ParkingOption } from '../types';

export function calculateParkingAvailabilityScore(option: ParkingOption): number {
  let score = 50;

  // Real provider status
  if (option.availabilityStatus === 'available') score += 35;
  if (option.availabilityStatus === 'unavailable') score -= 60;
  if (option.availabilityStatus === 'unknown') score -= 10;

  // Price confidence
  if (option.priceDisplay === 'live') score += 20;
  if (option.priceDisplay === 'from-per-day') score += 8;
  if (option.priceDisplay === 'check-live') score -= 8;
  if (option.priceDisplay === 'unavailable') score -= 60;

  if (option.priceConfidence === 'high') score += 15;
  if (option.priceConfidence === 'medium') score += 7;
  if (option.priceConfidence === 'low') score -= 8;

  // Provider trust
  if (option.bookingProvider === 'ParkWhiz') score += 15;
  if (option.bookingProvider === 'AirportParkingReservations') score += 8;
  if (option.sourceName === 'Google Places') score -= 12;

  // Reviews help, but don't prove availability
  if ((option.reviewScore ?? 0) >= 4.4 && (option.reviewCount ?? 0) >= 100) score += 8;
  if ((option.reviewScore ?? 0) < 3.5 && (option.reviewCount ?? 0) >= 50) score -= 8;

  // Shuttle/walk friction
  const transferMinutes =
    option.shuttleMinutes ??
    option.walkingMinutes ??
    option.transferToTerminalMinutes ??
    15;

  if (transferMinutes <= 5) score += 6;
  if (transferMinutes >= 15) score -= 6;
  if (transferMinutes >= 25) score -= 12;

  // Clamp 0–100
  return Math.max(0, Math.min(100, Math.round(score)));
}