// lib/weather/nws.ts
import { getAirportById } from '../airports/catalog';
import { debugLog } from '../utils/debug';
import { WeatherImpact, WeatherLookupResult, WeatherUnavailableReason } from './types';

const NWS_USER_AGENT =
  process.env.NWS_USER_AGENT || 'PodPaiGo/1.0 (https://podpaigo.com; support@podpaigo.com)';
const NWS_CACHE_TTL_MS = 10 * 60 * 1000;
const NEAR_TERM_BEFORE_FORECAST_WINDOW_MS = 6 * 60 * 60 * 1000;

type NwsHourlyPeriod = {
  startTime: string;
  temperature?: number;
  windSpeed?: string;
  shortForecast?: string;
  probabilityOfPrecipitation?: {
    value: number | null;
  };
};

type NwsPointProperties = {
  forecastHourly?: string;
  forecast?: string;
  forecastGridData?: string;
  timeZone?: string;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const pointCache = new Map<string, CacheEntry<NwsPointProperties | null>>();
const forecastCache = new Map<string, CacheEntry<NwsHourlyPeriod[] | null>>();

function cacheGet<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): T {
  cache.set(key, {
    expiresAt: Date.now() + NWS_CACHE_TTL_MS,
    value,
  });
  return value;
}

export function clearNwsWeatherCache(): void {
  pointCache.clear();
  forecastCache.clear();
}

function nwsHeaders(): HeadersInit {
  return {
    Accept: 'application/geo+json',
    'User-Agent': NWS_USER_AGENT,
  };
}

function pointCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

