import type { ParkingOption } from '../../../../types';
import type { ParkingProvider, ParkingSearchContext, ProviderHealth } from '../../types';
import { tagParkingFreshness } from '../../types';
import { getParkingPriceSnapshotsCached } from '../../shared/snapshots';
import { buildSnapshotParkingOptions } from './buildOptions';

export class SnapshotParkingProvider implements ParkingProvider {
  id = 'snapshot';

  enabled(): boolean {
    return process.env.DISABLE_PARKING_DB_CACHE !== 'true';
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.enabled()) {
      return {
        status: 'degraded',
        message: 'Parking snapshot cache disabled',
        checkedAt,
      };
    }
    return { status: 'healthy', checkedAt };
  }

  async search(context: ParkingSearchContext): Promise<ParkingOption[]> {
    const airportCode = context.airportCode.toUpperCase();
    const snapshots = await getParkingPriceSnapshotsCached({
      airportCode,
      checkInDate: context.checkInDate,
      checkOutDate: context.checkOutDate,
    });

    const options = buildSnapshotParkingOptions({ airportCode, snapshots });

    return options.map((option) =>
      tagParkingFreshness(option, this.id, 'live', option.fetchedAt ?? option.lastUpdated),
    );
  }
}

export const snapshotParkingProvider = new SnapshotParkingProvider();
