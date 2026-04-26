import { TripData, ParkingOption, RideshareOption, TransitOption, TransitJourney, TsaEstimate, TrustStatus } from './types';


/**
 * Domain logic for PodPaiGo - pure functions for calculations and recommendations
 */

// Time utilities
export function parseTime(timeString: string): Date {
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

export function formatDurationLong(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);

  return parts.join(' ');
}

function getTrustPenalty(trustStatus: TrustStatus): number {
  switch (trustStatus) {
    case 'verified-source':
      return 0;
    case 'live':
      return 5;
    case 'estimated':
      return 12;
    case 'fallback':
      return 18;
    default:
      return 10;
  }
}

function getDirectnessBoost(option: ParkingOption | RideshareOption | TransitOption | TransitJourney, type: 'parking' | 'rideshare' | 'transit'): number {
  if (type === 'parking') {
    const parkingOption = option as ParkingOption;
    const totalMinutes = getParkingTotalMinutes(parkingOption);
    return totalMinutes <= 10 ? 18 : totalMinutes <= 20 ? 10 : 4;
  }

  if (type === 'rideshare') {
    return 18;
  }

  const transitJourney = option as TransitOption | TransitJourney;
  const transfers = 'transfers' in transitJourney && typeof transitJourney.transfers === 'number' ? transitJourney.transfers : 0;
  const transferPenalty = Math.max(0, transfers - 1) * 8;
  const segmentBoost = 'segments' in transitJourney && Array.isArray(transitJourney.segments)
    ? Math.max(0, 20 - transitJourney.segments.length * 3)
    : 10;
  const journeyDuration = 'totalDuration' in transitJourney
    ? transitJourney.totalDuration
    : transitJourney.duration;
  const timeBoost = journeyDuration <= 60 ? 15 : journeyDuration <= 90 ? 10 : 5;

  return Math.max(5, 25 - transferPenalty + segmentBoost + timeBoost);
}

function getTransitWaitPenalty(transit: TransitOption): number {
  return transit.frequency / 2;
}

function getTransitJourneyWaitPenalty(transit: TransitOption | TransitJourney): number {
  const transitSegments = 'segments' in transit && transit.segments
    ? transit.segments.filter(s => s.mode !== 'drive' && s.mode !== 'walk')
    : [];

  const avgFrequency = transitSegments.length > 0
    ? transitSegments.reduce((sum, seg) => sum + (seg.frequency || 15), 0) / transitSegments.length
    : transit.frequency || 15;

  const baseWait = avgFrequency / 2;
  const transferPenalty = 'transfers' in transit && typeof transit.transfers === 'number' ? transit.transfers * 5 : 5;
  return baseWait + transferPenalty;
}

function getShuttleWaitPenalty(parking: ParkingOption): number {
  return parking.type === 'off-airport' ? 12 : 4;
}

function getParkingTotalMinutes(parking: ParkingOption): number {
  const driveMinutes = parking.distance || 0;
  const parkingBufferMinutes = parking.parkingBufferMinutes ?? 0;
  const transferToTerminalMinutes = parking.transferToTerminalMinutes ?? 0;
  return driveMinutes + parkingBufferMinutes + transferToTerminalMinutes;
}

function getStressScore(
  type: 'parking' | 'rideshare' | 'transit',
  option: ParkingOption | RideshareOption | TransitOption | TransitJourney,
  cost: number
): number {
  const trustPenalty = getTrustPenalty(option.trustStatus);
  const directnessBoost = getDirectnessBoost(option, type);
  const availability = option.availability || 0;
  const duration = type === 'parking'
    ? getParkingTotalMinutes(option as ParkingOption)
    : type === 'rideshare'
      ? (option as RideshareOption).duration
      : (option as TransitJourney).totalDuration;
  const waitPenalty = type === 'parking'
    ? getShuttleWaitPenalty(option as ParkingOption)
    : type === 'transit'
      ? getTransitJourneyWaitPenalty(option as TransitJourney)
      : 5;

  return (
    100 +
    directnessBoost +
    availability * 0.25 -
    duration * 1.1 -
    trustPenalty -
    waitPenalty -
    cost * 0.35
  );
}

