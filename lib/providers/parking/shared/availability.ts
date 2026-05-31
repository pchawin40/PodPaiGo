import type { ParkingOption } from '../../../types';
import { calculateParkingAvailabilityScore } from '../../../parking/availabilityScore';
import { withStableParkingRouteStatus } from '../../../parking/routeStatus';

export function withAvailabilityScore(option: ParkingOption): ParkingOption {
  const availabilityScore = calculateParkingAvailabilityScore(option);

  return {
    ...withStableParkingRouteStatus(option),
    availabilityScore,
    availability: availabilityScore,
    isAvailable: option.availabilityStatus !== 'unavailable',
  };
}
