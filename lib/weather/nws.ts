// lib/weather/nws.ts
import { getAirportById } from '../airports/catalog';
import { WeatherImpact } from './types';

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

export async function getWeatherImpactForAirport(args: {
  airportCode: string;
  targetDateTime?: string;
}): Promise<WeatherImpact | null> {
  const airport = getAirportById(args.airportCode);
  if (!airport) return null;

  const { lat, lng } = airport.geoLocation;

  const headers = {
    Accept: 'application/geo+json',
    UserAgent: 'PodPaiGo/1.0',
  };

  const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lng}`, {
    headers,
  });

  if (!pointRes.ok) return null;

  const pointData = await pointRes.json();
  const hourlyUrl = pointData.properties?.forecastHourly;

  if (!hourlyUrl) return null;

  const hourlyRes = await fetch(hourlyUrl, { headers });

  if (!hourlyRes.ok) return null;

  const hourlyData = await hourlyRes.json();
  const periods: NwsHourlyPeriod[] = hourlyData.properties?.periods ?? [];

  if (periods.length === 0) return null;

  const targetTime = args.targetDateTime ? new Date(args.targetDateTime).getTime() : Date.now();

  const bestPeriod =
    periods.find((period) => new Date(period.startTime).getTime() >= targetTime) ?? periods[0];

  return buildWeatherImpact(bestPeriod);
}