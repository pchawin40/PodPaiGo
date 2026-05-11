import {
  ParkingOption,
  RideshareOption,
  TransitOption,
  TripData,
} from '../types';
import { WeatherImpact } from '../weather/types';
import {
  calculateOffAirportParkingCost,
  calculateOfficialParkingCost,
  calculateParkingDuration,
  calculateRideshareCost,
  calculateTransitCost,
} from '../domain';
import { isParkingRouteUnavailable } from '../parking/routeStatus';

type OptionKind = 'parking' | 'rideshare' | 'transit';

type IntelligentOption = ParkingOption | RideshareOption | TransitOption;

export type OptionIntelligence = {
  walkingBurdenScore: number;
  walkingBurdenLabel: string;

  stressScore: number;
  stressLabel: string;

  fullLotRiskScore: number;
  fullLotRiskLabel: string;

  rushPenaltyScore: number;
  rushPenaltyLabel: string;

  weatherPenaltyScore: number;
  weatherPenaltyLabel: string;

  shuttleReliabilityScore: number;
  shuttleReliabilityLabel: string;

  trueTotalCost?: number;

  explanationBullets: string[];
};

function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function labelFromScore(score: number, low: string, medium: string, high: string) {
  if (score >= 70) return high;
  if (score >= 35) return medium;
  return low;
}

function getTripDateTime(trip: TripData): string {
  if (trip.type === 'one-way-departure') {
    return `${trip.departureDate}T${trip.departureTime}`;
  }

  if (trip.type === 'round-trip') {
    return `${trip.departureDate}T${trip.departureTime}`;
  }

  if (trip.type === 'one-way-arrival') {
    return `${trip.arrivalDate}T${trip.arrivalTime}`;
  }

  return `${trip.airportTripDate}T${trip.airportTripTime}`;
}

function getTripHour(trip: TripData): number | null {
  const raw = getTripDateTime(trip);
  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) return null;

  return date.getHours();
}

function getTripDay(trip: TripData): number | null {
  const raw = getTripDateTime(trip);
  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) return null;

  return date.getDay();
}

function getParkingTransferMinutes(option: ParkingOption) {
  return (
    option.transferToTerminalMinutes ??
    option.shuttleMinutes ??
    option.walkingMinutes ??
    option.checkpointWalkMinutes ??
    0
  );
}

function getParkingRouteMinutes(option: ParkingOption) {
  if (isParkingRouteUnavailable(option)) return 999;

  return option.distance + (option.parkingBufferMinutes ?? 0) + getParkingTransferMinutes(option);
}

function getOptionRouteTrust(option: IntelligentOption) {
  return option.routeTrustStatus ?? option.trustStatus;
}

function hasCheckedBags(trip: TripData) {
  return trip.type === 'one-way-departure' ? !!trip.checkingBags : false;
}

function isDepartureOrRoundTrip(trip: TripData) {
  return trip.type === 'one-way-departure' || trip.type === 'round-trip';
}

function isWeekendOrFriday(trip: TripData) {
  const day = getTripDay(trip);
  return day === 5 || day === 6 || day === 0;
}

function isParking(option: IntelligentOption): option is ParkingOption {
  return 'distance' in option && 'transferType' in option;
}

function isRideshare(option: IntelligentOption): option is RideshareOption {
  return 'duration' in option && !('frequency' in option);
}

function isTransit(option: IntelligentOption): option is TransitOption {
  return 'frequency' in option;
}

function dynamicWeatherSeverity(weatherImpact?: WeatherImpact | null) {
  if (!weatherImpact) return 0;

  let score = 0;

  if (weatherImpact.riskLevel === 'medium') score += 30;
  if (weatherImpact.riskLevel === 'high') score += 60;

  if (weatherImpact.condition === 'rain') score += 10;
  if (weatherImpact.condition === 'snow') score += 30;
  if (weatherImpact.condition === 'storm') score += 35;
  if (weatherImpact.condition === 'wind') score += 10;

  if ((weatherImpact.precipitationChance ?? 0) >= 50) score += 10;
  if ((weatherImpact.precipitationChance ?? 0) >= 80) score += 10;

  if ((weatherImpact.windMph ?? 0) >= 25) score += 10;
  if ((weatherImpact.windMph ?? 0) >= 35) score += 15;

  return clampScore(score);
}