// Trip duration calculation
export function calculateTripDuration(tripData: TripData): number {
  if (tripData.type !== 'round-trip') {
    return 0;
  }

  const departureDateTime = new Date(`${tripData.departureDate}T${tripData.departureTime}`);
  const returnDateTime = new Date(`${tripData.returnDate}T${tripData.returnTime}`);
  const durationMs = returnDateTime.getTime() - departureDateTime.getTime();
  return Math.max(0, Math.ceil(durationMs / (1000 * 60)));
}

export function calculateParkingDuration(tripData: TripData): number {
  if (tripData.type === 'round-trip') {
    return tripData.parkingDuration ?? calculateTripDuration(tripData);
  }

  if (tripData.type === 'one-way-departure') {
    // Use user-provided duration if available, otherwise MVP default: short-stay parking
    return tripData.parkingDuration ?? (1 * 24 * 60);
  }

  return 0;
}

export function isDepartureLeg(tripData: TripData): boolean {
  return tripData.type === 'one-way-departure' || tripData.type === 'round-trip' || tripData.type === 'dropoff-pickup';
}

// Parking cost calculations
export function calculateOfficialParkingCost(
  parking: ParkingOption,
  tripDuration: number
): number {
  if (parking.type !== 'official') return 0;

  // Daily rate for official parking
  const days = Math.ceil(tripDuration / (24 * 60));
  return parking.price * days;
}

export function calculateOffAirportParkingCost(
  parking: ParkingOption,
  tripDuration: number
): number {
  if (parking.type !== 'off-airport') return 0;

  // Daily rate for off-airport parking
  const days = Math.ceil(tripDuration / (24 * 60));
  return parking.price * days;
}

export function calculateRideshareCost(rideshare: RideshareOption, tripData: TripData): number {
  if (tripData.type === 'round-trip') {
    return rideshare.price * 2;
  }
  return rideshare.price;
}

export function calculateTransitCost(transit: TransitOption | TransitJourney, tripData: TripData): number {
  if ('totalCost' in transit) {
    // It's a TransitJourney
    return tripData.type === 'round-trip' ? transit.totalCost * 2 : transit.totalCost;
  } else {
    // It's a TransitOption (legacy)
    return tripData.type === 'round-trip' ? transit.price * 2 : transit.price;
  }
}

export function calculateLeaveByTime(
  tripData: TripData,
  tsaEstimate: TsaEstimate,
  transportDuration: number,
  bufferMinutes: number = 30
): string | null {
  if (!isDepartureLeg(tripData)) {
    return null;
  }

  let scheduledTime = '';

  if (tripData.type === 'dropoff-pickup') {
    scheduledTime = tripData.airportTripTime;
  } else if (tripData.type === 'one-way-departure' || tripData.type === 'round-trip') {
    scheduledTime = tripData.departureTime;
  } else {
    return null;
  }

  const flightTime = parseTime(scheduledTime);

  const totalPrepTime = tsaEstimate.waitTime + transportDuration + bufferMinutes;
  const leaveTime = addMinutes(flightTime, -totalPrepTime);
  return formatTime(leaveTime);
}

// Recommendation ranking
export type RankedRecommendation = {
  type: 'parking' | 'rideshare' | 'transit';
  option: ParkingOption | RideshareOption | TransitOption | TransitJourney;
  score: number;
  stressScore: number;
  cost: number;
  duration: number;
  reasons: string[];
};

