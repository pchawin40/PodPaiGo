import type { ParkingOption } from '../../../../types';
import type { ParkingProvider, ParkingSearchContext, ProviderHealth } from '../../types';
import { tagParkingFreshness, inferPriceFreshness } from '../../types';
import { getAirportById } from '../../../../airports/catalog';
import { buildMarketplaceParkingOptions } from './buildOptions';

export class MarketplaceParkingProvider implements ParkingProvider {
  id = 'marketplace';

  enabled(): boolean {
    return true;
  }

  async health(): Promise<ProviderHealth> {
    return { status: 'healthy', checkedAt: new Date().toISOString() };
  }

  async search(context: ParkingSearchContext): Promise<ParkingOption[]> {
    if (!context.airportCode) return [];
    const airportCode = context.airportCode.toUpperCase();
    const airport = getAirportById(airportCode);
    const airportSearchName = airport
      ? `${airport.label} (${airport.id}) parking`
      : `${airportCode} airport parking`;

    const options = buildMarketplaceParkingOptions({
      airportCode,
      destination: context.destination,
      airportSearchName,
    });

    const checkedAt = new Date().toISOString();
    return options.map((option) =>
      tagParkingFreshness(
        option,
        this.id,
        inferPriceFreshness(option),
        option.fetchedAt ?? checkedAt,
      ),
    );
  }
}

export const marketplaceParkingProvider = new MarketplaceParkingProvider();