function calculateWalkingBurden(
  kind: OptionKind,
  option: IntelligentOption,
  trip: TripData,
  weatherImpact?: WeatherImpact | null
) {
  let score = 0;
  const weatherSeverity = dynamicWeatherSeverity(weatherImpact);

  if (kind === 'parking' && isParking(option)) {
    const transferMinutes = getParkingTransferMinutes(option);

    score += transferMinutes * 5;

    if (option.transferType === 'shuttle') {
      score += 15;
      score += (option.shuttleWaitMinutes ?? 0) * 2;
    }

    if (option.transferType === 'airport-garage') {
      score -= 6;
    }

    if (option.covered) {
      score -= 8;
    }

    if (!option.covered && option.type === 'off-airport') {
      score += 8;
    }

    if (option.checkpointWalkMinutes) {
      score += option.checkpointWalkMinutes * 2;
    }

    if (weatherSeverity >= 50 && !option.covered) {
      score += 14;
    }

    if (weatherSeverity >= 50 && option.transferType === 'shuttle') {
      score += 8;
    }
  }

  if (kind === 'rideshare') {
    score += 6;

    if (weatherSeverity >= 50) {
      score += 4;
    }
  }

  if (kind === 'transit') {
    score += 26;

    if (weatherSeverity >= 50) {
      score += 16;
    }

    if (weatherSeverity >= 75) {
      score += 10;
    }
  }

  if (hasCheckedBags(trip)) score += 12;

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    label: labelFromScore(
      finalScore,
      'Easy luggage effort',
      'Moderate luggage effort',
      'Heavy luggage effort'
    ),
  };
}

function calculateRushPenalty(
  kind: OptionKind,
  option: IntelligentOption,
  trip: TripData
) {
  const hour = getTripHour(trip);

  if (hour === null) {
    return {
      score: 0,
      label: 'No rush-hour adjustment',
    };
  }

  let score = 0;

  const isMorningRush = hour >= 5 && hour <= 8;
  const isEveningRush = hour >= 15 && hour <= 18;
  const isAirportMorningPeak = hour >= 4 && hour <= 7;

  if (isMorningRush) {
    score += 18;

    if (kind === 'rideshare') score += 12;
    if (kind === 'transit') score += 8;

    if (kind === 'parking' && isParking(option)) {
      if (option.transferType === 'shuttle') score += 10;
      if (option.type === 'official') score += 5;
    }
  }

  if (isAirportMorningPeak && isDepartureOrRoundTrip(trip)) {
    score += 12;
  }

  if (isEveningRush) {
    score += 12;

    if (kind === 'rideshare') score += 12;
    if (kind === 'transit') score += 8;
  }

  if (isWeekendOrFriday(trip) && isDepartureOrRoundTrip(trip)) {
    score += 6;
  }

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    label: labelFromScore(
      finalScore,
      'No major rush penalty',
      'Some rush-hour risk',
      'High rush-hour risk'
    ),
  };
}

function calculateWeatherPenalty(
  kind: OptionKind,
  option: IntelligentOption,
  weatherImpact?: WeatherImpact | null
) {
  const severity = dynamicWeatherSeverity(weatherImpact);

  if (!weatherImpact || severity <= 10) {
    return {
      score: 0,
      label: 'No major weather penalty',
    };
  }

  let score = severity * 0.35;

  if (kind === 'parking' && isParking(option)) {
    const transferMinutes = getParkingTransferMinutes(option);

    if (option.covered) score -= 12;
    if (option.type === 'official') score -= 6;
    if (!option.covered && option.type === 'off-airport') score += 16;
    if (option.transferType === 'shuttle') score += 10;
    if (transferMinutes >= 10) score += 8;
  }

  if (kind === 'transit') {
    score += 14;
  }

  if (kind === 'rideshare') {
    score += 4;
  }

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    label: labelFromScore(
      finalScore,
      'Weather-friendly',
      'Some weather exposure',
      'Weather-sensitive option'
    ),
  };
}

