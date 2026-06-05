import type { TripData } from '../types';

export type TripParkingContext = 'airport_trip' | 'city_destination_trip';

function tripTypeValue(tripData: TripData): string {
  return String(tripData.type);
}

export function isCityDestinationTrip(tripData: Pick<TripData, 'type' | 'destinationKind'>): boolean {
  if (tripTypeValue(tripData as TripData) === 'general-trip') {
    return true;
  }

  if (tripData.destinationKind && tripData.destinationKind !== 'airport') {
    return true;
  }

  return false;
}

export function isAirportTrip(tripData: Pick<TripData, 'type' | 'destinationKind'>): boolean {
  return !isCityDestinationTrip(tripData);
}

export function shouldDiscoverParkingForTrip(
  tripData: Pick<TripData, 'type' | 'destinationKind' | 'parkingPreference'>,
): boolean {
  if (tripData.parkingPreference === 'none') {
    return false;
  }

  if (isCityDestinationTrip(tripData)) {
    return true;
  }

  const tripType = tripTypeValue(tripData as TripData);
  return tripType === 'one-way-departure' || tripType === 'round-trip' || tripType === 'airport-departure' || tripType === 'airport-round-trip';
}

export function resolveTripParkingContext(
  tripData: Pick<TripData, 'type' | 'destinationKind'>,
): TripParkingContext {
  return isCityDestinationTrip(tripData)
    ? 'city_destination_trip'
    : 'airport_trip';
}
