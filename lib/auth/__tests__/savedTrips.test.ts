import type { TripData } from '../../types';
import { buildSavedTripInsert } from '../buildSavedTrip';
import { insertSavedTrip } from '../savedTrips';

const AIRPORT_TRIP: TripData = {
  type: 'one-way-departure',
  origin: 'Monroe, WA',
  destination: 'Seattle-Tacoma International Airport',
  destinationKind: 'airport',
  airportCode: 'SEA',
  departureDate: '2026-06-01',
  departureTime: '06:00',
  transportAvailability: 'car',
};

describe('savedTrips', () => {
  test('buildSavedTripInsert maps trip payload fields', () => {
    const insert = buildSavedTripInsert(AIRPORT_TRIP, 'user-123', { intent: 'flying-out' });

    expect(insert.user_id).toBe('user-123');
    expect(insert.origin_text).toBe('Monroe, WA');
    expect(insert.destination_text).toContain('Seattle-Tacoma');
    expect(insert.airport_code).toBe('SEA');
    expect(insert.trip_type).toBe('one-way-departure');
    expect(insert.trip_payload).toEqual(AIRPORT_TRIP);
    expect(insert.departure_at).toBeTruthy();
  });

  test('insertSavedTrip calls saved_trips insert for authenticated user', async () => {
    const single = jest.fn(async () => ({
      data: {
        id: 'trip-1',
        user_id: 'user-123',
        trip_name: 'Monroe → SEA',
        origin_text: 'Monroe, WA',
        destination_text: 'Seattle-Tacoma International Airport',
        airport_code: 'SEA',
        departure_at: '2026-06-01T13:00:00.000Z',
        return_at: null,
        trip_type: 'one-way-departure',
        trip_payload: AIRPORT_TRIP,
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
      error: null,
    }));

    const insert = jest.fn(() => ({
      select: jest.fn(() => ({
        single,
      })),
    }));

    const client = {
      from: jest.fn(() => ({
        insert,
      })),
    };

    const result = await insertSavedTrip(client as never, AIRPORT_TRIP, 'user-123', {
      intent: 'flying-out',
    });

    expect(client.from).toHaveBeenCalledWith('saved_trips');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        trip_type: 'one-way-departure',
        trip_payload: AIRPORT_TRIP,
      }),
    );
    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('trip-1');
  });
});