function calculateFullLotRisk(
  kind: OptionKind,
  option: IntelligentOption,
  trip: TripData
) {
  if (kind !== 'parking' || !isParking(option)) {
    return {
      score: 0,
      label: 'Not applicable',
    };
  }

  let score = 0;

  const hour = getTripHour(trip);
  const parkingDuration = calculateParkingDuration(trip);

  if (option.availabilityStatus === 'unavailable' || option.isAvailable === false) {
    score += 95;
  }

  if (option.availabilityStatus === 'unknown') {
    score += 26;
  }

  if (typeof option.availability === 'number') {
    if (option.availability < 30) score += 40;
    else if (option.availability < 60) score += 22;
    else if (option.availability < 80) score += 10;
  }

  if (typeof option.availabilityScore === 'number') {
    if (option.availabilityScore < 40) score += 28;
    else if (option.availabilityScore < 70) score += 14;
  }

  if (hour !== null && hour >= 5 && hour <= 9) score += 18;
  if (hour !== null && hour >= 15 && hour <= 18) score += 8;

  if (isWeekendOrFriday(trip)) score += 8;

  if (parkingDuration >= 3 * 24 * 60) score += 8;
  if (parkingDuration >= 7 * 24 * 60) score += 12;

  if (option.type === 'official') score += 8;

  if (option.priceDisplay === 'check-live') score += 8;
  if (option.priceDisplay === 'unavailable') score += 16;
  if (option.priceConfidence === 'low') score += 10;

  if (option.priceConfidence === 'high') score -= 6;
  if (option.availabilityStatus === 'available') score -= 12;
  if (option.isAvailable === true) score -= 8;

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    label: labelFromScore(
      finalScore,
      'Low availability risk',
      'Moderate availability risk',
      'High availability risk'
    ),
  };
}

function calculateShuttleReliability(kind: OptionKind, option: IntelligentOption) {
  if (kind !== 'parking' || !isParking(option) || option.transferType !== 'shuttle') {
    return {
      score: 100,
      label: 'No shuttle needed',
    };
  }

  const name = `${option.name} ${option.sourceName} ${option.bookingProvider ?? ''}`.toLowerCase();

  let score = 72;

  if (name.includes('masterpark')) score += 16;
  if (name.includes('wallypark')) score += 12;
  if (name.includes('jiffy')) score += 8;
  if (name.includes('extra car')) score += 6;

  if (option.shuttleMinutes && option.shuttleMinutes <= 10) score += 8;
  if (option.shuttleMinutes && option.shuttleMinutes >= 18) score -= 12;

  if (option.shuttleWaitMinutes && option.shuttleWaitMinutes <= 8) score += 8;
  if (option.shuttleWaitMinutes && option.shuttleWaitMinutes >= 15) score -= 12;

  if (option.reviewScore) {
    if (option.reviewScore >= 4.6) score += 8;
    else if (option.reviewScore >= 4.3) score += 4;
    else if (option.reviewScore < 4.0) score -= 10;
  }

  if (option.reviewCount) {
    if (option.reviewCount >= 1000) score += 8;
    else if (option.reviewCount >= 300) score += 5;
    else if (option.reviewCount < 50) score -= 6;
  }

  if (option.routeTrustStatus === 'live') score += 4;
  if (option.trustStatus === 'fallback') score -= 8;

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    label:
      finalScore >= 88
        ? 'Strong shuttle confidence'
        : finalScore >= 75
          ? 'Typical shuttle confidence'
          : 'Unknown shuttle confidence',
  };
}

function calculateTrueTotalCost(
  kind: OptionKind,
  option: IntelligentOption,
  trip: TripData
) {
  if (kind === 'parking' && isParking(option)) {
    if (isParkingRouteUnavailable(option)) return undefined;

    if (!isDepartureOrRoundTrip(trip)) return undefined;

    const parkingDuration = calculateParkingDuration(trip);
    const parkingCost =
      option.type === 'official'
        ? calculateOfficialParkingCost(option, parkingDuration)
        : calculateOffAirportParkingCost(option, parkingDuration);

    const estimatedFuelCost = Math.max(4, Math.min(25, Math.round(option.distance * 0.35)));

    return Math.round((parkingCost + estimatedFuelCost) * 100) / 100;
  }

  if (kind === 'rideshare' && isRideshare(option)) {
    const rideshareCost = calculateRideshareCost(option, trip);
    const estimatedTip = Math.round(rideshareCost * 0.12);

    return Math.round((rideshareCost + estimatedTip) * 100) / 100;
  }

  if (kind === 'transit' && isTransit(option)) {
    return calculateTransitCost(option, trip);
  }

  return undefined;
}

