import { TransportAvailability, TripData, Recommendation, ParkingOption, RideshareOption, TransitOption, TransitJourney, TsaEstimate } from './types';
import { ActiveDataProvider, DataProvider } from './providers';
import { mockTransitOptions } from '../data/mockData';
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

function originLooksLikeMonroe(origin: string): boolean {
  const lower = (origin || '').toLowerCase();
  return lower.includes('monroe') || lower.includes('98272');
}

function originNearLinkStation(origin: string): boolean {
  const lower = (origin || '').toLowerCase();

  // Very rough heuristic: only synthesize "direct" Link light rail if the origin looks like
  // it is already within the Link/light-rail corridor.
  if (lower.includes('seattle')) return true;
  if (lower.includes('seatac') || lower.includes('sea-tac')) return true;
  if (lower.includes('tukwila') || lower.includes('angle lake')) return true;
  if (lower.includes('northgate') || lower.includes('lynnwood') || lower.includes('shoreline')) return true;

  // Zip-ish hints
  if (/\b981\d{2}\b/.test(lower)) return true;

  return false;
}

function buildTransitOnlyJourneys(origin: string, destination: string): TransitJourney[] {
  // If we can't produce something plausible without live routing, don't invent it.
  if (originLooksLikeMonroe(origin)) {
    return [];
  }

  const allowLightRail = originNearLinkStation(origin);
  if (!allowLightRail) {
    return [];
  }

  const nowIso = new Date().toISOString();

  return mockTransitOptions
    .filter((t) => {
      if (t.id.toLowerCase().includes('light-rail')) return allowLightRail;
      return true;
    })
    .map((t) => {
      const walkToStop = 10;
      const walkToTerminal = 6;
      const totalDuration = walkToStop + t.duration + walkToTerminal;
      const mode = t.id.toLowerCase().includes('rail')
        ? 'light-rail'
        : t.id.toLowerCase().includes('bus')
          ? 'bus'
          : 'train';

      return {
        ...t,
        // Provide a journey-style breakdown (no driving).
        duration: totalDuration,
        totalDuration,
        totalCost: t.price,
        segments: [
          { mode: 'walk', name: 'Walk to transit stop', duration: walkToStop, cost: 0 },
          { mode: mode as any, name: t.name, duration: t.duration, cost: t.price, frequency: (t as any).frequency },
          { mode: 'walk', name: 'Walk to terminal', duration: walkToTerminal, cost: 0 },
        ],
        transfers: 0,
        routeOrigin: origin,
        routeDestination: destination,
        routeTrustStatus: 'estimated',
        lastUpdated: nowIso,
        assumptions: [
          ...(t.assumptions || []),
          'Transit-only option (no driving/park-and-ride assumed).',
          'Note: live transit routing is not connected yet; times and feasibility may be inaccurate.',
        ],
      };
    });
}

function resolveTransportAvailability(tripData: TripData): TransportAvailability {
  const raw = (tripData as any).transportAvailability;
  return (raw === 'car' || raw === 'rideshare' || raw === 'transit' || raw === 'all') ? raw : 'all';
}

function hasDriveSegment(transit: TransitOption): boolean {
  const segs = (transit as any)?.segments;
  if (!Array.isArray(segs)) return false;
  return segs.some((s: any) => s?.mode === 'drive');
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
    void route;

    const transportAvailability = resolveTransportAvailability(tripData);

    const allowCarOptions = transportAvailability === 'car' || transportAvailability === 'all';
    const allowRideshare = transportAvailability === 'car' || transportAvailability === 'rideshare' || transportAvailability === 'all';
    const allowTransit = transportAvailability === 'car' || transportAvailability === 'rideshare' || transportAvailability === 'transit' || transportAvailability === 'all';

    const [parking, rideshare, rawTransit, tsaEstimate, trafficEstimate, flightInfo, locationInfo] = await Promise.all([
      allowCarOptions
        ? this.provider.getParkingOptions(tripData.origin, tripData.destination, tripDateTime)
        : Promise.resolve([]),
      allowRideshare
        ? this.provider.getRideshareOptions(tripData.origin, tripData.destination, tripDateTime)
        : Promise.resolve([]),
      allowTransit
        ? this.provider.getTransitOptions(tripData.origin, tripData.destination, tripDateTime)
        : Promise.resolve([]),
      this.provider.getTsaEstimate(tripData.destination),
      this.provider.getTrafficEstimate(tripData.origin, tripData.destination, tripDateTime),
      this.provider.getFlightInfo(tripData.destination, tripDateTime),
      this.provider.getAirportInfo(tripData.destination),
    ]);

    let transit: TransitOption[] = rawTransit as any;

    // If the user doesn't have a car today, remove park-and-ride style trips (drive segments)
    // and provide transit-only options.
    if (!allowCarOptions && allowTransit) {
      transit = transit.filter((t) => !hasDriveSegment(t));
      transit = [...transit, ...buildTransitOnlyJourneys(tripData.origin, tripData.destination)];
    }

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
