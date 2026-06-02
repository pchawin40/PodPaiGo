import type { ParkingOption } from '../types';
import {
  parkingGooglePlaceToOptionUpdate,
  resolveParkingGooglePlace,
} from './googlePlacesCache';
import { shouldAttemptGooglePlaceMatch } from './googlePlaceMatchUtils';
import { applyCanonicalCoordinatesToOption } from './parkingCoordinates';
import { isGooglePlacesLiveBlocked } from './googlePlacesGuard';

function airportParkingContext(airportCode?: string | null): string | null {
  const code = airportCode?.trim().toUpperCase();
  if (code === 'SEA') return 'SeaTac WA airport parking';
  if (code) return `${code} airport parking`;
  return null;
}

function jiffyGeocodeFallbacks(): string[] {
  return [
    '18836 International Blvd, SeaTac, WA 98188',
    'Jiffy Airport Parking SeaTac 18836 International Blvd',
  ];
}

function withProviderCoords(
  update: Partial<ParkingOption>,
  providerLat?: number,
  providerLng?: number,
): Partial<ParkingOption> {
  return {
    ...update,
    ...(providerLat != null && providerLng != null
      ? { providerLat, providerLng }
      : {}),
  };
}

export async function resolveCanonicalParkingCoordinates(args: {
  option: ParkingOption;
  airportCode?: string | null;
  destinationContext?: string | null;
  geocodeAddress?: (address: string) => Promise<{ lat: number; lng: number } | null>;
}): Promise<Partial<ParkingOption>> {
  const { option } = args;
  const providerLat = typeof option.lat === 'number' ? option.lat : undefined;
  const providerLng = typeof option.lng === 'number' ? option.lng : undefined;
  const address =
    option.address ||
    option.normalizedAddress ||
    option.routeDestination ||
    option.googlePlaceAddress ||
    null;

  const shouldMatch = shouldAttemptGooglePlaceMatch({
    lotName: option.name,
    lotAddress: address,
    provider: option.bookingProvider || null,
    source: option.sourceName || null,
    airportCode: args.airportCode || null,
  });

  if (shouldMatch) {
    try {
      const place = await resolveParkingGooglePlace({
        airportCode: args.airportCode || null,
        parkingLotId: option.providerLotId || option.id || null,
        lotName: option.name,
        lotAddress: address,
        googlePlaceId: option.googlePlaceId || null,
        airportContext:
          args.destinationContext ||
          airportParkingContext(args.airportCode) ||
          null,
        provider: option.bookingProvider || null,
        source: option.sourceName || null,
      });

      if (place && typeof place.lat === 'number' && typeof place.lng === 'number') {
        return withProviderCoords(
          {
            ...parkingGooglePlaceToOptionUpdate(place),
            canonicalLat: place.lat,
            canonicalLng: place.lng,
            canonicalAddress: place.googleFormattedAddress || address || undefined,
            coordinateSource: 'google_place',
            lat: place.lat,
            lng: place.lng,
          },
          providerLat,
          providerLng,
        );
      }

      if (place?.googlePlaceId && !isGooglePlacesLiveBlocked()) {
        const isJiffy = option.name.toLowerCase().includes('jiffy');
        const geocodeTargets = Array.from(
          new Set(
            [
              place.googleFormattedAddress,
              address,
              ...(isJiffy ? jiffyGeocodeFallbacks() : []),
            ].filter(Boolean) as string[],
          ),
        );

        for (const geocodeTarget of geocodeTargets) {
          if (!args.geocodeAddress) continue;

          const geocoded = await args.geocodeAddress(geocodeTarget);
          if (geocoded) {
            return withProviderCoords(
              {
                ...parkingGooglePlaceToOptionUpdate(place),
                canonicalLat: geocoded.lat,
                canonicalLng: geocoded.lng,
                canonicalAddress: geocodeTarget,
                coordinateSource: 'google_place',
                lat: geocoded.lat,
                lng: geocoded.lng,
              },
              providerLat,
              providerLng,
            );
          }
        }

        return withProviderCoords(
          {
            ...parkingGooglePlaceToOptionUpdate(place),
            coordinateSource: 'haversine_fallback',
            canonicalAddress: place.googleFormattedAddress || address || undefined,
          },
          providerLat,
          providerLng,
        );
      }

      if (place) {
        return withProviderCoords(
          parkingGooglePlaceToOptionUpdate(place),
          providerLat,
          providerLng,
        );
      }
    } catch {
      // Fall through to address/provider fallbacks.
    }
  }

  if (address && args.geocodeAddress) {
    const geocoded = await args.geocodeAddress(address);
    if (geocoded) {
      return withProviderCoords(
        {
          canonicalLat: geocoded.lat,
          canonicalLng: geocoded.lng,
          canonicalAddress: address,
          coordinateSource: 'geocoded_address',
          lat: geocoded.lat,
          lng: geocoded.lng,
        },
        providerLat,
        providerLng,
      );
    }
  }

  if (providerLat != null && providerLng != null) {
    return withProviderCoords(
      {
        canonicalLat: providerLat,
        canonicalLng: providerLng,
        canonicalAddress: address || undefined,
        coordinateSource: 'provider',
      },
      providerLat,
      providerLng,
    );
  }

  return withProviderCoords(
    {
      coordinateSource: 'haversine_fallback',
    },
    providerLat,
    providerLng,
  );
}

export { applyCanonicalCoordinatesToOption };
