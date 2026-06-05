// lib/weather/nws.ts
import { getAirportById } from '../airports/catalog';
import { WeatherImpact, WeatherLookupResult } from './types';

type NwsHourlyPeriod = {
  startTime: string;
  temperature?: number;
  windSpeed?: string;
  shortForecast?: string;
  probabilityOfPrecipitation?: {
    value: number | null;
  };
};

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
    sourceName: 'National Weather Service',
    lastUpdated: new Date().toISOString(),
  };
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
    return {
      weatherImpact: null,
      context: 'unavailable',
      targetDateTime: args.targetDateTime,
    };
  }

  const { lat, lng } = airport.geoLocation;

  const headers = {
    Accept: 'application/geo+json',
    UserAgent: 'PodPaiGo/1.0',
  };

  try {
    const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lng}`, {
      headers,
    });

    if (!pointRes.ok) {
      return {
        weatherImpact: null,
        context: 'unavailable',
        targetDateTime: args.targetDateTime,
      };
    }

    const pointData = await pointRes.json();
    const hourlyUrl = pointData.properties?.forecastHourly;

    if (!hourlyUrl) {
      return {
        weatherImpact: null,
        context: 'unavailable',
        targetDateTime: args.targetDateTime,
      };
    }

    const hourlyRes = await fetch(hourlyUrl, { headers });

    if (!hourlyRes.ok) {
      return {
        weatherImpact: null,
        context: 'unavailable',
        targetDateTime: args.targetDateTime,
      };
    }

    const hourlyData = await hourlyRes.json();
    const periods: NwsHourlyPeriod[] = hourlyData.properties?.periods ?? [];

    if (periods.length === 0) {
      return {
        weatherImpact: null,
        context: 'unavailable',
        targetDateTime: args.targetDateTime,
      };
    }

    const firstPeriod = periods[0];
    const lastPeriod = periods[periods.length - 1];
    const firstTime = new Date(firstPeriod.startTime).getTime();
    const lastTime = new Date(lastPeriod.startTime).getTime();

    if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) {
      return {
        weatherImpact: null,
        context: 'unavailable',
        targetDateTime: args.targetDateTime,
      };
    }

    if (args.targetDateTime) {
      const targetTime = new Date(args.targetDateTime).getTime();
      if (!Number.isFinite(targetTime)) {
        return {
          weatherImpact: null,
          context: 'invalid-travel-time',
          targetDateTime: args.targetDateTime,
          forecastRangeStart: firstPeriod.startTime,
          forecastRangeEnd: lastPeriod.startTime,
        };
      }

      if (targetTime < firstTime || targetTime > lastTime) {
        return {
          weatherImpact: null,
          context: 'forecast-unavailable',
          targetDateTime: args.targetDateTime,
          forecastRangeStart: firstPeriod.startTime,
          forecastRangeEnd: lastPeriod.startTime,
        };
      }

      const targetPeriod = findFirstPeriodAtOrAfter(periods, targetTime);
      if (!targetPeriod) {
        return {
          weatherImpact: null,
          context: 'unavailable',
          targetDateTime: args.targetDateTime,
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
      context: currentPeriod ? 'current-airport-weather' : 'unavailable',
      forecastRangeStart: firstPeriod.startTime,
      forecastRangeEnd: lastPeriod.startTime,
    };
  } catch {
    return {
      weatherImpact: null,
      context: 'unavailable',
      targetDateTime: args.targetDateTime,
    };
  }
}

export async function getWeatherForPoint(args: {
  lat: number;
  lng: number;
  targetDateTime?: string;
  currentContext?: WeatherLookupResult['context'];
}): Promise<WeatherLookupResult> {
  if (!Number.isFinite(args.lat) || !Number.isFinite(args.lng)) {
    return {
      weatherImpact: null,
      context: 'unavailable',
      targetDateTime: args.targetDateTime,
    };
  }

  const headers = {
    Accept: 'application/geo+json',
    UserAgent: 'PodPaiGo/1.0',
  };

  try {
    const pointRes = await fetch(`https://api.weather.gov/points/${args.lat},${args.lng}`, {
      headers,
    });

    if (!pointRes.ok) {
      return {
        weatherImpact: null,
        context: 'unavailable',
        targetDateTime: args.targetDateTime,
      };
    }

    const pointData = await pointRes.json();
    const hourlyUrl = pointData.properties?.forecastHourly;

    if (!hourlyUrl) {
      return {
        weatherImpact: null,
        context: 'unavailable',
        targetDateTime: args.targetDateTime,
      };
    }

    const hourlyRes = await fetch(hourlyUrl, { headers });

    if (!hourlyRes.ok) {
      return {
        weatherImpact: null,
        context: 'unavailable',
        targetDateTime: args.targetDateTime,
      };
    }

    const hourlyData = await hourlyRes.json();
    const periods: NwsHourlyPeriod[] = hourlyData.properties?.periods ?? [];

    if (periods.length === 0) {
      return {
        weatherImpact: null,
        context: 'unavailable',
        targetDateTime: args.targetDateTime,
      };
    }

    const firstPeriod = periods[0];
    const lastPeriod = periods[periods.length - 1];
    const firstTime = new Date(firstPeriod.startTime).getTime();
    const lastTime = new Date(lastPeriod.startTime).getTime();

    if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) {
      return {
        weatherImpact: null,
        context: 'unavailable',
        targetDateTime: args.targetDateTime,
      };
    }

    if (args.targetDateTime) {
      const targetTime = new Date(args.targetDateTime).getTime();
      if (!Number.isFinite(targetTime)) {
        return {
          weatherImpact: null,
          context: 'invalid-travel-time',
          targetDateTime: args.targetDateTime,
          forecastRangeStart: firstPeriod.startTime,
          forecastRangeEnd: lastPeriod.startTime,
        };
      }

      if (targetTime < firstTime || targetTime > lastTime) {
        return {
          weatherImpact: null,
          context: 'forecast-unavailable',
          targetDateTime: args.targetDateTime,
          forecastRangeStart: firstPeriod.startTime,
          forecastRangeEnd: lastPeriod.startTime,
        };
      }

      const targetPeriod = findFirstPeriodAtOrAfter(periods, targetTime);
      if (!targetPeriod) {
        return {
          weatherImpact: null,
          context: 'unavailable',
          targetDateTime: args.targetDateTime,
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
      context: currentPeriod ? args.currentContext || 'current-destination-weather' : 'unavailable',
      forecastRangeStart: firstPeriod.startTime,
      forecastRangeEnd: lastPeriod.startTime,
    };
  } catch {
    return {
      weatherImpact: null,
      context: 'unavailable',
      targetDateTime: args.targetDateTime,
    };
  }
}

export async function getWeatherImpactForAirport(args: {
  airportCode: string;
  targetDateTime?: string;
}): Promise<WeatherImpact | null> {
  const result = await getWeatherForAirport(args);
  return result.weatherImpact;
}
