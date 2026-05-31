import type { ParkingOption } from '../../../../types';
import type { ParkingSearchContext, ParkingProvider, ProviderHealth } from '../../types';
import { tagParkingFreshness, inferPriceFreshness } from '../../types';
import { getParkWhizParkingOptions } from '../../../parkWhiz';
import { saveParkingPriceSnapshotsFromOptions } from '../../../../db/parkingCache';

function discoveryModeIncludes(provider: 'parkwhiz' | 'google'): boolean {
  const mode = process.env.PARKING_DISCOVERY_PROVIDER || 'all';
  return mode === 'all' || mode === provider;
}

export class ParkWhizParkingProvider implements ParkingProvider {
  id = 'parkwhiz';

  enabled(): boolean {
    return discoveryModeIncludes('parkwhiz');
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.enabled()) {
      return { status: 'offline', message: 'ParkWhiz disabled by PARKING_DISCOVERY_PROVIDER', checkedAt };
    }
    return { status: 'healthy', checkedAt };
  }

  async search(context: ParkingSearchContext): Promise<ParkingOption[]> {
    const airportCode = context.airportCode.toUpperCase();
    const options = await getParkWhizParkingOptions({
      airportCode,
      airportCoordinates: context.airportCoordinates,
      checkInDate: context.checkInDate,
      checkOutDate: context.checkOutDate,
    });

    if (options.length > 0 && context.checkInDate && context.checkOutDate) {
      void saveParkingPriceSnapshotsFromOptions({
        airportCode,
        checkInDate: context.checkInDate,
        checkOutDate: context.checkOutDate,
        source: 'parkwhiz',
        options,
        ttlHours: 2,
      }).catch((error) => {
        console.warn('[parkwhiz-provider] Failed to save price snapshots', error);
      });
    }

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

export const parkWhizParkingProvider = new ParkWhizParkingProvider();
