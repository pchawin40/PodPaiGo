import { getParkingLotsByAirport, getParkingLotsNearPoint } from '../../../../../parking/inventory';
import { InventoryParkingProvider } from '../provider';

jest.mock('../../../../../parking/inventory', () => ({
  getParkingLotsByAirport: jest.fn(async () => []),
  getParkingLotsNearPoint: jest.fn(async () => []),
}));

const inventoryRow = {
  id: 42,
  airportCode: 'SEA',
  name: 'Cached Downtown Garage',
  normalizedName: 'cached downtown garage',
  address: '100 Pike St, Seattle, WA',
  latitude: 47.609,
  longitude: -122.34,
  source: 'Supabase cache',
  sourceId: 'cached-downtown-garage',
  sourceUrl: 'https://example.com/garage',
  isOfficial: false,
  confidence: 0.8,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
  distanceMiles: 0.2,
};

describe('InventoryParkingProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getParkingLotsByAirport as jest.Mock).mockResolvedValue([]);
    (getParkingLotsNearPoint as jest.Mock).mockResolvedValue([]);
  });

  test('airport trips use airport-scoped inventory', async () => {
    (getParkingLotsByAirport as jest.Mock).mockResolvedValueOnce([inventoryRow]);

    const provider = new InventoryParkingProvider();
    const options = await provider.search({
      airportCode: 'SEA',
      destinationKind: 'airport',
      destination: 'Seattle-Tacoma International Airport',
    });

    expect(getParkingLotsByAirport).toHaveBeenCalledWith('SEA', 50);
    expect(getParkingLotsNearPoint).not.toHaveBeenCalled();
    expect(options[0]).toMatchObject({
      id: 'inventory-42',
      serviceAirportCode: 'SEA',
      providerSource: 'inventory',
    });
  });

  test('general trips use destination coordinate inventory without airport_code filter', async () => {
    (getParkingLotsNearPoint as jest.Mock).mockResolvedValueOnce([inventoryRow]);

    const provider = new InventoryParkingProvider();
    const options = await provider.search({
      destinationKind: 'general',
      destination: 'Pike Place Market',
      origin: 'Monroe, WA',
      destinationLat: 47.6097,
      destinationLng: -122.3425,
    });

    expect(getParkingLotsByAirport).not.toHaveBeenCalled();
    expect(getParkingLotsNearPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: 47.6097,
        lng: -122.3425,
        destinationKind: 'general',
      }),
    );
    expect(options[0]).toMatchObject({
      id: 'destination-cache-42',
      name: 'Cached Downtown Garage',
      providerSource: 'destination-cache',
      parkingDiscoveryStatus: 'cache_only_budget_limited',
      transferType: 'walk',
      priceDisplay: 'check-live',
    });
    expect(options[0]?.assumptions).toEqual(
      expect.arrayContaining([
        'Cached parking option.',
        'Live availability not confirmed.',
        'Open directions/provider site to verify price and availability.',
      ]),
    );
  });

  test('general trips without destination coordinates do not query airport inventory', async () => {
    const provider = new InventoryParkingProvider();
    const options = await provider.search({
      destinationKind: 'general',
      destination: 'Pike Place Market',
      origin: 'Monroe, WA',
    });

    expect(options).toEqual([]);
    expect(getParkingLotsByAirport).not.toHaveBeenCalled();
    expect(getParkingLotsNearPoint).not.toHaveBeenCalled();
  });
});