async function fetchNwsPointProperties(lat: number, lng: number): Promise<{
  properties: NwsPointProperties | null;
  status?: number;
  cacheStatus: 'hit' | 'miss';
}> {
  const cacheKey = pointCacheKey(lat, lng);
  const cached = cacheGet(pointCache, cacheKey);
  if (cached !== undefined) return { properties: cached, cacheStatus: 'hit' };

  const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lng}`, {
    headers: nwsHeaders(),
  });

  if (!pointRes.ok) {
    cacheSet(pointCache, cacheKey, null);
    return { properties: null, status: pointRes.status, cacheStatus: 'miss' };
  }

  const pointData = await pointRes.json();
  const properties = pointData?.properties;
  if (!properties || typeof properties !== 'object') {
    cacheSet(pointCache, cacheKey, null);
    return { properties: null, cacheStatus: 'miss' };
  }

  const mapped = cacheSet(pointCache, cacheKey, {
    forecastHourly:
      typeof properties.forecastHourly === 'string'
        ? properties.forecastHourly
        : undefined,
    forecast:
      typeof properties.forecast === 'string'
        ? properties.forecast
        : undefined,
    forecastGridData:
      typeof properties.forecastGridData === 'string'
        ? properties.forecastGridData
        : undefined,
    timeZone:
      typeof properties.timeZone === 'string'
        ? properties.timeZone
        : undefined,
  });

  return { properties: mapped, cacheStatus: 'miss' };
}

async function fetchNwsPeriods(url: string): Promise<{
  periods: NwsHourlyPeriod[] | null;
  status?: number;
  cacheStatus: 'hit' | 'miss';
}> {
  const cached = cacheGet(forecastCache, url);
  if (cached !== undefined) return { periods: cached, cacheStatus: 'hit' };

  const forecastRes = await fetch(url, { headers: nwsHeaders() });
  if (!forecastRes.ok) {
    cacheSet(forecastCache, url, null);
    return { periods: null, status: forecastRes.status, cacheStatus: 'miss' };
  }

  const forecastData = await forecastRes.json();
  const periods = forecastData?.properties?.periods;
  return {
    periods: cacheSet(forecastCache, url, Array.isArray(periods) ? periods : null),
    cacheStatus: 'miss',
  };
}

function parseWindMph(windSpeed?: string): number | undefined {
  if (!windSpeed) return undefined;
  const match = windSpeed.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function classifyWeather(period: NwsHourlyPeriod): WeatherImpact['condition'] {
  const text = period.shortForecast?.toLowerCase() ?? '';

  if (text.includes('thunder') || text.includes('storm')) return 'storm';
  if (text.includes('snow') || text.includes('ice')) return 'snow';
  if (text.includes('rain') || text.includes('showers') || text.includes('drizzle')) return 'rain';
  if (text.includes('wind')) return 'wind';
  if (text.includes('sun') || text.includes('clear')) return 'clear';

  return 'unknown';
}

function buildWeatherImpact(period: NwsHourlyPeriod): WeatherImpact {
  const condition = classifyWeather(period);
  const windMph = parseWindMph(period.windSpeed);
  const precipitationChance = period.probabilityOfPrecipitation?.value ?? undefined;

  const isBadWeather =
    condition === 'rain' ||
    condition === 'snow' ||
    condition === 'storm' ||
    (windMph ?? 0) >= 25 ||
    (precipitationChance ?? 0) >= 50;

  const riskLevel: WeatherImpact['riskLevel'] =
    condition === 'snow' || condition === 'storm'
      ? 'high'
      : isBadWeather
        ? 'medium'
        : 'low';

  return {
    condition,
    temperatureF: period.temperature,
    precipitationChance,
    windMph,
    riskLevel,
    parkingScoreAdjustments: {
      coveredBonus: riskLevel === 'high' ? 12 : riskLevel === 'medium' ? 8 : 0,
      officialGarageBonus: riskLevel === 'high' ? 10 : riskLevel === 'medium' ? 5 : 0,
      shuttlePenalty: riskLevel === 'high' ? -10 : riskLevel === 'medium' ? -4 : 0,
      uncoveredPenalty: riskLevel === 'high' ? -8 : riskLevel === 'medium' ? -4 : 0,
    },
    summary: period.shortForecast ?? 'Weather impact unavailable',
    sourceName: 'weather.gov / National Weather Service',
    lastUpdated: new Date().toISOString(),
  };
}

function unavailableWeatherResult(
  targetDateTime: string | undefined,
  reason: WeatherUnavailableReason,
  diagnostics: WeatherLookupResult['diagnostics'] = {},
): WeatherLookupResult {
  return {
    weatherImpact: null,
    context: 'unavailable',
    unavailableReason: reason,
    diagnostics: {
      provider: 'weather.gov / National Weather Service',
      reason,
      ...diagnostics,
    },
    targetDateTime,
  };
}

function resolveForecastFromPeriods(args: {
  periods: NwsHourlyPeriod[];
  targetDateTime?: string;
  timeZone?: string;
  currentContext: WeatherLookupResult['context'];
}): WeatherLookupResult {
  const periods = args.periods;
  if (periods.length === 0) {
    return unavailableWeatherResult(args.targetDateTime, 'empty-forecast');
  }

  const firstPeriod = periods[0];
  const lastPeriod = periods[periods.length - 1];
  const firstTime = new Date(firstPeriod.startTime).getTime();
  const lastTime = new Date(lastPeriod.startTime).getTime();

  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) {
    return unavailableWeatherResult(args.targetDateTime, 'provider-failure', {
      message: 'Forecast periods had invalid timestamps.',
    });
  }

  if (args.targetDateTime) {
    const targetTime = parseTargetDateTimeMs(args.targetDateTime, args.timeZone);
    if (!Number.isFinite(targetTime)) {
      return {
        weatherImpact: null,
        context: 'invalid-travel-time',
        unavailableReason: 'invalid-date',
        diagnostics: {
          provider: 'weather.gov / National Weather Service',
          reason: 'invalid-date',
        },
        targetDateTime: args.targetDateTime,
        forecastRangeStart: firstPeriod.startTime,
        forecastRangeEnd: lastPeriod.startTime,
      };
    }

    if (targetTime < firstTime) {
      if (firstTime - targetTime <= NEAR_TERM_BEFORE_FORECAST_WINDOW_MS) {
        return {
          weatherImpact: buildWeatherImpact(firstPeriod),
          context: 'travel-time-forecast',
          targetDateTime: args.targetDateTime,
          forecastRangeStart: firstPeriod.startTime,
          forecastRangeEnd: lastPeriod.startTime,
        };
      }

      return {
        weatherImpact: null,
        context: 'unavailable',
        unavailableReason: 'invalid-date',
        diagnostics: {
          provider: 'weather.gov / National Weather Service',
          reason: 'invalid-date',
          message: 'Target time was before available forecast range.',
        },
        targetDateTime: args.targetDateTime,
        forecastRangeStart: firstPeriod.startTime,
        forecastRangeEnd: lastPeriod.startTime,
      };
    }

    if (targetTime > lastTime) {
      return {
        weatherImpact: null,
        context: 'forecast-unavailable',
        unavailableReason: 'out-of-window',
        diagnostics: {
          provider: 'weather.gov / National Weather Service',
          reason: 'out-of-window',
        },
        targetDateTime: args.targetDateTime,
        forecastRangeStart: firstPeriod.startTime,
        forecastRangeEnd: lastPeriod.startTime,
      };
    }

    const targetPeriod = findFirstPeriodAtOrAfter(periods, targetTime);
    if (!targetPeriod) {
      return {
        ...unavailableWeatherResult(args.targetDateTime, 'empty-forecast'),
        forecastRangeStart: firstPeriod.startTime,
        forecastRangeEnd: lastPeriod.startTime,
      };
    }

    return {
      weatherImpact: buildWeatherImpact(targetPeriod),
      context: 'travel-time-forecast',
      targetDateTime: args.targetDateTime,
      forecastRangeStart: firstPeriod.startTime,
      forecastRangeEnd: lastPeriod.startTime,
    };
  }

  const now = Date.now();
  const currentPeriod = findFirstPeriodAtOrAfter(periods, now) || periods[0];

  return {
    weatherImpact: currentPeriod ? buildWeatherImpact(currentPeriod) : null,
    context: currentPeriod ? args.currentContext : 'unavailable',
    forecastRangeStart: firstPeriod.startTime,
    forecastRangeEnd: lastPeriod.startTime,
  };
}

const EXPLICIT_TIME_ZONE_PATTERN = /(?:z|[+-]\d{2}:?\d{2})$/i;

function parseLocalDateTimeParts(value: string):
  | {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
      second: number;
    }
  | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second || '0'),
  };

  if (
    !Number.isInteger(parts.year) ||
    !Number.isInteger(parts.month) ||
    !Number.isInteger(parts.day) ||
    !Number.isInteger(parts.hour) ||
    !Number.isInteger(parts.minute) ||
    !Number.isInteger(parts.second)
  ) {
    return null;
  }

  return parts;
}

function timeZoneOffsetMs(timeZone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );

  const asUtc = Date.UTC(
    values.get('year') ?? date.getUTCFullYear(),
    (values.get('month') ?? date.getUTCMonth() + 1) - 1,
    values.get('day') ?? date.getUTCDate(),
    values.get('hour') ?? date.getUTCHours(),
    values.get('minute') ?? date.getUTCMinutes(),
    values.get('second') ?? date.getUTCSeconds(),
  );

  return asUtc - date.getTime();
}

function zonedLocalDateTimeToUtcMs(
  parts: NonNullable<ReturnType<typeof parseLocalDateTimeParts>>,
  timeZone: string,
): number {
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  let utc = localAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const offset = timeZoneOffsetMs(timeZone, new Date(utc));
    utc = localAsUtc - offset;
  }

  return utc;
}

function parseTargetDateTimeMs(
  targetDateTime: string,
  timeZone?: string,
): number {
  if (EXPLICIT_TIME_ZONE_PATTERN.test(targetDateTime)) {
    return new Date(targetDateTime).getTime();
  }

  const localParts = parseLocalDateTimeParts(targetDateTime);
  if (localParts && timeZone) {
    try {
      return zonedLocalDateTimeToUtcMs(localParts, timeZone);
    } catch {
      return new Date(targetDateTime).getTime();
    }
  }

  return new Date(targetDateTime).getTime();
}

function findFirstPeriodAtOrAfter(
  periods: NwsHourlyPeriod[],
  targetTime: number
): NwsHourlyPeriod | null {
  const match = periods.find((period) => {
    const periodStart = new Date(period.startTime).getTime();
    return Number.isFinite(periodStart) && periodStart >= targetTime;
  });

  return match ?? periods[periods.length - 1] ?? null;
}

export async function getWeatherForAirport(args: {
  airportCode: string;
  targetDateTime?: string;
}): Promise<WeatherLookupResult> {
  const airport = getAirportById(args.airportCode);
  if (!airport) {
    return unavailableWeatherResult(args.targetDateTime, 'unknown-airport', {
      locationSource: 'missing',
    });
  }

  const { lat, lng } = airport.geoLocation;

  try {
    const pointLookup = await fetchNwsPointProperties(lat, lng);
    const point = pointLookup.properties;
    const hourlyUrl = point?.forecastHourly;

    if (!hourlyUrl) {
      const reason: WeatherUnavailableReason = point ? 'forecast-url-missing' : 'point-lookup-failed';
      return unavailableWeatherResult(args.targetDateTime, reason, {
        locationSource: 'airport',
        status: pointLookup.status,
        cacheStatus: pointLookup.cacheStatus,
      });
    }

    const forecastLookup = await fetchNwsPeriods(hourlyUrl);
    if (forecastLookup.status && !forecastLookup.periods) {
      return unavailableWeatherResult(args.targetDateTime, 'forecast-fetch-failed', {
        locationSource: 'airport',
        status: forecastLookup.status,
        cacheStatus: forecastLookup.cacheStatus,
      });
    }

    const result = resolveForecastFromPeriods({
      periods: forecastLookup.periods ?? [],
      targetDateTime: args.targetDateTime,
      timeZone: point?.timeZone,
      currentContext: 'current-airport-weather',
    });
    return {
      ...result,
      diagnostics: {
        provider: 'weather.gov / National Weather Service',
        locationSource: 'airport',
        status: forecastLookup.status,
        cacheStatus: forecastLookup.cacheStatus,
        ...result.diagnostics,
      },
    };
  } catch {
    debugLog('weather_provider_exception', {
      locationSource: 'airport',
      airportCode: args.airportCode,
    });
    return unavailableWeatherResult(args.targetDateTime, 'provider-failure', {
      locationSource: 'airport',
    });
  }
}

export async function getWeatherForPoint(args: {
  lat: number;
  lng: number;
  targetDateTime?: string;
  currentContext?: WeatherLookupResult['context'];
}): Promise<WeatherLookupResult> {
  if (!Number.isFinite(args.lat) || !Number.isFinite(args.lng)) {
    return unavailableWeatherResult(args.targetDateTime, 'missing-coordinates', {
      locationSource: 'missing',
    });
  }

  try {
    const pointLookup = await fetchNwsPointProperties(args.lat, args.lng);
    const point = pointLookup.properties;
    const hourlyUrl = point?.forecastHourly;

    if (!hourlyUrl) {
      const reason: WeatherUnavailableReason = point ? 'forecast-url-missing' : 'point-lookup-failed';
      return unavailableWeatherResult(args.targetDateTime, reason, {
        locationSource: 'destination',
        status: pointLookup.status,
        cacheStatus: pointLookup.cacheStatus,
      });
    }

    const forecastLookup = await fetchNwsPeriods(hourlyUrl);
    if (forecastLookup.status && !forecastLookup.periods) {
      return unavailableWeatherResult(args.targetDateTime, 'forecast-fetch-failed', {
        locationSource: 'destination',
        status: forecastLookup.status,
        cacheStatus: forecastLookup.cacheStatus,
      });
    }

    const result = resolveForecastFromPeriods({
      periods: forecastLookup.periods ?? [],
      targetDateTime: args.targetDateTime,
      timeZone: point?.timeZone,
      currentContext: args.currentContext || 'current-destination-weather',
    });
    return {
      ...result,
      diagnostics: {
        provider: 'weather.gov / National Weather Service',
        locationSource: 'destination',
        status: forecastLookup.status,
        cacheStatus: forecastLookup.cacheStatus,
        ...result.diagnostics,
      },
    };
  } catch {
    debugLog('weather_provider_exception', {
      locationSource: 'destination',
      lat: args.lat,
      lng: args.lng,
    });
    return unavailableWeatherResult(args.targetDateTime, 'provider-failure', {
      locationSource: 'destination',
    });
  }
}

export async function getWeatherImpactForAirport(args: {
  airportCode: string;
  targetDateTime?: string;
}): Promise<WeatherImpact | null> {
  const result = await getWeatherForAirport(args);
  return result.weatherImpact;
}
