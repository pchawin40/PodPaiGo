import { TransportAvailability, TripData, Recommendation, ParkingOption, RideshareOption, TransitOption, TransitJourney, TsaEstimate } from './types';
import { ActiveDataProvider, DataProvider } from './providers';
import { attachSeaCheckpointRoute } from './airports/seaCheckpointRouting';
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
import { getWeatherImpactForAirport } from './weather/nws';
import { calculateAirportReadinessBuffer } from './airports/airportReadiness';
import { buildOptionIntelligence } from './intelligence/optionIntelligence';
import { buildSmartTags } from './intelligence/tags';
import {
  buildParkingTransferLegs,
  buildRideshareTransferLegs,
  buildTransitTransferLegs,
} from './intelligence/transferLegs';

type TripDataWithTransport = TripData & {
  transportAvailability?: TransportAvailability;
  airportCode?: string;
};

type TransitOptionWithFrequency = TransitOption & {
  frequency?: number;
};

type TransitSegmentLike = {
  mode?: string;
};

type TransitSegmentMode = NonNullable<TransitJourney['segments']>[number]['mode'];

function isSeaTacOnlyOption(option: { id?: string; name?: string; sourceName?: string; sourceLink?: string; mapLink?: string }): boolean {
  const text = [option.id, option.name, option.sourceName, option.sourceLink, option.mapLink]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return ['seatac', 'sea-tac', 'seattle-tacoma', 'sound transit', 'northgate', 'wallypark', 'masterpark']
    .some((s) => text.includes(s));
}

function resolveSelectedTsaEstimate(
  tripData: TripData,
  tsaEstimate: TsaEstimate
): TsaEstimate {
  if (tripData.type !== 'one-way-departure') return tsaEstimate;

  const selectedSecurity = tripData.securityOption || 'standard';

  const selectedWait =
    selectedSecurity === 'clear-precheck'
      ? tsaEstimate.waitTimes?.clearPrecheck
      : tsaEstimate.waitTimes?.[selectedSecurity];

  return {
    ...tsaEstimate,
    waitTime: selectedWait ?? tsaEstimate.waitTime,
    selectedLane: selectedSecurity,
    assumptions: [
      ...tsaEstimate.assumptions,
      `Selected security lane: ${selectedSecurity}`,
    ],
  };
}

function genericParkingFallback(airportCode: string, destination: string): ParkingOption[] {
  return [{
    id: 'generic-parking',
    name: `${airportCode} Airport Parking`,
    type: 'official',
    price: 40,
    distance: 10,
    availability: 80,
    trustStatus: 'estimated',
    routeOrigin: '',
    routeDestination: destination,
    lastUpdated: new Date().toISOString(),
    parkingBufferMinutes: 10,
    transferToTerminalMinutes: 5,
    transferType: 'walk',
    sourceName: 'Generic airport parking search',
    sourceLink: `https://www.google.com/search?q=${encodeURIComponent(`${airportCode} airport parking`)}`,
    mapLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${airportCode} airport parking`)}`,
    assumptions: ['Generic fallback parking option for non-SEA airports.'],
  }];
}

function genericRideshareFallback(): RideshareOption[] {
  const now = new Date().toISOString();

  return [
    {
      id: 'uber',
      name: 'Uber',
      price: 30,
      duration: 20,
      availability: 90,
      trustStatus: 'estimated',
      sourceName: 'Uber',
      sourceLink: 'https://m.uber.com/ul/?action=setPickup&pickup=my_location',
      mapLink: 'https://www.google.com/maps',
      lastUpdated: now,
      assumptions: ['Generic fallback rideshare option.'],
    },
    {
      id: 'lyft',
      name: 'Lyft',
      price: 30,
      duration: 20,
      availability: 90,
      trustStatus: 'estimated',
      sourceName: 'Lyft',
      sourceLink: 'https://lyft.com/ride',
      mapLink: 'https://www.google.com/maps',
      lastUpdated: now,
      assumptions: ['Generic fallback rideshare option.'],
    },
  ];
}

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
      const mode: TransitSegmentMode = t.id.toLowerCase().includes('rail')
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
          {
            mode,
            name: t.name,
            duration: t.duration,
            cost: t.price,
            frequency: (t as TransitOptionWithFrequency).frequency,
          },
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
  const raw = (tripData as TripDataWithTransport).transportAvailability;
  return raw === 'car' || raw === 'rideshare' || raw === 'transit' || raw === 'all'
    ? raw
    : 'all';
}

