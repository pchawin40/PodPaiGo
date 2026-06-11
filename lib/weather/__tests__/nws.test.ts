import { clearNwsWeatherCache, getWeatherForAirport, getWeatherForPoint } from '../nws';

const pointPayload = {
  properties: {
    forecastHourly: 'https://api.weather.gov/gridpoints/SEW/124,67/forecast/hourly',
    timeZone: 'America/Los_Angeles',
  },
};

function hourlyPayload(periods: Array<{
  startTime: string;
  shortForecast: string;
  temperature?: number;
}>) {
  return {
    properties: {
      periods: periods.map((period) => ({
        temperature: period.temperature ?? 65,
        windSpeed: '5 mph',
        probabilityOfPrecipitation: { value: 10 },
        ...period,
      })),
    },
  };
}

function mockWeatherFetch(periods: Array<{
  startTime: string;
  shortForecast: string;
  temperature?: number;
}>) {
  const fetchMock = jest.fn(async (url: string | URL | Request) => {
    const textUrl = String(url);
    return {
      ok: true,
      json: async () =>
        textUrl.includes('/points/')
          ? pointPayload
          : hourlyPayload(periods),
    } as Response;
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('weather forecast availability', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearNwsWeatherCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearNwsWeatherCache();
  });

  test('far future trip shows forecast-unavailable context', async () => {
    mockWeatherFetch([
      { startTime: '2026-06-06T12:00:00-07:00', shortForecast: 'Sunny' },
      { startTime: '2026-06-07T12:00:00-07:00', shortForecast: 'Cloudy' },
    ]);

    const result = await getWeatherForAirport({
      airportCode: 'SEA',
      targetDateTime: '2030-01-01T10:00:00',
    });

    expect(result.context).toBe('forecast-unavailable');
    expect(result.unavailableReason).toBe('out-of-window');
    expect(result.weatherImpact).toBeNull();
  });

  test('near-term target before first hourly period uses the first forecast instead of out-of-window', async () => {
    mockWeatherFetch([
      { startTime: '2026-06-07T12:00:00-07:00', shortForecast: 'Near-term Seattle forecast', temperature: 66 },
      { startTime: '2026-06-07T13:00:00-07:00', shortForecast: 'Later Seattle forecast', temperature: 68 },
    ]);

    const result = await getWeatherForPoint({
      lat: 47.6097,
      lng: -122.3425,
      targetDateTime: '2026-06-07T11:30',
    });

    expect(result.context).toBe('travel-time-forecast');
    expect(result.weatherImpact?.summary).toBe('Near-term Seattle forecast');
    expect(result.unavailableReason).toBeUndefined();
  });

  test('tomorrow Seattle point trip uses forecast in NWS local timezone', async () => {
    mockWeatherFetch([
      { startTime: '2026-06-07T13:00:00-07:00', shortForecast: 'Wrong UTC-shift period' },
      { startTime: '2026-06-07T20:00:00-07:00', shortForecast: 'Seattle evening forecast', temperature: 61 },
    ]);

    const result = await getWeatherForPoint({
      lat: 47.6097,
      lng: -122.3425,
      targetDateTime: '2026-06-07T19:30',
    });

    expect(result.context).toBe('travel-time-forecast');
    expect(result.weatherImpact?.summary).toBe('Seattle evening forecast');
    expect(result.weatherImpact?.temperatureF).toBe(61);
  });

  test('Austin point trip uses weather.gov point and hourly forecast with user agent', async () => {
    const fetchMock = mockWeatherFetch([
      { startTime: '2026-06-07T12:00:00-05:00', shortForecast: 'Austin sunny forecast', temperature: 93 },
    ]);

    const result = await getWeatherForPoint({
      lat: 30.2701,
      lng: -97.7313,
      targetDateTime: '2026-06-07T12:00:00-05:00',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.weather.gov/points/30.2701,-97.7313',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('PodPaiGo'),
        }),
      }),
    );
    expect(result.context).toBe('travel-time-forecast');
    expect(result.weatherImpact?.summary).toBe('Austin sunny forecast');
    expect(result.weatherImpact?.sourceName).toBe('weather.gov / National Weather Service');
  });

  test('caches point mapping and hourly forecast results', async () => {
    const fetchMock = mockWeatherFetch([
      { startTime: '2026-06-07T20:00:00-07:00', shortForecast: 'Seattle cached forecast' },
    ]);

    await getWeatherForPoint({
      lat: 47.6097,
      lng: -122.3425,
      targetDateTime: '2026-06-07T19:30',
    });
    await getWeatherForPoint({
      lat: 47.6097,
      lng: -122.3425,
      targetDateTime: '2026-06-07T19:30',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('unknown coordinates do not call weather.gov', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await getWeatherForPoint({
      lat: Number.NaN,
      lng: -97.7313,
      targetDateTime: '2026-06-07T12:00',
    });

    expect(result.context).toBe('unavailable');
    expect(result.weatherImpact).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('outside-US weather.gov point failure returns unavailable', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await getWeatherForPoint({
      lat: 51.5074,
      lng: -0.1278,
      targetDateTime: '2026-06-07T12:00',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.weather.gov/points/51.5074,-0.1278',
      expect.any(Object),
    );
    expect(result.context).toBe('unavailable');
    expect(result.unavailableReason).toBe('point-lookup-failed');
    expect(result.weatherImpact).toBeNull();
  });
});

export function weatherUnavailableCopy(context?: string): string {
  if (context === 'forecast-unavailable') {
    return 'Forecast becomes available closer to your trip.';
  }

  return 'Weather data is currently unavailable.';
}

describe('weather unavailable copy', () => {
  test('far future trip uses closer-to-trip copy', () => {
    expect(weatherUnavailableCopy('forecast-unavailable')).toBe(
      'Forecast becomes available closer to your trip.',
    );
  });
});
