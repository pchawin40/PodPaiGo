import type { WeatherContext, WeatherUnavailableReason } from './types';

export function weatherSectionDetail(
  context?: WeatherContext,
  reason?: WeatherUnavailableReason,
): string {
  if (context === 'forecast-unavailable' && reason === 'out-of-window') {
    return 'Forecast becomes available closer to your trip.';
  }

  if (reason === 'missing-coordinates') {
    return 'Weather needs a confirmed destination location.';
  }

  if (reason === 'missing-time') {
    return 'Weather needs a valid travel date and time.';
  }

  if (reason === 'timeout') {
    return 'Weather lookup timed out. Try again or check the forecast directly.';
  }

  if (
    reason === 'point-lookup-failed' ||
    reason === 'forecast-url-missing' ||
    reason === 'forecast-fetch-failed' ||
    reason === 'empty-forecast' ||
    reason === 'provider-failure'
  ) {
    return 'Weather provider data is currently unavailable.';
  }

  if (context === 'current-airport-weather') {
    return 'Showing current conditions because a valid travel time was not provided.';
  }

  if (context === 'current-destination-weather') {
    return 'Showing current destination conditions because a valid travel time was not provided.';
  }

  if (context === 'invalid-travel-time') {
    return 'We could not read the selected travel date/time for weather.';
  }

  return 'Weather data is currently unavailable.';
}
