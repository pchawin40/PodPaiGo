import {
  lookupTicketmasterEventsNearTrip,
  resolveEventLookupTripDateTime,
  resetTicketmasterEventCacheForTests,
} from '../ticketmaster';

const originalEnv = { ...process.env };

function restoreEnvVar(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function restoreEnv() {
  restoreEnvVar('ENABLE_EVENT_LOOKUP', originalEnv.ENABLE_EVENT_LOOKUP);
  restoreEnvVar('TICKETMASTER_API_KEY', originalEnv.TICKETMASTER_API_KEY);
  restoreEnvVar('EVENT_LOOKUP_RADIUS_MILES', originalEnv.EVENT_LOOKUP_RADIUS_MILES);
  restoreEnvVar('EVENT_LOOKUP_TIME_WINDOW_HOURS', originalEnv.EVENT_LOOKUP_TIME_WINDOW_HOURS);
}

describe('lookupTicketmasterEventsNearTrip', () => {
  beforeEach(() => {
    resetTicketmasterEventCacheForTests();
    restoreEnv();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    resetTicketmasterEventCacheForTests();
    restoreEnv();
    jest.restoreAllMocks();
  });

  test('disabled event lookup returns null without calling Ticketmaster', async () => {
    process.env.ENABLE_EVENT_LOOKUP = 'false';
    process.env.TICKETMASTER_API_KEY = 'tm-key';

    await expect(
      lookupTicketmasterEventsNearTrip({
        destinationName: 'Lumen Field',
        destinationLat: 47.5952,
        destinationLng: -122.3316,
        arrivalDate: '2026-06-12',
        arrivalTime: '19:00',
      }),
    ).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('missing API key returns null and does not throw', async () => {
    process.env.ENABLE_EVENT_LOOKUP = 'true';
    delete process.env.TICKETMASTER_API_KEY;

    await expect(
      lookupTicketmasterEventsNearTrip({
        destinationName: 'Lumen Field',
        destinationLat: 47.5952,
        destinationLng: -122.3316,
        arrivalDate: '2026-06-12',
        arrivalTime: '19:00',
      }),
    ).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('Ticketmaster response maps to confirmed-event signal', async () => {
    process.env.ENABLE_EVENT_LOOKUP = 'true';
    process.env.TICKETMASTER_API_KEY = 'tm-key';
    process.env.EVENT_LOOKUP_RADIUS_MILES = '0.5';
    process.env.EVENT_LOOKUP_TIME_WINDOW_HOURS = '4';
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _embedded: {
          events: [
            {
              name: 'Seattle Sounders FC vs Portland Timbers',
              url: 'https://ticketmaster.test/event',
              dates: {
                start: {
                  localDate: '2026-06-12',
                  localTime: '19:30:00',
                },
              },
              _embedded: {
                venues: [
                  {
                    name: 'Lumen Field',
                    location: {
                      latitude: '47.5952',
                      longitude: '-122.3316',
                    },
                  },
                ],
              },
            },
          ],
        },
      }),
    });

    const signal = await lookupTicketmasterEventsNearTrip({
      destinationName: 'Lumen Field',
      destinationLat: 47.5952,
      destinationLng: -122.3316,
      arrivalDate: '2026-06-12',
      arrivalTime: '19:00',
    });

    expect(signal).toMatchObject({
      source: 'ticketmaster',
      status: 'confirmed-event',
      eventName: 'Seattle Sounders FC vs Portland Timbers',
      venueName: 'Lumen Field',
      eventUrl: 'https://ticketmaster.test/event',
      confidence: 'high',
    });
    expect(signal?.warningCopy).toContain('Seattle Sounders FC vs Portland Timbers at Lumen Field');
    expect(signal?.warningCopy).toContain('Street and meter parking may be restricted');

    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(url.searchParams.get('apikey')).toBe('tm-key');
    expect(url.searchParams.get('latlong')).toBe('47.5952,-122.3316');
    expect(url.searchParams.get('radius')).toBe('0.5');
    expect(url.searchParams.get('size')).toBe('5');
  });

  test('resolves event lookup time from parking window before arrival and trip time', () => {
    expect(
      resolveEventLookupTripDateTime({
        parkingCheckInDate: '2026-06-15',
        parkingCheckInTime: '08:45',
        arrivalDate: '2026-06-15',
        arrivalTime: '09:00',
        date: '2026-06-14',
        time: '20:00',
      }),
    ).toEqual({
      date: '2026-06-15',
      time: '08:45',
      source: 'parking-window',
    });

    expect(
      resolveEventLookupTripDateTime({
        arrivalDate: '2026-06-15',
        arrivalTime: '09:00',
        date: '2026-06-14',
        time: '20:00',
      }),
    ).toEqual({
      date: '2026-06-15',
      time: '09:00',
      source: 'arrival',
    });
  });

  test('Ticketmaster request uses selected future arrival date instead of current window', async () => {
    process.env.ENABLE_EVENT_LOOKUP = 'true';
    process.env.TICKETMASTER_API_KEY = 'tm-key';
    process.env.EVENT_LOOKUP_TIME_WINDOW_HOURS = '4';
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ _embedded: { events: [] } }),
    });

    await lookupTicketmasterEventsNearTrip({
      destinationName: 'Lumen Field',
      destinationLat: 47.5952,
      destinationLng: -122.3316,
      arrivalDate: '2026-06-15',
      arrivalTime: '09:00',
      now: new Date(2026, 5, 12, 12, 0, 0),
    });

    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(url.searchParams.get('startDateTime')).toContain('2026-06-15');
    expect(url.searchParams.get('endDateTime')).toContain('2026-06-15');
  });

  test('Ticketmaster request falls back to now only when no selected trip time exists', async () => {
    process.env.ENABLE_EVENT_LOOKUP = 'true';
    process.env.TICKETMASTER_API_KEY = 'tm-key';
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ _embedded: { events: [] } }),
    });

    await lookupTicketmasterEventsNearTrip({
      destinationName: 'Lumen Field',
      destinationLat: 47.5952,
      destinationLng: -122.3316,
      now: new Date(2026, 5, 20, 13, 0, 0),
    });

    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(url.searchParams.get('startDateTime')).toContain('2026-06-20');
  });

  test('empty Ticketmaster response returns null', async () => {
    process.env.ENABLE_EVENT_LOOKUP = 'true';
    process.env.TICKETMASTER_API_KEY = 'tm-key';
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ _embedded: { events: [] } }),
    });

    await expect(
      lookupTicketmasterEventsNearTrip({
        destinationName: 'Lumen Field',
        destinationLat: 47.5952,
        destinationLng: -122.3316,
        arrivalDate: '2026-06-12',
        arrivalTime: '19:00',
      }),
    ).resolves.toBeNull();
  });

  test('Ticketmaster failure returns null without throwing', async () => {
    process.env.ENABLE_EVENT_LOOKUP = 'true';
    process.env.TICKETMASTER_API_KEY = 'tm-key';
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));

    await expect(
      lookupTicketmasterEventsNearTrip({
        destinationName: 'Lumen Field',
        destinationLat: 47.5952,
        destinationLng: -122.3316,
        arrivalDate: '2026-06-12',
        arrivalTime: '19:00',
      }),
    ).resolves.toBeNull();
  });
});
