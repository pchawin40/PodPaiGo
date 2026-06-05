import { TransportAvailability, TripData, Recommendation, ParkingOption, RideshareOption, TransitOption, TransitJourney, TsaEstimate, TrafficEstimate, FlightInfo, LocationInfo } from './types';
import { ActiveDataProvider, DataProvider } from './providers';
import { shouldDiscoverParkingForTrip } from './trip/tripContext';
import { debugLog } from './utils/debug';

/**
 * Resolve a promise, but fall back to a degraded value if it does not settle in
 * `ms`. Used to isolate slow live provider calls so the results page renders with
 * partial data instead of hanging on "Recalculating...". Never rejects.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;

  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(onTimeout());
    }, ms);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(onTimeout());
      },
    );
  });
}

function getParkingFetchTimeoutMs(): number {
  const configured = Number(process.env.PARKING_FETCH_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 5000;
}

function getProviderFetchTimeoutMs(provider: string): number {
  const envKey = `${provider.toUpperCase()}_FETCH_TIMEOUT_MS`;
  const configured = Number(process.env[envKey]);
  if (Number.isFinite(configured) && configured > 0) return configured;

  if (provider === 'parking') return getParkingFetchTimeoutMs();
  if (provider === 'traffic') return Number(process.env.ROUTE_FETCH_TIMEOUT_MS) || 4500;
  return 3500;
}

function providerFetch<T>(
  provider: string,
  fetcher: () => Promise<T>,
  fallback: (error: unknown, timedOut: boolean) => T,
  timeoutMs = getProviderFetchTimeoutMs(provider),
): Promise<T> {
  const startedAt = Date.now();
  debugLog('provider_fetch_start', { provider, timeoutMs });

  const promise = fetcher()
    .then((value) => {
      debugLog('provider_fetch_success', {
        provider,
        ms: Date.now() - startedAt,
      });
      return value;
    })
    .catch((error) => {
      debugLog('provider_fetch_failed', {
        provider,
        ms: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });
      return fallback(error, false);
    });

  return withTimeout(promise, timeoutMs, () => {
    debugLog('provider_fetch_timeout', {
      provider,
      ms: Date.now() - startedAt,
      timeoutMs,
    });
    return fallback(new Error(`${provider} fetch timed out`), true);
  });
}

function fallbackTrafficEstimate(tripData: TripData, timedOut: boolean): TrafficEstimate {
  return {
    route: `${tripData.origin}->${tripData.destination}`,
    duration: 35,
    congestion: 'medium',
    trustStatus: 'fallback',
    routeUnavailable: false,
    sourceName: timedOut ? 'Provider timeout fallback' : 'Provider fallback',
    lastUpdated: new Date().toISOString(),
    assumptions: [
      timedOut
        ? 'Live route data is still updating; open directions to confirm current traffic.'
        : 'Live route data unavailable; using fallback route timing.',
    ],
  };
}
import {
  resolveRouteDepartureIsoForPurpose,
  resolveScheduledTripDateTime,
  resolveTargetTerminalArrivalIso,
  resolveTripRouteTiming,
} from './trip/routeTiming';
import { attachSeaCheckpointRoute } from './airports/seaCheckpointRouting';
import { getParkingDiscoveryNotice } from './parking/parkingDiscoveryMode';
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
import { getWeatherForAirport, getWeatherForPoint } from './weather/nws';
import type { WeatherLookupResult } from './weather/types';
import {
  getTransitPassAssumption,
  getTransitPassPriceNote,
  resolveTransitPaymentRegionContext,
} from './transit/transitPaymentLabels';
import { calculateAirportReadinessBuffer } from './airports/airportReadiness';
import { buildOptionIntelligence } from './intelligence/optionIntelligence';
import { buildSmartTags } from './intelligence/tags';
import {
  buildParkingTransferLegs,
  buildRideshareTransferLegs,
  buildTransitTransferLegs,
} from './intelligence/transferLegs';
import { isParkingRouteUnavailable } from './parking/routeStatus';
import { getAirportById } from './airports/catalog';
import { buildSeaCuratedAccessOptions } from './access/buildAccessOptions';
import {
  buildParkAndRideAccessOptionsFromParking,
  partitionParkingByAccessKind,
} from './access/parkAndRideAccess';
import { rankAccessOptions } from './access/rankAccessOptions';

type TripDataWithTransport = TripData & {
  transportAvailability?: TransportAvailability;
  airportCode?: string;
  parkingPreference?: 'none' | 'destination' | 'nearby';
};

type TransitOptionWithFrequency = TransitOption & {
  frequency?: number;
};

type TransitSegmentLike = {
  mode?: string;
};

type TransitSegmentMode = NonNullable<TransitJourney['segments']>[number]['mode'];

function tripTypeValue(tripData: TripData): string {
  return String(tripData.type);
}

function isGeneralTrip(tripData: TripData): boolean {
  if (tripTypeValue(tripData) === 'general-trip') return true;
  if (tripData.destinationKind && tripData.destinationKind !== 'airport') return true;
  return false;
}

function isAirportDepartureTrip(tripData: TripData): boolean {
  const type = tripTypeValue(tripData);
  return type === 'airport-departure' || type === 'one-way-departure';
}

function isAirportArrivalTrip(tripData: TripData): boolean {
  const type = tripTypeValue(tripData);
  return type === 'airport-arrival' || type === 'one-way-arrival';
}

function isAirportRoundTrip(tripData: TripData): boolean {
  const type = tripTypeValue(tripData);
  return type === 'airport-round-trip' || type === 'round-trip';
}

function isAirportDropoffPickupTrip(tripData: TripData): boolean {
  const type = tripTypeValue(tripData);
  return type === 'airport-dropoff-pickup' || type === 'dropoff-pickup';
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
  const code = airportCode.toUpperCase();
  return [{
    id: 'generic-parking',
    name: `${code} Airport Parking`,
    serviceAirportCode: code,
    type: 'official',
    price: 40,
    distance: 10,
    availability: 80,
    trustStatus: 'estimated',
    routeUnavailable: false,
    routeOrigin: '',
    routeDestination: destination,
    lastUpdated: new Date().toISOString(),
    parkingBufferMinutes: 10,
    transferToTerminalMinutes: 5,
    transferType: 'walk',
    sourceName: 'Generic airport parking search',
    sourceLink: `https://www.google.com/search?q=${encodeURIComponent(`${airportCode} airport parking`)}`,
    mapLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${airportCode} airport parking`)}`,
    assumptions: ['Limited parking data available. Search providers for current rates and availability.'],
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
      priceDisplay: 'estimated',
      priceNote: 'Baseline estimate only. Open Uber for final pricing.',
      rideshareEstimateConfidence: 'baseline-estimate',
      sourceName: 'Uber',
      sourceLink: 'https://m.uber.com/ul/?action=setPickup&pickup=my_location',
      mapLink: 'https://www.google.com/maps',
      lastUpdated: now,
      assumptions: ['Generic fallback rideshare option.', 'Not a live Uber quote.'],
    },
    {
      id: 'lyft',
      name: 'Lyft',
      price: 30,
      duration: 20,
      availability: 90,
      trustStatus: 'estimated',
      priceDisplay: 'estimated',
      priceNote: 'Baseline estimate only. Open Lyft for final pricing.',
      rideshareEstimateConfidence: 'baseline-estimate',
      sourceName: 'Lyft',
      sourceLink: 'https://lyft.com/ride',
      mapLink: 'https://www.google.com/maps',
      lastUpdated: now,
      assumptions: ['Generic fallback rideshare option.', 'Not a live Lyft quote.'],
    },
  ];
}

function buildTripDateTime(tripData: TripData): string {
  return resolveScheduledTripDateTime(tripData) ?? new Date().toISOString();
}

function buildParkingCheckInDateTime(tripData: TripData): string {
  if (tripData.parkingCheckInDate && tripData.parkingCheckInTime) {
    return `${tripData.parkingCheckInDate}T${tripData.parkingCheckInTime}`;
  }

  if (tripData.type === 'general-trip') {
    return `${tripData.parkingCheckInDate || tripData.arrivalDate}T${tripData.parkingCheckInTime || tripData.arrivalTime}`;
  }

  if (tripData.type === 'one-way-departure') {
    return `${tripData.parkingCheckInDate || tripData.departureDate}T${tripData.parkingCheckInTime || tripData.departureTime}`;
  }

  if (tripData.type === 'round-trip') {
    return `${tripData.parkingCheckInDate || tripData.departureDate}T${tripData.parkingCheckInTime || tripData.departureTime}`;
  }

  return buildTripDateTime(tripData);
}

function plannedAirportArrivalDateTime(tripData: TripData): string | undefined {
  return resolveTargetTerminalArrivalIso(tripData) ?? undefined;
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
    const isAirportTrip = !isGeneralTrip(tripData);

    const generationStartedAt = Date.now();
    debugLog('recommendation_generation_start', {
      type: tripData.type,
      destinationKind: tripData.destinationKind ?? 'airport',
      isAirportTrip,
    });

    const tripDateTime = buildTripDateTime(tripData);
    const routeTiming = resolveTripRouteTiming(tripData);
    const mainRouteDepartureIso = resolveRouteDepartureIsoForPurpose(
      routeTiming,
      'main_to_destination',
    );
    const parkingRouteDepartureIso = resolveRouteDepartureIsoForPurpose(
      routeTiming,
      'origin_to_parking',
    );
    const mainDestinationLatLng =
      typeof tripData.destinationLat === 'number' &&
      typeof tripData.destinationLng === 'number'
        ? { lat: tripData.destinationLat, lng: tripData.destinationLng }
        : undefined;
    const mainOriginLatLng =
      typeof tripData.originLat === 'number' &&
      typeof tripData.originLng === 'number'
        ? { lat: tripData.originLat, lng: tripData.originLng }
        : undefined;
    const route =
      isAirportArrivalTrip(tripData)
        ? 'airport-home'
        : 'home-airport';
    void route;

    const transportAvailability = resolveTransportAvailability(tripData);

    const plannedAirportArrivalAt = isAirportTrip
      ? plannedAirportArrivalDateTime(tripData)
      : undefined;

    const noParkingNeeded = (tripData as TripDataWithTransport).parkingPreference === 'none';
    const allowCarOptions = transportAvailability === 'car' || transportAvailability === 'all';
    const shouldLoadParking = allowCarOptions && shouldDiscoverParkingForTrip(tripData);
    const allowRideshare =
      noParkingNeeded ||
      transportAvailability === 'rideshare' ||
      transportAvailability === 'all';
    const allowTransit =
      noParkingNeeded ||
      transportAvailability === 'transit' ||
      transportAvailability === 'all';

    debugLog('recommendation_provider_flags', {
      type: tripData.type,
      destinationKind: tripData.destinationKind ?? 'airport',
      transportAvailability,
      parkingPreference: (tripData as TripDataWithTransport).parkingPreference,
      noParkingNeeded,
      allowCarOptions,
      shouldLoadParking,
      allowRideshare,
      allowTransit,
      hasOriginCoords: Boolean(mainOriginLatLng),
      hasDestinationCoords: Boolean(mainDestinationLatLng),
    });
    const timedParkingRequest = shouldLoadParking
      ? providerFetch(
          'parking',
          async () => {
            const options = await this.provider.getParkingOptions(
              tripData.origin,
              tripData.destination,
              buildParkingCheckInDateTime(tripData),
              calculateParkingDuration(tripData),
              {
                destinationKind: tripData.destinationKind ?? 'airport',
                airportCode: isAirportTrip
                  ? ((tripData as TripDataWithTransport).airportCode || undefined)
                  : undefined,
                destinationLat: tripData.destinationLat,
                destinationLng: tripData.destinationLng,
                routeDepartureTime: parkingRouteDepartureIso,
                targetTerminalArrivalTime: routeTiming.targetTerminalArrivalIso,
              },
            );

            return {
              options,
              failed: false,
              timedOut: false,
              message: null as string | null,
            };
          },
          (error, timedOut) => {
            const message = error instanceof Error ? error.message : String(error);
            console.warn('Parking fetch failed; continuing with non-parking recommendations', {
              tripType: tripData.type,
              destinationKind: tripData.destinationKind ?? 'airport',
              airportCode: isAirportTrip
                ? ((tripData as TripDataWithTransport).airportCode || undefined)
                : undefined,
              message,
              timedOut,
            });

            return {
              options: [] as ParkingOption[],
              failed: true,
              timedOut,
              message: timedOut
                ? 'Live parking is still updating. Showing partial results — open directions to confirm.'
                : 'Parking data unavailable right now. Try again or open directions.',
            };
          },
          getParkingFetchTimeoutMs(),
        )
      : Promise.resolve({
          options: [] as ParkingOption[],
          failed: false,
          timedOut: false,
          message: null as string | null,
        });

    const [
      parkingResult,
      rawRideshare,
      rawTransit,
      tsaEstimate,
      trafficEstimate,
      flightInfo,
      locationInfo,
    ] = await Promise.all([
      timedParkingRequest,

      allowRideshare
        ? providerFetch(
            'rideshare',
            () =>
              this.provider.getRideshareOptions(
                tripData.origin,
                tripData.destination,
                tripDateTime,
                tripData,
              ),
            () => [] as RideshareOption[],
          )
        : Promise.resolve([]),

      allowTransit
        ? providerFetch(
            'transit',
            () =>
              this.provider.getTransitOptions(
                tripData.origin,
                tripData.destination,
                tripDateTime,
              ),
            () => [] as TransitJourney[],
          )
        : Promise.resolve([]),

      isAirportTrip
        ? providerFetch(
            'tsa',
            () =>
              this.provider.getTsaEstimate(
                tripData.destination,
                isAirportDepartureTrip(tripData) && 'securityOption' in tripData
                  ? tripData.securityOption || 'standard'
                  : 'standard',
                plannedAirportArrivalAt,
              ),
            () =>
              ({
                destination: tripData.destination,
                waitTime: 20,
                status: 'fallback',
                sourceName: 'Provider fallback',
                trustStatus: 'fallback' as const,
                lastUpdated: new Date().toISOString(),
                assumptions: ['Live TSA data unavailable; using fallback security timing.'],
              } satisfies TsaEstimate),
          )
        : Promise.resolve({
          destination: tripData.destination,
          waitTime: 0,
          status: 'fallback',
          sourceName: 'Not applicable',
          trustStatus: 'estimated' as const,
          lastUpdated: new Date().toISOString(),
          assumptions: [
            'TSA/security timing does not apply to general point A to point B trips.',
          ],
        } satisfies TsaEstimate),

      providerFetch(
        'traffic',
        () =>
          this.provider.getTrafficEstimate(
            tripData.origin,
            tripData.destination,
            mainRouteDepartureIso,
            mainDestinationLatLng,
            {
              airportCode: isAirportTrip
                ? ((tripData as TripDataWithTransport).airportCode || undefined)
                : undefined,
              routePurpose: 'main_to_destination',
              originLatLng: mainOriginLatLng,
              targetTerminalArrivalTime: routeTiming.targetTerminalArrivalIso,
            },
          ),
        (_error, timedOut) => fallbackTrafficEstimate(tripData, timedOut),
      ),

      isAirportTrip
        ? providerFetch(
            'flight',
            () => this.provider.getFlightInfo(tripData.destination, tripDateTime),
            () => null as FlightInfo | null,
          )
        : Promise.resolve(null),

      isAirportTrip
        ? providerFetch(
            'airport_info',
            () => this.provider.getAirportInfo(tripData.destination),
            () => null as LocationInfo | null,
          )
        : Promise.resolve(null),
    ]);

    const resolvedTsaEstimate = resolveSelectedTsaEstimate(tripData, tsaEstimate);

    let parking = parkingResult.options;
    let rideshare = rawRideshare;
    let transit = rawTransit;

    const airportCode = isAirportTrip
      ? ((tripData as TripDataWithTransport).airportCode || 'SEA').toUpperCase()
      : 'GENERAL';

    const { standardParking, parkAndRideParking } = partitionParkingByAccessKind(parking);
    parking = standardParking;

    if (isAirportTrip && airportCode === 'SEA') {
      parking = parking.map((p) =>
        attachSeaCheckpointRoute(
          p,
          resolvedTsaEstimate.bestCheckpoint
            ? {
              ...resolvedTsaEstimate.bestCheckpoint,
              reason: resolvedTsaEstimate.bestCheckpoint.reason || 'Best checkpoint for this trip.',
            }
            : undefined
        )
      );
    }

    const weatherResult = isAirportTrip
      ? await getWeatherForAirport({
        airportCode,
        targetDateTime: routeTiming.targetTerminalArrivalIso || tripDateTime,
      }).catch((): WeatherLookupResult => ({
        weatherImpact: null,
        context: 'unavailable' as const,
      }))
      : typeof tripData.destinationLat === 'number' && typeof tripData.destinationLng === 'number'
        ? await getWeatherForPoint({
          lat: tripData.destinationLat,
          lng: tripData.destinationLng,
          targetDateTime: tripDateTime,
          currentContext: 'current-destination-weather',
        }).catch((): WeatherLookupResult => ({
          weatherImpact: null,
          context: 'unavailable' as const,
        }))
        : {
          weatherImpact: null,
          context: 'forecast-unavailable' as const,
        };

    const weatherImpact = weatherResult.weatherImpact;

    if (isAirportTrip) {
      if (airportCode !== 'SEA') {
        if (allowCarOptions && parking.length === 0) {
          parking = genericParkingFallback(airportCode, tripData.destination);
        }

        if (allowRideshare && rideshare.length === 0 && !trafficEstimate.routeUnavailable) {
          rideshare = genericRideshareFallback();
        }

        transit = [];
      }
    }

    // If the user doesn't have a car today, remove park-and-ride style trips (drive segments)
    // and provide transit-only options.
    const parkingDurationMinutes = calculateParkingDuration(tripData);
    const requiresOvernightParking =
      (tripData.type === 'one-way-departure' || tripData.type === 'round-trip') &&
      parkingDurationMinutes >= 18 * 60;

    // If the user doesn't have a car today, remove park-and-ride style trips.
    // Also remove drive-to-park-and-ride options for overnight airport trips because
    // most P&R lots should not be treated as airport parking without verified overnight rules.
    if ((!allowCarOptions && allowTransit) || requiresOvernightParking) {
      transit = transit.filter((t) => !hasDriveSegment(t));
    }

    if (!allowCarOptions && allowTransit) {
      transit = [...transit, ...buildTransitOnlyJourneys(tripData.origin, tripData.destination)];
    }

    // if (allowCarOptions && parking.length > 0) {
    //   parking = await enrichParkingWithGooglePlaces(parking);
    // }

    const tripDuration = calculateTripDuration(tripData);
    const parkingDuration = calculateParkingDuration(tripData);
    const availableParking =
      tripData.type === 'general-trip' ||
        isAirportDepartureTrip(tripData) || isAirportRoundTrip(tripData)
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

    const hasOrcaPass = tripData.transitPayment === 'orca-pass';
    const transitPassContext = resolveTransitPaymentRegionContext({
      airportCode: tripData.airportCode,
    });

    const transitWithCosts = transit.map(t => ({
      ...t,
      price: hasOrcaPass ? 0 : t.price,
      totalCost: hasOrcaPass && 'totalCost' in t ? 0 : (t as { totalCost?: number }).totalCost,
      calculatedCost: hasOrcaPass ? 0 : calculateTransitCost(t, tripData),
      priceNote: hasOrcaPass
        ? getTransitPassPriceNote(transitPassContext)
        : t.priceNote,
      assumptions: hasOrcaPass
        ? [
          ...(t.assumptions || []),
          getTransitPassAssumption(transitPassContext),
          'Park & Ride lot rules, time limits, and permit requirements may still apply.',
        ]
        : t.assumptions,
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
          bagPlan: tripData.bagPlan,
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

    const leaveByTime = isDepartureLeg(tripData) && !trafficEstimate.routeUnavailable
      ? calculateLeaveByTime(
        tripData,
        resolvedTsaEstimate,
        trafficEstimate.duration,
        airportReadinessBufferMinutes + weatherBufferMinutes
      )
      : null;

    const finalParking = enrichedParking.sort((a, b) => {
      if (isParkingRouteUnavailable(a) !== isParkingRouteUnavailable(b)) {
        return isParkingRouteUnavailable(a) ? 1 : -1;
      }

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

    const curatedAccessOptions =
      isAirportTrip && airportCode === 'SEA'
        ? buildSeaCuratedAccessOptions(tripData, airportCode, trafficEstimate)
        : [];

    const discoveredParkAndRideAccess =
      isAirportTrip && parkAndRideParking.length > 0
        ? buildParkAndRideAccessOptionsFromParking(
          parkAndRideParking,
          tripData,
          airportCode,
          trafficEstimate,
        )
        : [];

    const allAccessOptions = [...curatedAccessOptions, ...discoveredParkAndRideAccess];

    const accessStrategies =
      allAccessOptions.length > 0
        ? rankAccessOptions(allAccessOptions, tripData)
        : undefined;
    const parkingDataStatus =
      !shouldLoadParking
        ? 'not_requested'
        : parkingResult.failed
          ? 'unavailable'
          : finalParking.length > 0
            ? 'available'
            : 'empty';
    const parkingDataMessage =
      parkingResult.failed
        ? parkingResult.message || 'Parking data unavailable right now. Try again or open directions.'
        : shouldLoadParking && finalParking.length === 0
          ? isAirportTrip
            ? 'No parking found near this airport yet.'
            : 'No parking found near this destination yet.'
          : undefined;
    const partialDataReasons = [
      parkingResult.failed
        ? parkingResult.timedOut
          ? 'parking_timeout'
          : 'parking_failed'
        : null,
      trafficEstimate.trustStatus === 'fallback' ? 'traffic_fallback' : null,
      allowRideshare && finalRideshare.length === 0 ? 'rideshare_unavailable' : null,
      allowTransit && finalTransit.length === 0 ? 'transit_unavailable' : null,
      isAirportTrip && !flightInfo ? 'flight_info_unavailable' : null,
      isAirportTrip && !locationInfo ? 'airport_info_unavailable' : null,
    ].filter((reason): reason is string => Boolean(reason));

    if (partialDataReasons.length > 0) {
      debugLog('results_partial_data', {
        reasons: partialDataReasons,
        parkingDataStatus,
        trafficTrustStatus: trafficEstimate.trustStatus,
      });
    }

    debugLog('recommendation_generation_summary', {
      ms: Date.now() - generationStartedAt,
      parkingCount: finalParking.length,
      parkingDataStatus,
      rideshareCount: finalRideshare.length,
      transitCount: finalTransit.length,
      routeUnavailable: Boolean(trafficEstimate.routeUnavailable),
      partialDataReasons,
    });

    return {
      parking: finalParking,
      rideshare: finalRideshare,
      transit: finalTransit,
      accessStrategies,
      parkingDiscoveryNotice:
        shouldLoadParking
          ? isAirportTrip
            ? getParkingDiscoveryNotice(finalParking.length)
            : 'Street/meter parking may be available nearby. Check signs, meter rules, loading zones, and time limits before leaving your car.'
          : undefined,
      tsaEstimate: resolvedTsaEstimate,
      airportRouteUnavailable: Boolean(trafficEstimate.routeUnavailable),
      airportRouteUnavailableReason: trafficEstimate.routeUnavailableReason,
      weatherImpact,
      weatherContext: weatherResult.context,
      weatherForecastRangeStart: weatherResult.forecastRangeStart,
      weatherForecastRangeEnd: weatherResult.forecastRangeEnd,
      leaveByTime,
      tripDuration,
      trafficEstimate,
      flightInfo: flightInfo ?? undefined,
      locationInfo: locationInfo ?? undefined,
      parkingDataStatus,
      parkingDataMessage,
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
