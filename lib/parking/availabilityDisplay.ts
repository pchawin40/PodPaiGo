// lib/parking/availabilityDisplay.ts
import { ParkingOption } from '../types';

export function getParkingAvailabilityDisplay(option: ParkingOption) {
  if (option.availabilityStatus === 'available') {
    return {
      label: 'Available',
      tone: 'green',
      description: 'Availability was confirmed or recently cached.',
    };
  }

  if (option.availabilityStatus === 'unavailable' || option.priceDisplay === 'unavailable') {
    return {
      label: 'Sold out / unavailable',
      tone: 'red',
      description: 'This lot appears unavailable for the selected dates.',
    };
  }

  if (option.priceDisplay === 'from-per-day' || option.priceConfidence === 'medium') {
    return {
      label: 'Likely available',
      tone: 'yellow',
      description: 'Starting rate found, but final availability should be verified.',
    };
  }

  return {
    label: 'Verify availability',
    tone: 'zinc',
    description: 'Open provider to confirm current price and availability.',
  };
}