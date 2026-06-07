import type { WeatherImpact } from './types';

export type SeasonalClimateGuidance = {
  title: string;
  historicalLabel: string;
  raininess: string;
  tempRange: string;
  travelImpact: string;
  disclaimer: string;
  weatherImpact: WeatherImpact;
};

type MonthProfile = {
  raininess: string;
  tempRangeF: string;
  summary: string;
  condition: WeatherImpact['condition'];
  riskLevel: WeatherImpact['riskLevel'];
  precipitationChance: number;
};

/** Curated SEA-area monthly expectations — seasonal guidance, not a live forecast. */
const SEA_MONTHLY: Record<number, MonthProfile> = {
  1: {
    raininess: 'Rainy and wet',
    tempRangeF: '37–47°F',
    summary: 'Cool, wet winter with frequent rain',
    condition: 'rain',
    riskLevel: 'medium',
    precipitationChance: 65,
  },
  2: {
    raininess: 'Rainy and wet',
    tempRangeF: '38–49°F',
    summary: 'Cool, wet winter with frequent rain',
    condition: 'rain',
    riskLevel: 'medium',
    precipitationChance: 60,
  },
  3: {
    raininess: 'Wetter than average',
    tempRangeF: '41–54°F',
    summary: 'Transition month — showers still common',
    condition: 'rain',
    riskLevel: 'medium',
    precipitationChance: 55,
  },
  4: {
    raininess: 'Moderate showers',
    tempRangeF: '44–58°F',
    summary: 'Spring showers with improving dry windows',
    condition: 'rain',
    riskLevel: 'low',
    precipitationChance: 45,
  },
  5: {
    raininess: 'Moderate showers',
    tempRangeF: '49–64°F',
    summary: 'Mild spring — occasional rain',
    condition: 'rain',
    riskLevel: 'low',
    precipitationChance: 35,
  },
  6: {
    raininess: 'Drier season begins',
    tempRangeF: '54–70°F',
    summary: 'Early summer — drier and milder',
    condition: 'clear',
    riskLevel: 'low',
    precipitationChance: 25,
  },
  7: {
    raininess: 'Driest stretch',
    tempRangeF: '57–75°F',
    summary: 'Summer dry season — low rain risk',
    condition: 'clear',
    riskLevel: 'low',
    precipitationChance: 15,
  },
  8: {
    raininess: 'Driest stretch',
    tempRangeF: '57–75°F',
    summary: 'Summer dry season — low rain risk',
    condition: 'clear',
    riskLevel: 'low',
    precipitationChance: 15,
  },
  9: {
    raininess: 'Moderate showers return',
    tempRangeF: '52–68°F',
    summary: 'Early fall — rain starts picking up',
    condition: 'rain',
    riskLevel: 'low',
    precipitationChance: 35,
  },
  10: {
    raininess: 'Wetter than average',
    tempRangeF: '46–59°F',
    summary: 'Fall rain returns — plan for wet walks',
    condition: 'rain',
    riskLevel: 'medium',
    precipitationChance: 50,
  },
  11: {
    raininess: 'Rainy and wet',
    tempRangeF: '41–51°F',
    summary: 'Late fall — rainy and cool near SEA',
    condition: 'rain',
    riskLevel: 'medium',
    precipitationChance: 65,
  },
  12: {
    raininess: 'Rainy and wet',
    tempRangeF: '38–47°F',
    summary: 'Cool, wet winter with frequent rain',
    condition: 'rain',
    riskLevel: 'medium',
    precipitationChance: 65,
  },
};

function parseMonthFromDate(date: string): number | null {
  const match = date.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? month : null;
}

function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleDateString('en-US', { month: 'long' });
}

function buildTravelImpact(profile: MonthProfile): string {
  if (profile.riskLevel === 'high' || profile.riskLevel === 'medium') {
    return 'Favor covered parking and shorter uncovered walks. Outdoor shuttles may feel slower in wet weather.';
  }
  return 'Uncovered walks are usually fine, but covered garages still reduce weather friction.';
}

function buildWeatherImpact(profile: MonthProfile, airportCode: string): WeatherImpact {
  return {
    condition: profile.condition,
    temperatureF: undefined,
    precipitationChance: profile.precipitationChance,
    riskLevel: profile.riskLevel,
    parkingScoreAdjustments: {
      coveredBonus: profile.riskLevel === 'medium' ? 8 : profile.riskLevel === 'high' ? 12 : 0,
      officialGarageBonus: profile.riskLevel === 'medium' ? 5 : 0,
      shuttlePenalty: profile.riskLevel === 'medium' ? -4 : 0,
      uncoveredPenalty: profile.riskLevel === 'medium' ? -4 : 0,
    },
    summary: profile.summary,
    sourceName: `Seasonal guidance (${airportCode})`,
    lastUpdated: new Date().toISOString(),
  };
}

export function getSeasonalClimateGuidance(args: {
  airportCode?: string | null;
  targetDate?: string | null;
}): SeasonalClimateGuidance | null {
  const airportCode = String(args.airportCode || 'SEA').trim().toUpperCase();
  if (airportCode !== 'SEA') return null;

  const month = args.targetDate ? parseMonthFromDate(args.targetDate) : new Date().getMonth() + 1;
  if (!month) return null;

  const profile = SEA_MONTHLY[month];
  if (!profile) return null;

  return {
    title: `Typical ${monthName(month)} weather near ${airportCode}`,
    historicalLabel: 'Historical / seasonal',
    raininess: profile.raininess,
    tempRange: profile.tempRangeF,
    travelImpact: buildTravelImpact(profile),
    disclaimer: 'Seasonal guidance only. Live forecast appears closer to your trip.',
    weatherImpact: buildWeatherImpact(profile, airportCode),
  };
}

export function seasonalClimateSummary(guidance: SeasonalClimateGuidance): string {
  return `${guidance.raininess} · ${guidance.tempRange} · ${guidance.travelImpact}`;
}
