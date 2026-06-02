import type { Recommendation, TripData } from '../types';
import { formatTimeFriendly } from '../tripTime';
import { isAiAssistantDisabled } from './tripParseConfig';

export type AssistantPage = 'home' | 'trip' | 'results';

export type ResultsAssistantContext = {
  tripData: TripData;
  recommendation: Recommendation;
  leaveByTime?: string | null;
};

export function isAssistantFeatureDisabled(): boolean {
  return isAiAssistantDisabled();
}

export function isTripPlanningMessage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;

  const lower = trimmed.toLowerCase();
  const planningSignals = [
    /\b(plan|book|schedule|flying|flight|airport trip|weekend trip|need parking|leave by)\b/,
    /\bfrom .+ to .+\b/,
    /\b(sea|lax|jfk|bli|pae|ord|dfw|atl)\b.*\b(to|from|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)\b/,
    /\b(round trip|one way|returning|coming back)\b/,
  ];

  return planningSignals.some((pattern) => pattern.test(lower));
}

export function buildMockAssistantReply(text: string, page: AssistantPage): string {
  const lower = text.trim().toLowerCase();

  if (lower.includes('hello') || lower.includes('hi')) {
    return 'Hi! I can help you plan an airport trip or explain your results. Try describing a trip like “Weekend from Monroe to SEA Nov 15–18”.';
  }

  if (lower.includes('help')) {
    if (page === 'results') {
      return 'Ask about leave time, parking, TSA, weather, or rideshare using the data already on this page. To plan a different trip, describe it and I will parse it for review first.';
    }

    return 'Describe your airport trip in plain English. I will parse it and show a review screen before running recommendations.';
  }

  if (isTripPlanningMessage(text)) {
    return 'That sounds like a trip request. I will parse it next so you can review details before recommendations run.';
  }

  return 'I am in mock mode for general chat. For trip planning, include origin, airport, and dates. On the results page, ask about leave time, parking, TSA, or weather.';
}

export function buildResultsExplanation(
  question: string,
  context: ResultsAssistantContext,
): string {
  const q = question.trim().toLowerCase();
  const { recommendation, tripData } = context;
  const leaveBy = context.leaveByTime || recommendation.leaveByTime || null;
  const topParking = recommendation.parking[0] ?? null;
  const topRideshare = recommendation.rideshare[0] ?? null;
  const destination = tripData.destination || 'your airport';

  if (q.includes('leave') || q.includes('when should i leave') || q.includes('leave by')) {
    if (leaveBy) {
      return `Based on your current ${destination} results, leave by ${formatTimeFriendly(leaveBy)}. This uses the recommendation already shown on this page—no new routing was run.`;
    }

    if (recommendation.airportRouteUnavailable) {
      return recommendation.airportRouteUnavailableReason ||
        'Leave-by timing is unavailable because routing from this origin could not be calculated.';
    }

    return 'Leave-by timing is not available on this results page yet.';
  }

  if (q.includes('parking') || q.includes('park')) {
    if (!topParking) {
      return 'No parking options are loaded on this results page right now.';
    }

    return `Top parking on this page: ${topParking.name}${topParking.price ? ` (about $${topParking.price})` : ''}. Source: ${topParking.sourceName || 'inventory'}. I am only using data already loaded here.`;
  }

  if (q.includes('rideshare') || q.includes('uber') || q.includes('lyft') || q.includes('taxi')) {
    if (!topRideshare) {
      return 'No rideshare options are shown on this results page.';
    }

    return `Top rideshare option here: ${topRideshare.name}${topRideshare.price ? ` (~$${topRideshare.price})` : ''}. This comes from your existing recommendation data only.`;
  }

  if (q.includes('tsa') || q.includes('security') || q.includes('precheck') || q.includes('clear')) {
    const tsa = recommendation.tsaEstimate;
    if (!tsa) {
      return 'TSA timing is not available on this results page.';
    }

    const lane = tsa.selectedLane ? ` (${tsa.selectedLane})` : '';
    return `TSA estimate on this page: about ${tsa.waitTime} minutes${lane}. Status: ${tsa.status}. Source: ${tsa.sourceName}.`;
  }

  if (q.includes('weather') || q.includes('rain') || q.includes('snow')) {
    const weather = recommendation.weatherImpact;
    if (!weather) {
      return 'No weather impact summary is loaded on this results page.';
    }

    return `Weather on this page: ${weather.summary}${typeof weather.temperatureF === 'number' ? ` · ${weather.temperatureF}°F` : ''}.`;
  }

  if (q.includes('best') || q.includes('recommend')) {
    const parts = [
      leaveBy ? `Leave by ${formatTimeFriendly(leaveBy)}` : null,
      topParking ? `Parking: ${topParking.name}` : null,
      topRideshare ? `Rideshare: ${topRideshare.name}` : null,
    ].filter(Boolean);

    if (parts.length === 0) {
      return 'Your results page does not have enough recommendation data loaded yet.';
    }

    return `From the data already on this page: ${parts.join(' · ')}.`;
  }

  return 'I can explain leave time, parking, rideshare, TSA, or weather using the recommendation data already on this page. Try one of those topics.';
}
