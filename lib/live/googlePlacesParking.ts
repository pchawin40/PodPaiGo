import { ParkingOption } from '../types';

type GooglePlaceParkingResult = {
  id: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  googleMapsUri?: string;
};

export async function enrichParkingWithGooglePlaces(
  parking: ParkingOption[]
): Promise<ParkingOption[]> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

  if (!apiKey) {
    return parking;
  }

  const enriched = await Promise.all(
    parking.map(async (p) => {
      try {
        const query = `${p.name} SeaTac airport parking`;

        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.googleMapsUri',
          },
          body: JSON.stringify({
            textQuery: query,
            maxResultCount: 1,
          }),
        });

        if (!res.ok) return p;

        const data = await res.json();
        const place = data?.places?.[0] as GooglePlaceParkingResult | undefined;

        if (!place) return p;

        return {
          ...p,
          reviewScore: place.rating ?? p.reviewScore,
          reviewCount: place.userRatingCount ?? p.reviewCount,
          googlePlaceId: place.id ?? p.googlePlaceId,
          googlePlaceName: place.displayName?.text ?? p.googlePlaceName,
          googlePlaceAddress: place.formattedAddress ?? p.googlePlaceAddress,
          googleMapsUri: place.googleMapsUri ?? p.googleMapsUri,
          address: place.formattedAddress ?? p.address,
          normalizedAddress: place.formattedAddress ?? p.normalizedAddress,
          mapLink: place.googleMapsUri ?? p.mapLink,
          sourceName: p.sourceName || 'Google Places',
          assumptions: [
            ...(p.assumptions || []),
            'Review score and count enriched from Google Places when available.',
          ],
        };
      } catch {
        return p;
      }
    })
  );

  return enriched;
}