function calculateTrustRisk(option: IntelligentOption) {
  const routeTrust = getOptionRouteTrust(option);

  if (routeTrust === 'live') return 0;
  if (routeTrust === 'verified-source') return 5;
  if (routeTrust === 'estimated') return 12;
  if (routeTrust === 'fallback') return 20;

  return 12;
}

function calculateDurationPressure(
  kind: OptionKind,
  option: IntelligentOption
) {
  const duration =
    kind === 'parking' && isParking(option)
      ? getParkingRouteMinutes(option)
      : getDurationSafe(option);

  if (duration <= 30) return 0;
  if (duration <= 60) return 8;
  if (duration <= 90) return 16;
  if (duration <= 120) return 26;

  return 40;
}

function getDurationSafe(option: IntelligentOption) {
  if ('duration' in option) return option.duration;
  if ('distance' in option) return option.distance;
  return 0;
}

function calculateStressScore(parts: {
  walkingBurdenScore: number;
  rushPenaltyScore: number;
  weatherPenaltyScore: number;
  fullLotRiskScore: number;
  shuttleReliabilityScore: number;
  trustRiskScore: number;
  durationPressureScore: number;
}) {
  const score =
    parts.walkingBurdenScore * 0.26 +
    parts.rushPenaltyScore * 0.16 +
    parts.weatherPenaltyScore * 0.16 +
    parts.fullLotRiskScore * 0.2 +
    (100 - parts.shuttleReliabilityScore) * 0.1 +
    parts.trustRiskScore * 0.06 +
    parts.durationPressureScore * 0.06;

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    label: labelFromScore(
      finalScore,
      'Low trip stress',
      'Moderate trip stress',
      'High trip stress'
    ),
  };
}

export function buildOptionIntelligence(
  kind: OptionKind,
  option: IntelligentOption,
  trip: TripData,
  weatherImpact?: WeatherImpact | null
): OptionIntelligence {
  const walkingBurden = calculateWalkingBurden(kind, option, trip, weatherImpact);
  const rushPenalty = calculateRushPenalty(kind, option, trip);
  const weatherPenalty = calculateWeatherPenalty(kind, option, weatherImpact);
  const fullLotRisk = calculateFullLotRisk(kind, option, trip);
  const shuttleReliability = calculateShuttleReliability(kind, option);
  const trueTotalCost = calculateTrueTotalCost(kind, option, trip);
  const trustRiskScore = calculateTrustRisk(option);
  const durationPressureScore = calculateDurationPressure(kind, option);

  const stress = calculateStressScore({
    walkingBurdenScore: walkingBurden.score,
    rushPenaltyScore: rushPenalty.score,
    weatherPenaltyScore: weatherPenalty.score,
    fullLotRiskScore: fullLotRisk.score,
    shuttleReliabilityScore: shuttleReliability.score,
    trustRiskScore,
    durationPressureScore,
  });

  const explanationBullets = [
    stress.label,
    walkingBurden.label,
    fullLotRisk.label !== 'Not applicable' ? fullLotRisk.label : null,
    rushPenalty.score > 0 ? rushPenalty.label : null,
    weatherPenalty.score > 0 ? `${weatherPenalty.label}: ${weatherImpact?.summary ?? ''}`.trim() : null,
    shuttleReliability.label !== 'No shuttle needed' ? shuttleReliability.label : null,
    trueTotalCost !== undefined ? `True trip cost estimate: $${trueTotalCost}` : null,
  ].filter(Boolean) as string[];

  return {
    walkingBurdenScore: walkingBurden.score,
    walkingBurdenLabel: walkingBurden.label,

    stressScore: stress.score,
    stressLabel: stress.label,

    fullLotRiskScore: fullLotRisk.score,
    fullLotRiskLabel: fullLotRisk.label,

    rushPenaltyScore: rushPenalty.score,
    rushPenaltyLabel: rushPenalty.label,

    weatherPenaltyScore: weatherPenalty.score,
    weatherPenaltyLabel: weatherPenalty.label,

    shuttleReliabilityScore: shuttleReliability.score,
    shuttleReliabilityLabel: shuttleReliability.label,

    trueTotalCost,

    explanationBullets,
  };
}
