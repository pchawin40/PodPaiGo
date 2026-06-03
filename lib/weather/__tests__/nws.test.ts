import { getWeatherForAirport } from '../nws';

describe('weather forecast availability', () => {
  test('far future trip shows forecast-unavailable context', async () => {
    const result = await getWeatherForAirport({
      airportCode: 'SEA',
      targetDateTime: '2030-01-01T10:00:00',
    });

    expect(result.context).toBe('forecast-unavailable');
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
