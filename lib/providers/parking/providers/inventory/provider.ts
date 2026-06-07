import type { ParkingOption } from '../../../../types';
import type { ParkingSearchContext, ParkingProvider, ProviderHealth } from '../../types';
import { tagParkingFreshness, inferPriceFreshness } from '../../types';
import { getAirportById } from '../../../../airports/catalog';
import { getParkingLotsByAirport, getParkingLotsNearPoint } from '../../../../parking/inventory';
import {
  inventoryLotToDestinationParkingOption,
  inventoryLotToParkingOption,
} from '../../../../parking/inventoryToParkingOption';

export class InventoryParkingProvider implements ParkingProvider {
  id = 'inventory';

  enabled(): boolean {
    return process.env.DISABLE_PARKING_DB_CACHE !== 'true';
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.enabled()) {
      return {
        status: 'degraded',
        message: 'Parking inventory DB cache disabled',
        checkedAt,
      };
    }
    return { status: 'healthy', checkedAt };
  }

  async search(context: ParkingSearchContext): Promise<ParkingOption[]> {
    if (context.destinationKind === 'airport' && context.airportCode) {
      const airportCode = context.airportCode.toUpperCase();
      const airport = getAirportById(airportCode);

      const inventoryLots = await getParkingLotsByAirport(airportCode, 50).catch((error) => {
        console.warn('[inventory-provider] Parking airport inventory read failed', error);
        return [];
      });

      return inventoryLots.map((lot) => {
        const option = inventoryLotToParkingOption({
          lot,
          origin: airport?.routingAddress ?? context.destination,
        });

        return tagParkingFreshness(
          option,
          this.id,
          inferPriceFreshness(option),
          option.fetchedAt ?? option.lastUpdated,
        );
      });
    }

    const destinationLat = context.destinationCoordinates?.lat ?? context.destinationLat;
    const destinationLng = context.destinationCoordinates?.lng ?? context.destinationLng;

    if (typeof destinationLat !== 'number' || typeof destinationLng !== 'number') {
      return [];
    }

    const inventoryLots = await getParkingLotsNearPoint({
      lat: destinationLat,
      lng: destinationLng,
      radiusMiles: Number(process.env.DESTINATION_PARKING_SEARCH_RADIUS_METERS || 2500) / 1609.34,
      limit: 50,
      destinationKind: context.destinationKind,
    }).catch((error) => {
      console.warn('[inventory-provider] Parking destination inventory read failed', error);
      return [];
    });

    return inventoryLots.map((lot) => {
      const option = inventoryLotToDestinationParkingOption({
        lot,
        origin: context.origin ?? context.destination,
        destination: context.destination,
      });

      return tagParkingFreshness(
        option,
        this.id,
        inferPriceFreshness(option),
        option.fetchedAt ?? option.lastUpdated,
      );
    });
  }
}

export const inventoryParkingProvider = new InventoryParkingProvider();
