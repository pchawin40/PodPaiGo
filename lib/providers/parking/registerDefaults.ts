import { parkingProviderRegistry } from './registry';
import { inventoryParkingProvider } from './providers/inventory/provider';
import { parkWhizParkingProvider } from './providers/parkWhiz/provider';
import { googlePlacesParkingProvider } from './providers/googlePlaces/provider';
import { aprParkingProvider } from './providers/apr/provider';
import { snapshotParkingProvider } from './providers/snapshot/provider';
import { marketplaceParkingProvider } from './providers/marketplace/provider';
import { communityFreeParkingProvider } from './providers/communityFree/provider';

let defaultsRegistered = false;

export function registerDefaultParkingProviders(): void {
  if (defaultsRegistered) return;

  parkingProviderRegistry.register(inventoryParkingProvider);
  parkingProviderRegistry.register(parkWhizParkingProvider);
  parkingProviderRegistry.register(googlePlacesParkingProvider);
  parkingProviderRegistry.register(aprParkingProvider);
  parkingProviderRegistry.register(snapshotParkingProvider);
  parkingProviderRegistry.register(marketplaceParkingProvider);
  parkingProviderRegistry.register(communityFreeParkingProvider);

  defaultsRegistered = true;
}

export function resetDefaultParkingProvidersForTests(): void {
  defaultsRegistered = false;
  parkingProviderRegistry.unregister('inventory');
  parkingProviderRegistry.unregister('parkwhiz');
  parkingProviderRegistry.unregister('google');
  parkingProviderRegistry.unregister('apr');
  parkingProviderRegistry.unregister('snapshot');
  parkingProviderRegistry.unregister('marketplace');
  parkingProviderRegistry.unregister('community-free');
}
