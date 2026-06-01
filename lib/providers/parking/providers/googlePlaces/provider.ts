import type { ParkingOption } from '../../../../types';
import { getGoogleMapsServerApiKey } from '../../../../env/googleMapsServerKey';
import type { ParkingProvider, ParkingSearchContext, ProviderHealth } from '../../types';
import { tagParkingFreshness, inferPriceFreshness } from '../../types';
import { getGoogleParkingPlaces } from './airportSearch';

function discoveryModeIncludes(provider: 'google'): boolean {
  const mode = process.env.PARKING_DISCOVERY_PROVIDER || 'all';
  return mode === 'all' || mode === provider;
}

export class GooglePlacesParkingProvider implements ParkingProvider {
  id = 'google';

  enabled(): boolean {
    return discoveryModeIncludes('google');
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.enabled()) {
      return {
        status: 'offline',
        message: 'Google Places disabled by PARKING_DISCOVERY_PROVIDER',
        checkedAt,
      };
    }
    if (!getGoogleMapsServerApiKey()) {
      return {
        status: 'degraded',
        message: 'GOOGLE_MAPS_SERVER_API_KEY not configured',
        checkedAt,
      };
    }
    return { status: 'healthy', checkedAt };
  }

  async search(context: ParkingSearchContext): Promise<ParkingOption[]> {
    const airportCode = context.airportCode.toUpperCase();

    const options = await getGoogleParkingPlaces({
      airportCode,
      airportCoordinates: context.airportCoordinates,
      destination: context.destination,
    }).catch((error) => {
      console.warn('[google-places-provider] Google parking places unavailable', error);
      return [];
    });

    return options.map((option) =>
      tagParkingFreshness(
        option,
        this.id,
        inferPriceFreshness(option),
        option.fetchedAt ?? option.lastUpdated,
      ),
    );
  }
}

export const googlePlacesParkingProvider = new GooglePlacesParkingProvider();
