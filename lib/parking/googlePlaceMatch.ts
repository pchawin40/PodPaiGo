import { ParkingOption, TripData } from "../types";

export async function attachGooglePlaceToParking(
  parking: ParkingOption,
  tripData: TripData | null
): Promise<ParkingOption> {
  if (parking.googlePlaceId) return parking;

  const airport =
    tripData?.destination ||
    parking.routeDestination ||
    "airport";

  const params = new URLSearchParams({
    name: parking.name,
    airport,
  });

  const res = await fetch(`/api/google-place-match?${params.toString()}`);

  if (!res.ok) return parking;

  const data = await res.json();
  const place = data.place;

  if (!place?.googlePlaceId) return parking;

  return {
    ...parking,
    googlePlaceId: place.googlePlaceId,
    reviewScore: place.rating,
    reviewCount: place.reviewCount,
    normalizedAddress: place.address ?? parking.normalizedAddress,
  };
}