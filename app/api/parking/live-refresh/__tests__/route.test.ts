import { POST } from '../route';
import {
  getDestinationParkingOptions,
  getLiveParkingOptions,
} from '@/lib/providers/parkingAggregator';

jest.mock('@/lib/providers/parkingAggregator', () => ({
  getLiveParkingOptions: jest.fn(async () => []),
  getDestinationParkingOptions: jest.fn(async () => []),
}));

jest.mock('@/lib/apiUsage/placesRequestBudget', () => ({
  runWithPlacesRequestBudget: jest.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
}));

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/parking/live-refresh', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/parking/live-refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('supports airport parking refresh through airport aggregation', async () => {
    (getLiveParkingOptions as jest.Mock).mockResolvedValueOnce([
      {
        id: 'airport-lot-1',
        name: 'Airport Lot',
        type: 'off-airport',
        price: 20,
        distance: 10,
        availability: 80,
        trustStatus: 'live',
        sourceName: 'Fixture',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
    ]);

    const response = await POST(
      request({
        destinationKind: 'airport',
        airportCode: 'SEA',
        destination: 'Seattle-Tacoma International Airport',
        checkInDate: '2026-06-01',
        checkOutDate: '2026-06-02',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe('refreshed');
    expect(json.parking).toHaveLength(1);
    expect(getLiveParkingOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        airportCode: 'SEA',
        destination: 'Seattle-Tacoma International Airport',
      }),
    );
    expect(getDestinationParkingOptions).not.toHaveBeenCalled();
  });

  test('supports general destination parking refresh without defaulting to SEA', async () => {
    (getDestinationParkingOptions as jest.Mock).mockResolvedValueOnce([
      {
        id: 'destination-lot-1',
        name: 'Destination Garage',
        type: 'official',
        price: 14,
        distance: 8,
        availability: 70,
        trustStatus: 'estimated',
        sourceName: 'Fixture',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
    ]);

    const response = await POST(
      request({
        destinationKind: 'downtown',
        origin: 'Monroe, WA',
        destination: 'Bellevue Square',
        destinationLat: 47.615,
        destinationLng: -122.203,
        dateTime: '2026-06-01T10:00:00.000Z',
        parkingDurationMinutes: 180,
        checkInDate: '2026-06-01',
        checkOutDate: '2026-06-01',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe('refreshed');
    expect(json.parking).toHaveLength(1);
    expect(getLiveParkingOptions).not.toHaveBeenCalled();
    expect(getDestinationParkingOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'Monroe, WA',
        destination: 'Bellevue Square',
        destinationLat: 47.615,
        destinationLng: -122.203,
      }),
    );
  });
});