export function rankRecommendations(
  tripData: TripData,
  parkingOptions: ParkingOption[],
  rideshareOptions: RideshareOption[],
  transitJourneys: Array<TransitOption | TransitJourney>,
  tsaEstimate: TsaEstimate
): RankedRecommendation[] {
  const parkingDuration = calculateParkingDuration(tripData);
  const recommendations: RankedRecommendation[] = [];
  const useParking = tripData.type === 'one-way-departure' || tripData.type === 'round-trip';

  const transportPreference =
    (tripData as any).transportAvailability || 'all';

  // Mode preference adjustment function
  const modePreferenceAdjustment = (
    type: 'parking' | 'rideshare' | 'transit'
  ): number => {
    if (transportPreference === 'car') {
      if (type === 'parking') return 45;
      if (type === 'rideshare') return 8;
      if (type === 'transit') return -40;
    }

    if (transportPreference === 'rideshare') {
      if (type === 'rideshare') return 35;
      if (type === 'parking') return -15;
      if (type === 'transit') return -10;
    }

    if (transportPreference === 'transit') {
      if (type === 'transit') return 40;
      if (type === 'parking') return -35;
      if (type === 'rideshare') return -10;
    }

    return 0;
  };

  if (useParking) {
    const parkingWaitPenalty = tsaEstimate.waitTime * 0.5;
    parkingOptions.forEach(parking => {
      const cost = parking.type === 'official'
        ? calculateOfficialParkingCost(parking, parkingDuration)
        : calculateOffAirportParkingCost(parking, parkingDuration);

      const totalDuration = getParkingTotalMinutes(parking);

      let score = 100 - (cost * 0.45);
      score -= totalDuration * 2;
      score += parking.availability;
      score -= parkingWaitPenalty;

      score += modePreferenceAdjustment('parking');

      // Scoring adjustments based on parking attributes
      if (parking.price <= 20) score += 18;
      if (parking.price <= 30) score += 8;

      // Trust + convenience
      if (parking.type === 'official') score += 28;
      if (parking.covered) score += 8;

      // Reviews
      if ((parking.reviewCount ?? 0) > 300) score += 10;
      if ((parking.reviewScore ?? 0) >= 4.4) score += 10;

      // Known brand boost
      const lowerParkingName = parking.name.toLowerCase();
      if (lowerParkingName.includes('wally')) score += 14;
      if (lowerParkingName.includes('master')) score += 12;
      if (lowerParkingName.includes('jiffy')) score += 8;

      // Cheap unknown lot guardrail
      if (
        parking.price <= 15 &&
        !parking.reviewScore &&
        parking.type !== 'official'
      ) {
        score -= 12;
      }

      // Shuttle friction
      if ((parking.shuttleMinutes ?? 0) > 15) score -= 10;

      // Confidence and source bonuses/penalties
      if (parking.priceConfidence === 'high') score += 18;
      if (parking.priceConfidence === 'medium') score += 8;
      if (parking.priceConfidence === 'low') score -= 8;

      // Source bonuses
      if (parking.priceSource === 'official-rate') score += 14;
      if (parking.bookingProvider === 'AirportParkingReservations') score += 6;

      // Penalties for less desirable parking attributes
      if (
        parking.bookingProvider === 'AirportParkingReservations' &&
        !parking.reviewScore &&
        !parking.covered
      ) {
        score -= 10;
      }

      const reasons = [];
      if ((parking.transferType ?? (parking.type === 'off-airport' ? 'shuttle' : 'walk')) !== 'shuttle') {
        reasons.push('Direct terminal access');
      }
      if (parking.type === 'off-airport') reasons.push('Shuttle transfer included');
      if (tripData.type === 'one-way-departure') {
        const parkingHours = parkingDuration / 60;
        reasons.push(`Parking duration: ${parkingHours} hour${parkingHours !== 1 ? 's' : ''}`);
      }
      if (tripData.type === 'round-trip') {
        const parkingHours = parkingDuration / 60;
        reasons.push(`Parking duration: ${parkingHours} hour${parkingHours !== 1 ? 's' : ''}`);
      }
      if (parking.availability > 80) reasons.push('High availability');
      if (parking.trustStatus === 'verified-source') reasons.push('Verified source');
      if (parking.bookingProvider === 'AirportParkingReservations') reasons.push('Listed APR rate');
      if (parking.priceConfidence === 'high') reasons.push('High price confidence');
      if (parking.priceConfidence === 'medium') reasons.push('Medium price confidence');
      if (cost < 50) reasons.push('Budget-friendly');

      if (parking.covered) reasons.push('Covered parking');
      if (parking.reviewScore && parking.reviewScore >= 4.4) reasons.push('Strong reviews');
      if (parking.availabilityScore && parking.availabilityScore >= 80) reasons.push('High parking availability');
      if (parking.shuttleMinutes && parking.shuttleMinutes <= 12) reasons.push(`${parking.shuttleMinutes} min shuttle`);
      if (parking.walkingMinutes && parking.walkingMinutes <= 5) reasons.push(`${parking.walkingMinutes} min walk`);
      if (parking.bestFor?.length) reasons.push(parking.bestFor[0]);

      if (reasons.length === 0) reasons.push('Available option');

      const stressScore = getStressScore('parking', parking, cost);
      recommendations.push({
        type: 'parking',
        option: parking,
        score: Math.max(0, score),
        stressScore,
        cost,
        duration: totalDuration,
        reasons
      });
    });
  }

  const arrivalWaitPenalty = tripData.type === 'one-way-arrival' ? 0 : tsaEstimate.waitTime * 0.5;
  rideshareOptions.forEach(rideshare => {
    const cost = calculateRideshareCost(rideshare, tripData);
    let score = 100 - (cost / 2);
    score -= rideshare.duration;
    score += rideshare.availability;
    score -= arrivalWaitPenalty;

    score += modePreferenceAdjustment('rideshare');

    const reasons = [];
    if (rideshare.duration < 30) reasons.push('Quick ride');
    if (rideshare.availability > 80) reasons.push('High availability');
    if (rideshare.trustStatus === 'live') reasons.push('Live availability');
    if (rideshare.trustStatus === 'verified-source') reasons.push('Verified source');
    if (cost < 100) reasons.push('Reasonable price');
    if (reasons.length === 0) reasons.push('Available option');

    const stressScore = getStressScore('rideshare', rideshare, cost);
    recommendations.push({
      type: 'rideshare',
      option: rideshare,
      score: Math.max(0, score),
      stressScore,
      cost,
      duration: rideshare.duration,
      reasons
    });
  });

  const transitWaitPenalty = tripData.type === 'one-way-arrival' ? 0 : tsaEstimate.waitTime * 0.5;
  transitJourneys.forEach(transit => {
    const cost = calculateTransitCost(transit, tripData);
    const totalDuration = 'totalDuration' in transit ? transit.totalDuration : transit.duration;
    const transfers = 'transfers' in transit ? transit.transfers : 0;
    const hasLightRail = 'segments' in transit && Array.isArray(transit.segments)
      ? transit.segments.some(s => s.mode === 'light-rail')
      : false;

    // Base score calculation
    let score = 100 - (cost * 10);
    score -= totalDuration;
    score += transit.availability ?? 0;
    score -= transitWaitPenalty;

    score += modePreferenceAdjustment('transit');

    if (totalDuration >= 90) score -= 20;
    if (totalDuration >= 110) score -= 20;

    const isUnrealistic = totalDuration > 120 || transit.trustStatus === 'fallback';
    if (isUnrealistic) {
      score -= 40;
    }

    // Penalize unrealistic journeys (over 3 hours total)
    if (totalDuration > 180) {
      score -= 100;
    }

    // Penalize too many transfers
    if (transfers > 2) {
      score -= 30;
    }

    const reasons = [];
    if (isUnrealistic) reasons.push('Long door-to-door transit route');
    if (totalDuration < 60) reasons.push('Quick total journey');
    if (transfers === 0) reasons.push('Direct transit');
    if (transfers === 1) reasons.push('One transfer');
    if (transfers <= 2) reasons.push('Manageable transfers');
    if (hasLightRail) reasons.push('Includes light rail');
    if (transit.trustStatus === 'verified-source') reasons.push('Verified source');
    if (cost < 10) reasons.push('Affordable total cost');

    // Add segment breakdown to reasons
    const driveSegments = 'segments' in transit && Array.isArray(transit.segments)
      ? transit.segments.filter(s => s.mode === 'drive')
      : [];
    if (driveSegments.length > 0) {
      const totalDriveTime = driveSegments.reduce((sum, s) => sum + s.duration, 0);
      reasons.push(`Drive ${totalDriveTime} min to transit`);
    }

    if (reasons.length === 0) reasons.push('Transit option available');

    const stressScore = getStressScore('transit', transit, cost);
    const transitDuration = 'totalDuration' in transit ? transit.totalDuration : transit.duration;
    recommendations.push({
      type: 'transit',
      option: transit,
      score: Math.max(0, score),
      stressScore,
      cost,
      duration: transitDuration,
      reasons
    });
  });

  return recommendations.sort((a, b) => b.score - a.score);
}