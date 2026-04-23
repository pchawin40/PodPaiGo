import { TripData, Recommendation, ParkingOption, RideshareOption, TransitOption, TsaEstimate } from './types';
import { ActiveDataProvider, DataProvider } from './providers';
import {
  calculateTripDuration,
  calculateParkingDuration,
  calculateOfficialParkingCost,
  calculateOffAirportParkingCost,
  calculateRideshareCost,
  calculateTransitCost,
  calculateLeaveByTime,
  isDepartureLeg,
  rankRecommendations
} from './domain';

function buildTripDateTime(tripData: TripData): string {
  if (tripData.type === 'one-way-arrival') {
    return `${tripData.arrivalDate}T${tripData.arrivalTime}`;
  }

  if (tripData.type === 'round-trip') {
    return `${tripData.departureDate}T${tripData.departureTime}`;
  }

  if (tripData.type === 'one-way-departure') {
    return `${tripData.departureDate}T${tripData.departureTime}`;
  }

  return `${tripData.airportTripDate}T${tripData.airportTripTime}`;
}

// Recommendation engine - testable domain logic
export class RecommendationEngine {
  static provider: DataProvider = ActiveDataProvider;

  static setDataProvider(provider: DataProvider) {
    this.provider = provider;
  }

  static async generateRecommendations(tripData: TripData): Promise<Recommendation> {
    const tripDateTime = buildTripDateTime(tripData);
    const route = tripData.type === 'one-way-arrival' ? 'airport-home' : 'home-airport';

    const [parking, rideshare, transit, tsaEstimate, trafficEstimate, flightInfo, locationInfo] = await Promise.all([
      this.provider.getParkingOptions(tripData.destination),
      this.provider.getRideshareOptions(tripData.origin, tripData.destination),
      this.provider.getTransitOptions(tripData.origin, tripData.destination),
      this.provider.getTsaEstimate(tripData.destination),
      this.provider.getTrafficEstimate(tripData.origin, tripData.destination, tripDateTime),
      this.provider.getFlightInfo(tripData.destination, tripDateTime),
      this.provider.getAirportInfo(tripData.destination),
    ]);

    const tripDuration = calculateTripDuration(tripData);
    const parkingDuration = calculateParkingDuration(tripData);
    const availableParking = tripData.type === 'one-way-departure' || tripData.type === 'round-trip'
      ? parking
      : [];

    const parkingWithCosts = availableParking.map(p => ({
      ...p,
      calculatedCost: p.type === 'official'
        ? calculateOfficialParkingCost(p, parkingDuration)
        : calculateOffAirportParkingCost(p, parkingDuration)
    }));

    const rideshareWithCosts = rideshare.map(r => ({
      ...r,
      calculatedCost: calculateRideshareCost(r, tripData)
    }));

    const transitWithCosts = transit.map(t => ({
      ...t,
      calculatedCost: calculateTransitCost(t, tripData)
    }));

    const sortedParking = parkingWithCosts.sort((a, b) => a.calculatedCost - b.calculatedCost);
    const sortedRideshare = rideshareWithCosts.sort((a, b) => a.calculatedCost - b.calculatedCost);
    const sortedTransit = transitWithCosts.sort((a, b) => a.calculatedCost - b.calculatedCost);

    const leaveByTime = isDepartureLeg(tripData)
      ? calculateLeaveByTime(tripData, tsaEstimate, trafficEstimate.duration, 30)
      : null;

    return {
      parking: sortedParking,
      rideshare: sortedRideshare,
      transit: sortedTransit,
      tsaEstimate,
      leaveByTime,
      tripDuration,
      trafficEstimate,
      flightInfo,
      locationInfo,
    };
  }

  static getRankedRecommendations(
    tripData: TripData,
    parking: ParkingOption[],
    rideshare: RideshareOption[],
    transit: TransitOption[],
    tsaEstimate: TsaEstimate
  ) {
    return rankRecommendations(tripData, parking, rideshare, transit, tsaEstimate);
  }

  private static sortByPrice<T extends { price: number }>(options: T[]): T[] {
    return [...options].sort((a, b) => a.price - b.price);
  }
}
