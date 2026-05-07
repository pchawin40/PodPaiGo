import type { WeatherImpact } from '../weather/types';
import type { OptionIntelligence } from './optionIntelligence';

export function buildSmartTags(
  intelligence: OptionIntelligence,
  weatherImpact?: WeatherImpact | null
): string[] {
  return [
    intelligence.trueTotalCost !== undefined && intelligence.trueTotalCost <= 25
      ? 'Cheapest total'
      : null,
    intelligence.stressScore <= 25 ? 'Lowest stress' : null,
    intelligence.walkingBurdenScore <= 25 ? 'Easy luggage' : null,
    intelligence.weatherPenaltyScore <= 15 && weatherImpact?.riskLevel !== 'low'
      ? 'Best in bad weather'
      : null,
    intelligence.fullLotRiskScore <= 25 ? 'Lower full-lot risk' : null,
  ].filter(Boolean) as string[];
}