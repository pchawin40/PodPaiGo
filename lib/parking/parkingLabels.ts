import { isAirportTrip, type TripParkingContext } from '../trip/tripContext';

type ParkingLabelOption = {
  name?: string;
  type?: string;
  transferType?: string;
  covered?: boolean;
  category?: string;
};

export function resolveTripParkingContextFromTrip(
  tripData: { type: string; destinationKind?: string } | null | undefined,
): TripParkingContext {
  if (!tripData) return 'airport_trip';
  return isAirportTrip(tripData as Parameters<typeof isAirportTrip>[0])
    ? 'airport_trip'
    : 'city_destination_trip';
}

export function getParkingVisualBadgeLabel(
  option: ParkingLabelOption,
  context: TripParkingContext,
): string {
  if (context === 'city_destination_trip') {
    const text = `${option.name ?? ''} ${option.category ?? ''}`.toLowerCase();

    if (text.includes('park') && text.includes('ride')) return 'Park & Ride';
    if (option.covered || text.includes('garage') || text.includes('covered')) {
      return 'Covered garage';
    }
    if (text.includes('lot')) return 'Lot';
    return 'City parking';
  }

  const text = `${option.name ?? ''} ${option.category ?? ''} ${option.type ?? ''}`.toLowerCase();

  if (text.includes('park') && text.includes('ride')) return 'Park & Ride';
  if (text.includes('hotel') || text.includes('inn') || text.includes('suites')) {
    return 'Hotel Parking';
  }
  if (
    option.transferType === 'airport-garage' ||
    (text.includes('garage') && option.type === 'official')
  ) {
    return 'Airport Garage';
  }
  if (text.includes('shuttle') || option.type === 'off-airport') {
    return 'Off-site Shuttle';
  }
  if (option.type === 'official') return 'Official Airport Parking';

  return 'Airport Parking';
}

export function getParkingTransferLinkLabel(context: TripParkingContext): string {
  return context === 'city_destination_trip'
    ? 'Walk to destination'
    : 'Parking to terminal';
}

export function getParkingTimeSummaryTitle(context: TripParkingContext): string {
  return context === 'city_destination_trip'
    ? 'Total time to destination'
    : 'Total time to terminal';
}
