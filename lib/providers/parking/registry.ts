import type { ParkingProviderSearchResult, ParkingSearchContext } from './types';
import type { ParkingProvider } from './types';
import { debugLog } from '../../utils/debug';

function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ProviderRegistry {
  private providers = new Map<string, ParkingProvider>();

  register(provider: ParkingProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  getProviders(): ParkingProvider[] {
    return [...this.providers.values()];
  }

  getProvider(providerId: string): ParkingProvider | undefined {
    return this.providers.get(providerId);
  }

  async executeSearch(context: ParkingSearchContext): Promise<ParkingProviderSearchResult[]> {
    const providers = this.getProviders().filter((provider) => provider.enabled());

    return Promise.all(
      providers.map(async (provider) => {
        const checkedAt = new Date().toISOString();

        try {
          const health = await provider.health();
          if (health.status === 'offline') {
            debugLog('parking_provider_failed', {
              providerId: provider.id,
              destinationKind: context.destinationKind,
              airportCode: context.airportCode,
              resultCount: 0,
              error: health.message || 'provider_offline',
            });
            return {
              providerId: provider.id,
              options: [],
              health,
            };
          }

          const options = await provider.search(context);
          debugLog('parking_provider_success', {
            providerId: provider.id,
            destinationKind: context.destinationKind,
            airportCode: context.airportCode,
            resultCount: options.length,
            healthStatus: health.status,
          });
          return {
            providerId: provider.id,
            options,
            health,
          };
        } catch (error) {
          const message = sanitizeError(error);
          console.warn(`[parking-registry] Provider ${provider.id} search failed:`, message);
          debugLog('parking_provider_failed', {
            providerId: provider.id,
            destinationKind: context.destinationKind,
            airportCode: context.airportCode,
            resultCount: 0,
            error: message,
          });

          return {
            providerId: provider.id,
            options: [],
            health: {
              status: 'offline',
              message,
              checkedAt,
            },
            error: message,
          };
        }
      }),
    );
  }
}

export const parkingProviderRegistry = new ProviderRegistry();
