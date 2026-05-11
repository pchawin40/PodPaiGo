import { MockTrafficProvider } from '../providers';
import { ParkingOption } from '../types';
import {
  isParkingRouteUnavailable,
  mergeParkingRouteStatus,
} from '../parking/routeStatus';

function parkingFixture(overrides: Partial<ParkingOption> = {}): ParkingOption {
  return {
    id: 'inventory-sea-garage',
    name: 'Seattle-Tacoma International Airport (SEA) Parking Garage',
    type: 'official',
    price: 40,
    distance: 0,
    availability: 0,
    trustStatus: 'estimated',
    routeUnavailable: false,
    sourceName: 'Parking inventory',
    lastUpdated: new Date().toISOString(),
    assumptions: [],
    ...overrides,
  };
}

describe('parking route unavailable flow', () => {
  it('flags Hawaii-to-SEA driving routes as unavailable before parking ranking', async () => {
    const provider = new MockTrafficProvider();

    const estimate = await provider.getTrafficEstimate(
      'Kuhio Ave + Seaside Ave, Honolulu, HI 96815',
      'Seattle-Tacoma International Airport (SEA), 17801 International Blvd, SeaTac, WA 98158',
      '2026-06-01T12:00:00'
    );

    expect(estimate.routeUnavailable).toBe(true);
    expect(estimate.routeUnavailableReason).toContain('Route unavailable');
  });

  it('preserves route-unavailable status when later data enriches a parking option', () => {
    const unavailable = parkingFixture({
      routeUnavailable: true,
      routeTrustStatus: 'fallback',
      routeUnavailableReason: 'Google Routes could not calculate a driving route.',
    });

    const livePriceUpdate = parkingFixture({
      price: 18,
      trustStatus: 'live',
      routeUnavailable: false,
      routeTrustStatus: 'live',
      routeUnavailableReason: undefined,
    });

    const merged = mergeParkingRouteStatus(unavailable, livePriceUpdate);

    expect(isParkingRouteUnavailable(merged)).toBe(true);
    expect(merged.routeTrustStatus).toBe('fallback');
    expect(merged.routeUnavailableReason).toBe(
      'Google Routes could not calculate a driving route.'
    );
    expect(merged.price).toBe(18);
  });
});
