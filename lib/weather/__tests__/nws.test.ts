import { getWeatherForAirport, getWeatherForPoint } from '../nws';

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

  afterEach(() => {
    global.fetch = originalFetch;
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
    expect(result.weatherImpact).toBeNull();
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
