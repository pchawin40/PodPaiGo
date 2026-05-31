import type { ParkingProviderSearchResult, ParkingSearchContext } from './types';
import type { ParkingProvider } from './types';

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
            return {
              providerId: provider.id,
              options: [],
              health,
            };
          }

          const options = await provider.search(context);
          return {
            providerId: provider.id,
            options,
            health,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[parking-registry] Provider ${provider.id} search failed:`, message);

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
