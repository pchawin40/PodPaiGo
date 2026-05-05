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