import { ParkingOption, TripData } from '../types';

export async function attachGooglePlaceToParking(
  parking: ParkingOption,
  tripData: TripData | null
): Promise<ParkingOption> {
  const airport = tripData?.airportCode || null;

  const body = {
    name: parking.name,
    airport,
    address: parking.normalizedAddress || parking.routeDestination || null,
    googlePlaceId: parking.googlePlaceId || null,
    parkingLotId: parking.providerLotId || null,
    destination: tripData?.destination || parking.routeDestination || null,
  };

  const res = await fetch('/api/google-place-match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return parking;

  const data = await res.json();
  const place = data.place;

  if (!place?.googlePlaceId) return parking;

  return {
    ...parking,
    googlePlaceId: place.googlePlaceId,
    googleReviews: place.reviews,
    googleReviewsFetchedAt: place.fetchedAt,
    googleReviewsExpiresAt: place.expiresAt,
    googlePlaceName: place.name ?? parking.googlePlaceName,
    googlePlaceAddress: place.address ?? parking.googlePlaceAddress,
    reviewScore: typeof place.rating === 'number' ? place.rating : parking.reviewScore,
    reviewCount: typeof place.reviewCount === 'number' ? place.reviewCount : parking.reviewCount,
    normalizedAddress: place.address ?? parking.normalizedAddress,
  };
}
