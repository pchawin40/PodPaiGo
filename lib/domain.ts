import { TripData, ParkingOption, RideshareOption, TransitOption, TsaEstimate } from './types';

/**
 * Domain logic for GateWise - pure functions for calculations and recommendations
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
    return calculateTripDuration(tripData);
  }

  if (tripData.type === 'one-way-departure') {
    // Assume a 2-day parking stay for one-way departures in the MVP
    return 2 * 24 * 60;
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

export function calculateTransitCost(transit: TransitOption, tripData: TripData): number {
  if (tripData.type === 'round-trip') {
    return transit.price * 2;
  }
  return transit.price;
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
  option: ParkingOption | RideshareOption | TransitOption;
  score: number;
  cost: number;
  duration: number;
  reasons: string[];
};

export function rankRecommendations(
  tripData: TripData,
  parkingOptions: ParkingOption[],
  rideshareOptions: RideshareOption[],
  transitOptions: TransitOption[],
  tsaEstimate: TsaEstimate
): RankedRecommendation[] {
  const tripDuration = calculateTripDuration(tripData);
  const parkingDuration = calculateParkingDuration(tripData);
  const recommendations: RankedRecommendation[] = [];
  const useParking = tripData.type === 'one-way-departure' || tripData.type === 'round-trip';

  if (useParking) {
    parkingOptions.forEach(parking => {
      const cost = parking.type === 'official'
        ? calculateOfficialParkingCost(parking, parkingDuration)
        : calculateOffAirportParkingCost(parking, parkingDuration);

      let score = 100 - cost;
      score -= parking.distance * 2;
      score += parking.availability;
      score -= tsaEstimate.waitTime * 0.5;

      const reasons = [];
      if (parking.distance < 5) reasons.push('Close to terminal');
      if (parking.availability > 80) reasons.push('High availability');
      if (cost < 50) reasons.push('Budget-friendly');
      if (reasons.length === 0) reasons.push('Available option');

      recommendations.push({
        type: 'parking',
        option: parking,
        score: Math.max(0, score),
        cost,
        duration: parking.distance,
        reasons
      });
    });
  }

  rideshareOptions.forEach(rideshare => {
    const cost = calculateRideshareCost(rideshare, tripData);
    let score = 100 - (cost / 2);
    score -= rideshare.duration;
    score += rideshare.availability;
    score -= tsaEstimate.waitTime * 0.5;

    const reasons = [];
    if (rideshare.duration < 30) reasons.push('Quick ride');
    if (rideshare.availability > 80) reasons.push('High availability');
    if (cost < 100) reasons.push('Reasonable price');
    if (reasons.length === 0) reasons.push('Available option');

    recommendations.push({
      type: 'rideshare',
      option: rideshare,
      score: Math.max(0, score),
      cost,
      duration: rideshare.duration,
      reasons
    });
  });

  transitOptions.forEach(transit => {
    const cost = calculateTransitCost(transit, tripData);
    let score = 100 - (cost * 10);
    score -= transit.duration;
    score += (60 / transit.frequency) * 10;
    score -= tsaEstimate.waitTime * 0.5;

    const reasons = [];
    if (transit.duration < 50) reasons.push('Reasonable travel time');
    if (transit.frequency < 15) reasons.push('Frequent service');
    if (cost < 5) reasons.push('Very affordable');
    if (reasons.length === 0) reasons.push('Available option');

    recommendations.push({
      type: 'transit',
      option: transit,
      score: Math.max(0, score),
      cost,
      duration: transit.duration,
      reasons
    });
  });

  return recommendations.sort((a, b) => b.score - a.score);
}