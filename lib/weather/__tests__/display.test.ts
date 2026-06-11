import { weatherSectionDetail } from '../display';

describe('weather display copy', () => {
  test('uses closer-to-trip copy only for true forecast window misses', () => {
    expect(weatherSectionDetail('forecast-unavailable', 'out-of-window')).toBe(
      'Forecast becomes available closer to your trip.',
    );

    expect(weatherSectionDetail('forecast-unavailable', 'provider-failure')).toBe(
      'Weather provider data is currently unavailable.',
    );

    expect(weatherSectionDetail('unavailable', 'missing-coordinates')).toBe(
      'Weather needs a confirmed destination location.',
    );
  });
});
