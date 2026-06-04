import type { Recommendation, TripData } from '../types';
import { formatTimeFriendly } from '../tripTime';
import { isAiAssistantDisabled } from './tripParseConfig';

export type AssistantPage = 'home' | 'trip' | 'results';

export type ResultsAssistantContext = {
  tripData: TripData;
  recommendation: Recommendation;
  leaveByTime?: string | null;
};

export type PodPaiGoAssistantContext = {
  trip: {
    origin: string;
    destination: string;
    type: string;
    destinationKind: string | null;
    airportCode: string | null;
  };
  timing: {
    leaveByTime: string | null;
  };
  parking: {
    status: Recommendation['parkingDataStatus'];
    message: string | null;
    topOptions: Array<{
      name: string;
      price: number | null;
      sourceName: string | null;
      trustStatus: string | null;
      providerSource: string | null;
      warnings: string[];
    }>;
    freeOptions: Array<{
      name: string;
      sourceName: string | null;
      trustStatus: string | null;
      rules: string | null;
      warnings: string[];
    }>;
  };
  route: {
    airportRouteUnavailable: boolean;
    airportRouteUnavailableReason: string | null;
  };
  tsa: {
    waitTime: number | null;
    status: string | null;
    sourceName: string | null;
  };
  weather: {
    summary: string | null;
  };
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
    return 'Hi! I’m PodPaiGo. I compare route timing, parking, cost, confidence, and practical tradeoffs. Try describing a trip like “Weekend from Monroe to SEA Nov 15-18”.';
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

    return 'I’m PodPaiGo. For trip planning, include origin, destination, and dates. On the results page, ask about leave time, parking, free parking, TSA, weather, or what to avoid.';
}

function optionPriceLabel(price: number | null): string {
  if (price == null || !Number.isFinite(price)) return 'price unknown';
  if (price <= 0) return 'Free';
  return `about $${Math.round(price)}`;
}

function optionWarnings(option: Recommendation['parking'][number]): string[] {
  return [
    ...(Array.isArray(option.assumptions) ? option.assumptions.slice(0, 2) : []),
    option.validationNotes || null,
    option.accessNotes || null,
  ].filter((value): value is string => Boolean(value));
}

function isFreeParkingOption(option: Recommendation['parking'][number]): boolean {
  return (
    option.price === 0 ||
    option.providerSource === 'community-free' ||
    option.sourceName === 'PodPaiGo verified free parking' ||
    option.validationStatus === 'free'
  );
}

export function buildPodPaiGoAssistantContext(
  context: ResultsAssistantContext,
): PodPaiGoAssistantContext {
  const { recommendation, tripData } = context;
  const parking = recommendation.parking ?? [];
  const freeParking = parking.filter(isFreeParkingOption);

  return {
    trip: {
      origin: tripData.origin || '',
      destination: tripData.destination || '',
      type: tripData.type || '',
      destinationKind: tripData.destinationKind ?? null,
      airportCode: tripData.airportCode ?? null,
    },
    timing: {
      leaveByTime: context.leaveByTime || recommendation.leaveByTime || null,
    },
    parking: {
      status: recommendation.parkingDataStatus,
      message: recommendation.parkingDataMessage ?? null,
      topOptions: parking.slice(0, 3).map((option) => ({
        name: option.name,
        price: typeof option.price === 'number' ? option.price : null,
        sourceName: option.sourceName ?? null,
        trustStatus: option.trustStatus ?? null,
        providerSource: option.providerSource ?? null,
        warnings: optionWarnings(option),
      })),
      freeOptions: freeParking.slice(0, 3).map((option) => ({
        name: option.name,
        sourceName: option.sourceName ?? null,
        trustStatus: option.trustStatus ?? null,
        rules: option.validationNotes || option.freeParkingNotes || null,
        warnings: optionWarnings(option),
      })),
    },
    route: {
      airportRouteUnavailable: Boolean(recommendation.airportRouteUnavailable),
      airportRouteUnavailableReason: recommendation.airportRouteUnavailableReason ?? null,
    },
    tsa: {
      waitTime: recommendation.tsaEstimate?.waitTime ?? null,
      status: recommendation.tsaEstimate?.status ?? null,
      sourceName: recommendation.tsaEstimate?.sourceName ?? null,
    },
    weather: {
      summary: recommendation.weatherImpact?.summary ?? null,
    },
  };
}

export function buildResultsExplanation(
  question: string,
  context: ResultsAssistantContext,
): string {
  const q = question.trim().toLowerCase();
  const { recommendation, tripData } = context;
  const assistantContext = buildPodPaiGoAssistantContext(context);
  const leaveBy = assistantContext.timing.leaveByTime;
  const topParking = recommendation.parking[0] ?? null;
  const topRideshare = recommendation.rideshare[0] ?? null;
  const destination = tripData.destination || 'your destination';

  if (q.includes('free parking') || q.includes('park for free') || q === 'free parking?') {
    const freeOption = assistantContext.parking.freeOptions[0] ?? null;
    if (!freeOption) {
      if (assistantContext.parking.status === 'unavailable') {
        return 'I’m PodPaiGo. Parking data is unavailable right now, so I cannot confirm verified free parking from these results. Try refresh or check posted signs before leaving your car.';
      }

      return 'I’m PodPaiGo. I do not see verified free parking in these results yet. Check signs carefully, do not assume customer-only lots are legal for unattended parking, and signed-in users can submit a free spot for PodPaiGo verification.';
    }

    const rules = freeOption.rules ? ` Rules: ${freeOption.rules}.` : '';
    return `I’m PodPaiGo. Verified free parking in these results: ${freeOption.name}. Source: ${freeOption.sourceName || 'community verified'}; confidence: ${freeOption.trustStatus || 'verified'}.${rules} Check signs before leaving your car and do not assume overnight parking unless it is explicitly verified.`;
  }

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
    if (assistantContext.parking.status === 'unavailable') {
      return assistantContext.parking.message ||
        'Parking data unavailable right now. Try again or open directions.';
    }

    if (!topParking) {
      return assistantContext.parking.status === 'empty'
        ? 'No parking found near this destination yet.'
        : 'No parking options are loaded on this results page right now.';
    }

    return `I’m PodPaiGo. Top parking on this page: ${topParking.name} (${optionPriceLabel(typeof topParking.price === 'number' ? topParking.price : null)}). Source: ${topParking.sourceName || 'inventory'}; confidence: ${topParking.trustStatus || topParking.priceConfidence || 'estimated'}. I am only using data already loaded here, not live availability.`;
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

    return `I’m PodPaiGo. From the data already on this page: ${parts.join(' · ')}. I compare timing, cost, confidence, and practical friction; I do not assume live availability unless the source says it is live.`;
  }

  if (q.includes('avoid') || q.includes('safe') || q.includes('legal')) {
    const warnings = assistantContext.parking.topOptions.flatMap((option) => option.warnings).slice(0, 3);
    if (warnings.length > 0) {
      return `I’m PodPaiGo. Main cautions from these results: ${warnings.join(' ')} Confirm posted signs, validation rules, and overnight permission before leaving your car.`;
    }

    return 'I’m PodPaiGo. Avoid assuming free/customer-only lots are legal for unattended parking. Confirm signs, tow rules, validation requirements, and overnight permission before leaving your car.';
  }

  return 'I’m PodPaiGo. I can explain leave time, parking, free parking, rideshare, TSA, weather, cheapest option, easiest option, and what to avoid using the recommendation data already on this page.';
}
