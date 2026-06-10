// lib/weather/types.ts
export type WeatherImpact = {
  condition: 'clear' | 'rain' | 'snow' | 'wind' | 'storm' | 'unknown';
  temperatureF?: number;
  precipitationChance?: number;
  windMph?: number;
  riskLevel: 'low' | 'medium' | 'high';
  parkingScoreAdjustments: {
    coveredBonus: number;
    officialGarageBonus: number;
    shuttlePenalty: number;
    uncoveredPenalty: number;
  };
  summary: string;
  sourceName: string;
  lastUpdated: string;
};

export type WeatherContext =
  | 'travel-time-forecast'
  | 'current-airport-weather'
  | 'current-destination-weather'
  | 'forecast-unavailable'
  | 'invalid-travel-time'
  | 'unavailable';

export type WeatherUnavailableReason =
  | 'missing-coordinates'
  | 'missing-time'
  | 'invalid-date'
  | 'out-of-window'
  | 'point-lookup-failed'
  | 'forecast-url-missing'
  | 'forecast-fetch-failed'
  | 'empty-forecast'
  | 'timeout'
  | 'provider-failure'
  | 'unknown-airport';

export type WeatherLookupResult = {
  weatherImpact: WeatherImpact | null;
  context: WeatherContext;
  unavailableReason?: WeatherUnavailableReason;
  diagnostics?: {
    reason?: WeatherUnavailableReason;
    locationSource?: 'airport' | 'destination' | 'missing';
    provider?: string;
    status?: number;
    cacheStatus?: 'hit' | 'miss' | 'stale';
    message?: string;
  };
  targetDateTime?: string;
  forecastRangeStart?: string;
  forecastRangeEnd?: string;
};
