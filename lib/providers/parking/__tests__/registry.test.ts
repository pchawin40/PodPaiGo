import { ProviderRegistry } from '../registry';
import type { ParkingProvider } from '../types';

describe('parking provider registry', () => {
  it('registers and retrieves providers by id', () => {
    const registry = new ProviderRegistry();

    const provider: ParkingProvider = {
      id: 'test-provider',
      enabled: () => true,
      health: async () => ({ status: 'healthy', checkedAt: new Date().toISOString() }),
      search: async () => [],
    };

    registry.register(provider);

    expect(registry.getProvider('test-provider')).toBe(provider);
    expect(registry.getProviders()).toHaveLength(1);
  });

  it('unregisters providers', () => {
    const registry = new ProviderRegistry();

    const provider: ParkingProvider = {
      id: 'temp-provider',
      enabled: () => true,
      health: async () => ({ status: 'healthy', checkedAt: new Date().toISOString() }),
      search: async () => [],
    };

    registry.register(provider);
    registry.unregister('temp-provider');

    expect(registry.getProvider('temp-provider')).toBeUndefined();
    expect(registry.getProviders()).toHaveLength(0);
  });

  it('executeSearch skips offline providers', async () => {
    const registry = new ProviderRegistry();

    registry.register({
      id: 'offline-provider',
      enabled: () => true,
      health: async () => ({
        status: 'offline',
        message: 'Unavailable',
        checkedAt: new Date().toISOString(),
      }),
      search: async () => [{ id: 'should-not-return', name: 'X', type: 'off-airport', price: 1, distance: 1, availability: 1, trustStatus: 'estimated', sourceName: 'test', lastUpdated: new Date().toISOString(), assumptions: [] }],
    });

    registry.register({
      id: 'healthy-provider',
      enabled: () => true,
      health: async () => ({ status: 'healthy', checkedAt: new Date().toISOString() }),
      search: async () => [{
        id: 'healthy-option',
        name: 'Healthy Lot',
        type: 'off-airport',
        price: 10,
        distance: 5,
        availability: 80,
        trustStatus: 'estimated',
        sourceName: 'test',
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      }],
    });

    const results = await registry.executeSearch({
      airportCode: 'SEA',
      destination: 'Seattle-Tacoma International Airport (SEA)',
    });

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.providerId === 'offline-provider')?.options).toEqual([]);
    expect(results.find((r) => r.providerId === 'healthy-provider')?.options).toHaveLength(1);
  });

  it('executeSearch isolates provider search failures', async () => {
    const registry = new ProviderRegistry();

    registry.register({
      id: 'failing-provider',
      enabled: () => true,
      health: async () => ({ status: 'healthy', checkedAt: new Date().toISOString() }),
      search: async () => {
        throw new Error('Network timeout');
      },
    });

    registry.register({
      id: 'working-provider',
      enabled: () => true,
      health: async () => ({ status: 'healthy', checkedAt: new Date().toISOString() }),
      search: async () => [{
        id: 'ok',
        name: 'Working Lot',
        type: 'off-airport',
        price: 12,
        distance: 4,
        availability: 90,
        trustStatus: 'estimated',
        sourceName: 'test',
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      }],
    });

    const results = await registry.executeSearch({
      airportCode: 'SEA',
      destination: 'Seattle-Tacoma International Airport (SEA)',
    });

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.providerId === 'failing-provider')?.options).toEqual([]);
    expect(results.find((r) => r.providerId === 'failing-provider')?.health.status).toBe('offline');
    expect(results.find((r) => r.providerId === 'working-provider')?.options).toHaveLength(1);
  });
});
