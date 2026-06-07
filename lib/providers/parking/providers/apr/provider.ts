import type { ParkingOption } from '../../../../types';
import type { ParkingProvider, ParkingSearchContext, ProviderHealth } from '../../types';
import { tagParkingFreshness, inferPriceFreshness } from '../../types';
import { buildAprParkingOptions } from './buildOptions';

export class AprParkingProvider implements ParkingProvider {
  id = 'apr';

  enabled(): boolean {
    return process.env.DISABLE_APR_PARKING !== 'true';
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.enabled()) {
      return {
        status: 'offline',
        message: 'APR parking disabled by DISABLE_APR_PARKING',
        checkedAt,
      };
    }
    return { status: 'healthy', checkedAt };
  }

  async search(context: ParkingSearchContext): Promise<ParkingOption[]> {
    if (!context.airportCode) return [];
    const airportCode = context.airportCode.toUpperCase();
    const options = await buildAprParkingOptions({
      airportCode,
      checkInDate: context.checkInDate,
      checkOutDate: context.checkOutDate,
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

export const aprParkingProvider = new AprParkingProvider();