function hasDriveSegment(transit: TransitOption): boolean {
  const segs = (transit as { segments?: TransitSegmentLike[] }).segments;
  if (!Array.isArray(segs)) return false;
  return segs.some((s) => s.mode === 'drive');
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
    const allowRideshare =
      transportAvailability === 'rideshare' || transportAvailability === 'all';
    const allowTransit =
      transportAvailability === 'transit' || transportAvailability === 'all';

    const [
      rawParking,
      rawRideshare,
      rawTransit,
      tsaEstimate,
      trafficEstimate,
      flightInfo,
      locationInfo,
    ] = await Promise.all([
      allowCarOptions
        ? this.provider.getParkingOptions(
          tripData.origin,
          tripData.destination,
          tripDateTime,
          calculateParkingDuration(tripData)
        )
        : Promise.resolve([]),

      allowRideshare
        ? this.provider.getRideshareOptions(
          tripData.origin,
          tripData.destination,
          tripDateTime
        )
        : Promise.resolve([]),

      allowTransit
        ? this.provider.getTransitOptions(
          tripData.origin,
          tripData.destination,
          tripDateTime
        )
        : Promise.resolve([]),

      this.provider.getTsaEstimate(
        tripData.destination,
        tripData.type === 'one-way-departure'
          ? tripData.securityOption || 'standard'
          : 'standard'
      ),

      this.provider.getTrafficEstimate(
        tripData.origin,
        tripData.destination,
        tripDateTime
      ),

      this.provider.getFlightInfo(
        tripData.destination,
        tripDateTime
      ),

      this.provider.getAirportInfo(
        tripData.destination
      ),
    ]);

    const resolvedTsaEstimate = resolveSelectedTsaEstimate(tripData, tsaEstimate);

    let parking = rawParking;
    let rideshare = rawRideshare;
    let transit = rawTransit;

    const airportCode = ((tripData as TripDataWithTransport).airportCode || 'SEA').toUpperCase();

    parking =
      airportCode === 'SEA'
        ? parking.map((p) =>
          attachSeaCheckpointRoute(
            p,
            resolvedTsaEstimate.bestCheckpoint
              ? {
                ...resolvedTsaEstimate.bestCheckpoint,
                reason: resolvedTsaEstimate.bestCheckpoint.reason || 'Best checkpoint for this trip.',
              }
              : undefined
          )
        )
        : parking;

    const weatherImpact = await getWeatherImpactForAirport({
      airportCode,
      targetDateTime: tripDateTime,
    }).catch(() => null);

    if (airportCode !== 'SEA') {
      parking = parking.filter((p) => !isSeaTacOnlyOption(p));
      rideshare = rideshare.filter((r) => !isSeaTacOnlyOption(r));
      transit = transit.filter((t) => !isSeaTacOnlyOption(t));

      if (allowCarOptions && parking.length === 0) {
        parking = genericParkingFallback(airportCode, tripData.destination);
      }

      if (allowRideshare && rideshare.length === 0) {
        rideshare = genericRideshareFallback();
      }

      transit = [];
    }

    // If the user doesn't have a car today, remove park-and-ride style trips (drive segments)
    // and provide transit-only options.
    if (!allowCarOptions && allowTransit) {
      transit = transit.filter((t) => !hasDriveSegment(t));
      transit = [...transit, ...buildTransitOnlyJourneys(tripData.origin, tripData.destination)];
    }

    // if (allowCarOptions && parking.length > 0) {
    //   parking = await enrichParkingWithGooglePlaces(parking);
    // }

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

    const sortedParking = parkingWithCosts.sort((a, b) => {
      const weatherScore = (p: ParkingOption) => {
        if (!weatherImpact) return 0;

        const adj = weatherImpact.parkingScoreAdjustments;
        let score = 0;

        if (p.covered) score += adj.coveredBonus;
        if (p.type === 'official') score += adj.officialGarageBonus;
        if (p.transferType === 'shuttle') score += adj.shuttlePenalty;
        if (!p.covered && p.type === 'off-airport') score += adj.uncoveredPenalty;

        return score;
      };

      return (
        (a.calculatedCost - weatherScore(a)) -
        (b.calculatedCost - weatherScore(b))
      );
    });
    const sortedRideshare = rideshareWithCosts.sort((a, b) => a.calculatedCost - b.calculatedCost);
    const sortedTransit = transitWithCosts.sort((a, b) => a.calculatedCost - b.calculatedCost);

    const enrichedParking = sortedParking.map((option) => {
      const intelligence = buildOptionIntelligence('parking', option, tripData, weatherImpact);

      const smartTags = buildSmartTags(intelligence, weatherImpact);

      return {
        ...option,
        intelligence,
        transferLegs: buildParkingTransferLegs(option, tripData),

        bestFor: [...(option.bestFor ?? []), ...smartTags],

        walkingBurdenScore: intelligence.walkingBurdenScore,
        walkingBurdenLabel: intelligence.walkingBurdenLabel,

        stressScore: intelligence.stressScore,
        stressLabel: intelligence.stressLabel,

        fullLotRiskScore: intelligence.fullLotRiskScore,
        fullLotRiskLabel: intelligence.fullLotRiskLabel,

        rushPenaltyScore: intelligence.rushPenaltyScore,
        rushPenaltyLabel: intelligence.rushPenaltyLabel,

        weatherPenaltyScore: intelligence.weatherPenaltyScore,
        weatherPenaltyLabel: intelligence.weatherPenaltyLabel,

        shuttleReliabilityScore: intelligence.shuttleReliabilityScore,
        shuttleReliabilityLabel: intelligence.shuttleReliabilityLabel,

        trueTotalCost: intelligence.trueTotalCost,
      };
    });

    const enrichedRideshare = sortedRideshare.map((option) => {
      const intelligence = buildOptionIntelligence('rideshare', option, tripData, weatherImpact);

      return {
        ...option,
        intelligence,
        transferLegs: buildRideshareTransferLegs(option, tripData),

        walkingBurdenScore: intelligence.walkingBurdenScore,
        walkingBurdenLabel: intelligence.walkingBurdenLabel,

        stressScore: intelligence.stressScore,
        stressLabel: intelligence.stressLabel,

        rushPenaltyScore: intelligence.rushPenaltyScore,
        rushPenaltyLabel: intelligence.rushPenaltyLabel,

        weatherPenaltyScore: intelligence.weatherPenaltyScore,
        weatherPenaltyLabel: intelligence.weatherPenaltyLabel,

        trueTotalCost: intelligence.trueTotalCost,
      };
    });

    const enrichedTransit = sortedTransit.map((option) => {
      const intelligence = buildOptionIntelligence('transit', option, tripData, weatherImpact);

      return {
        ...option,
        intelligence,
        transferLegs: buildTransitTransferLegs(option, tripData),

        walkingBurdenScore: intelligence.walkingBurdenScore,
        walkingBurdenLabel: intelligence.walkingBurdenLabel,

        stressScore: intelligence.stressScore,
        stressLabel: intelligence.stressLabel,

        rushPenaltyScore: intelligence.rushPenaltyScore,
        rushPenaltyLabel: intelligence.rushPenaltyLabel,

        weatherPenaltyScore: intelligence.weatherPenaltyScore,
        weatherPenaltyLabel: intelligence.weatherPenaltyLabel,

        trueTotalCost: intelligence.trueTotalCost,
      };
    });

    let weatherBufferMinutes = 0;

    if (weatherImpact) {
      if (weatherImpact.riskLevel === 'medium') weatherBufferMinutes = 10;
      if (weatherImpact.riskLevel === 'high') weatherBufferMinutes = 20;

      if (weatherImpact.condition === 'snow' || weatherImpact.condition === 'storm') {
        weatherBufferMinutes = 25;
      }

      if ((weatherImpact.windMph ?? 0) >= 30) {
        weatherBufferMinutes = Math.max(weatherBufferMinutes, 15);
      }
    }

    const airportReadiness =
      tripData.type === 'one-way-departure'
        ? calculateAirportReadinessBuffer({
          checkingBags: !!tripData.checkingBags,
          securityOption: tripData.securityOption || 'standard',
          flightType: tripData.flightType || 'domestic',
          cabin: tripData.cabin || 'economy',
        })
        : null;

    const airportReadinessBufferMinutes =
      tripData.type === 'one-way-departure' &&
        tripData.timeAnchor !== 'airport-arrival'
        ? airportReadiness?.bufferMinutes ?? 75
        : 0;

    const leaveByTime = isDepartureLeg(tripData)
      ? calculateLeaveByTime(
        tripData,
        resolvedTsaEstimate,
        trafficEstimate.duration,
        airportReadinessBufferMinutes + weatherBufferMinutes
      )
      : null;

    const finalParking = enrichedParking.sort((a, b) => {
      return (
        (a.trueTotalCost ?? a.calculatedCost) - (b.trueTotalCost ?? b.calculatedCost) ||
        (a.stressScore ?? 50) - (b.stressScore ?? 50) ||
        (a.walkingBurdenScore ?? 50) - (b.walkingBurdenScore ?? 50)
      );
    });

    const finalRideshare = enrichedRideshare.sort((a, b) => {
      return (
        (a.trueTotalCost ?? a.calculatedCost) - (b.trueTotalCost ?? b.calculatedCost) ||
        (a.stressScore ?? 50) - (b.stressScore ?? 50)
      );
    });

    const finalTransit = enrichedTransit.sort((a, b) => {
      return (
        (a.trueTotalCost ?? a.calculatedCost) - (b.trueTotalCost ?? b.calculatedCost) ||
        (a.stressScore ?? 50) - (b.stressScore ?? 50)
      );
    });

    return {
      parking: finalParking,
      rideshare: finalRideshare,
      transit: finalTransit,
      tsaEstimate: resolvedTsaEstimate,
      weatherImpact,
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
