import { ParkingOption } from '../types';
import { aggregateAirportParkingOptions } from './parking/aggregator';
import { applyLegacyDisplayOrder } from './parking/displayOrder';

export {
  getDestinationParkingOptions,
  getDestinationParkingOptionsWithMetadata,
} from './parking/providers/googlePlaces/destinationSearch';

export async function getLiveParkingOptions(args: {
  airportCode?: string;
  airportCoordinates?: { lat: number; lng: number };
  destination: string;
  checkInDate?: string;
  checkOutDate?: string;
  checkInAt?: string;
  checkOutAt?: string;
}): Promise<ParkingOption[]> {
  const options = await aggregateAirportParkingOptions(args);
  return applyLegacyDisplayOrder(options);
}
