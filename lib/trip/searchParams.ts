import { getAirportById } from '../airports/catalog';
import { parseBagPlanParam, resolveBagPlan } from '../airports/bagPlan';
import type {
  BagPlan,
  CabinClass,
  FlightType,
  SecurityOption,
  TransportAvailability,
  TransitPaymentOption,
  TripData,
  TripType,
} from '../types';

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

export function generateTripId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function storeTripSearchParams(params: URLSearchParams): string | null {
  if (typeof window === 'undefined') return null;

  const tripId = generateTripId();
  const key = `podpaigo-trip-${tripId}`;

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        tripData: Object.fromEntries(params.entries()),
        query: params.toString(),
      }),
    );

    return tripId;
  } catch {
    return null;
  }
}

export function parseTripDataFromSearchParams(searchParams: URLSearchParams): TripData | null {
  const type = searchParams.get('type') as TripData['type'] | null;
  const origin = searchParams.get('origin') || '';
  const destination = searchParams.get('destination') || '';
  const airportCode = (
    searchParams.get('airportCode') ||
    searchParams.get('airport') ||
    'SEA'
  ).toUpperCase();
  const parkingDurationStr = searchParams.get('parkingDuration');
  const parkingDuration = parkingDurationStr ? parseInt(parkingDurationStr, 10) : undefined;
  const parkingCheckInDate = searchParams.get('parkingCheckInDate') || '';
  const parkingCheckOutDate = searchParams.get('parkingCheckOutDate') || '';

  const transportRaw = searchParams.get('transport') || 'all';
  const transportAvailability: TransportAvailability = isOneOf(
    transportRaw,
    ['car', 'rideshare', 'transit', 'all'] as const,
  )
    ? transportRaw
    : 'all';

  const transitPaymentRaw = searchParams.get('transitPayment') || 'normal';
  const transitPayment: TransitPaymentOption =
    transitPaymentRaw === 'orca-pass' ? 'orca-pass' : 'normal';

  const intentParam = searchParams.get('intent') || '';

  const timeAnchorRaw = searchParams.get('timeAnchor');
  const timeAnchor: 'flight-departure' | 'airport-arrival' =
    timeAnchorRaw === 'airport-arrival' ? 'airport-arrival' : 'flight-departure';

  const bagPlanRaw = searchParams.get('bagPlan');
  const checkingBagsLegacy = (searchParams.get('bags') || 'no').toLowerCase() === 'yes';
  const bagPlan = resolveBagPlan({
    bagPlan: bagPlanRaw ? parseBagPlanParam(bagPlanRaw) : undefined,
    checkingBags: checkingBagsLegacy,
  });
  const checkingBags = bagPlan !== 'none';
  const checkedInRaw = (searchParams.get('checkedInAtAirport') || 'yes').toLowerCase();
  const checkedInAtAirport = checkedInRaw !== 'no';

  const securityRaw =
    searchParams.get('securityOption') ||
    searchParams.get('security') ||
    'standard';

  const securityOption: SecurityOption = isOneOf(
    securityRaw,
    ['standard', 'precheck', 'clear', 'clear-precheck'] as const,
  )
    ? securityRaw
    : 'standard';

  const flightTypeRaw = searchParams.get('flightType') || 'domestic';
  const flightType: FlightType = isOneOf(flightTypeRaw, ['domestic', 'international'] as const)
    ? flightTypeRaw
    : 'domestic';

  const cabinRaw = searchParams.get('cabin') || 'economy';
  const cabin: CabinClass = isOneOf(cabinRaw, ['economy', 'premium'] as const)
    ? cabinRaw
    : 'economy';

  let data: TripData | null = null;

  if (type === 'one-way-departure') {
    const departureDate = searchParams.get('departureDate') || '';
    const departureTime = searchParams.get('departureTime') || '';

    let computedParkingDuration = parkingDuration;
    if (!computedParkingDuration && parkingCheckInDate && parkingCheckOutDate) {
      const checkIn = new Date(`${parkingCheckInDate}T00:00:00`);
      const checkOut = new Date(`${parkingCheckOutDate}T00:00:00`);
      if (!Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime())) {
        const diffMinutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
        if (diffMinutes > 0) {
          computedParkingDuration = Math.max(24 * 60, diffMinutes);
        }
      }
    }

    if (departureDate && departureTime && origin && destination) {
      data =
        intentParam === 'flying-out'
          ? {
              type,
              origin,
              destination,
              departureDate,
              departureTime,
              timeAnchor,
              parkingDuration: computedParkingDuration,
              parkingCheckInDate,
              parkingCheckOutDate,
              transportAvailability,
              transitPayment,
              checkingBags,
              bagPlan,
              securityOption,
              flightType,
              cabin,
              checkedInAtAirport,
              airportCode,
            }
          : {
              type,
              origin,
              destination,
              airportCode,
              departureDate,
              departureTime,
              timeAnchor,
              parkingDuration: computedParkingDuration,
              parkingCheckInDate,
              parkingCheckOutDate,
              transportAvailability,
              transitPayment,
              checkedInAtAirport,
            };
    }
  } else if (type === 'one-way-arrival') {
    const arrivalDate = searchParams.get('arrivalDate') || '';
    const arrivalTime = searchParams.get('arrivalTime') || '';
    if (arrivalDate && arrivalTime && origin && destination) {
      data = {
        type,
        origin,
        destination,
        arrivalDate,
        arrivalTime,
        transportAvailability,
        transitPayment,
        airportCode,
        destinationKind: 'airport',
      };
    }
  } else if (type === 'round-trip') {
    const departureDate = searchParams.get('departureDate') || '';
    const departureTime = searchParams.get('departureTime') || '';
    const returnDate = searchParams.get('returnDate') || '';
    const returnTime = searchParams.get('returnTime') || '';
    if (departureDate && departureTime && returnDate && returnTime && origin && destination) {
      data = {
        type,
        origin,
        destination,
        departureDate,
        departureTime,
        returnDate,
        returnTime,
        parkingDuration,
        transportAvailability,
        transitPayment,
        airportCode,
        destinationKind: 'airport',
      };
    }
  } else if (type === 'dropoff-pickup') {
    const airportTripDate = searchParams.get('airportTripDate') || '';
    const airportTripTime = searchParams.get('airportTripTime') || '';
    if (airportTripDate && airportTripTime && origin && destination) {
      data = {
        type,
        origin,
        destination,
        airportTripDate,
        airportTripTime,
        transportAvailability,
        transitPayment,
        airportCode,
        destinationKind: 'airport',
      };
    }
  } else if (type === 'general-trip' || type === 'quick-go') {
    const arrivalDate = searchParams.get('arrivalDate') || '';
    const arrivalTime = searchParams.get('arrivalTime') || '';

    const destinationKindRaw = searchParams.get('destinationKind') || 'general';
    const destinationKind = [
      'airport',
      'office',
      'downtown',
      'stadium',
      'event',
      'hospital',
      'restaurant',
      'hotel',
      'general',
    ].includes(destinationKindRaw)
      ? (destinationKindRaw as TripData['destinationKind'])
      : 'general';

    const destinationName =
      searchParams.get('destinationName') ||
      searchParams.get('destination') ||
      destination;

    const parkingCheckInTime = searchParams.get('parkingCheckInTime') || '';
    const parkingCheckOutTime = searchParams.get('parkingCheckOutTime') || '';

    if (arrivalDate && arrivalTime && origin && destination) {
      data = {
        type: 'general-trip',
        origin,
        destination,
        destinationKind,
        destinationName,
        arrivalDate,
        arrivalTime,
        parkingDuration,
        parkingCheckInDate,
        parkingCheckInTime,
        parkingCheckOutDate,
        parkingCheckOutTime,
        transportAvailability,
        transitPayment,
      };
    }
  }

  if (data && !('airportCode' in data && data.airportCode)) {
    data = { ...data, airportCode, transitPayment } as TripData;
  } else if (data) {
    data = { ...data, airportCode, transitPayment } as TripData;
  }

  return data;
}

type TripDataWithExtras = TripData & {
  airportCode?: string;
  checkingBags?: boolean;
  bagPlan?: BagPlan;
  securityOption?: SecurityOption;
  flightType?: FlightType;
  cabin?: CabinClass;
  timeAnchor?: 'flight-departure' | 'airport-arrival';
  parkingCheckOutDate?: string;
  parkingCheckOutTime?: string;
  checkedInAtAirport?: boolean;
};

export function tripDataToSearchParams(
  data: TripData,
  options?: {
    intent?: string;
    preserve?: URLSearchParams;
  },
): URLSearchParams {
  const params = new URLSearchParams(options?.preserve?.toString() ?? '');
  const extras = data as TripDataWithExtras;

  params.set('type', data.type);
  params.set('origin', data.origin);
  params.set('transport', data.transportAvailability || 'all');
  params.set('transitPayment', data.transitPayment || 'normal');

  if (data.destinationKind) {
    params.set('destinationKind', data.destinationKind);
  }

  if (options?.preserve?.get('tripMode')) {
    params.set('tripMode', options.preserve.get('tripMode')!);
  }

  const isAirportTrip = data.type !== 'general-trip';

  if (isAirportTrip) {
    const airportCode = (
      extras.airportCode ||
      params.get('airportCode') ||
      params.get('airport') ||
      'SEA'
    ).toUpperCase();
    const selectedAirport = getAirportById(airportCode) || getAirportById('SEA')!;

    params.set('airportCode', selectedAirport.id);
    params.set('airport', selectedAirport.id);
    params.set('airportName', selectedAirport.label);
    params.set('destination', selectedAirport.routingAddress);
    params.set('rideshareDestinationName', selectedAirport.rideshareDestinationName);
    params.set('airportCheckinNote', selectedAirport.checkinNote || '');
    params.set('airportLat', String(selectedAirport.geoLocation.lat));
    params.set('airportLng', String(selectedAirport.geoLocation.lng));
  } else {
    params.set('destination', data.destination);
  }

  if (options?.intent) {
    params.set('intent', options.intent);
  } else if (!params.get('intent')) {
    params.set('intent', 'flying-out');
  }

  if (data.type === 'general-trip') {
    params.set('destinationName', data.destinationName || data.destination);
    params.set('arrivalDate', data.arrivalDate);
    params.set('arrivalTime', data.arrivalTime);
    params.set('parkingCheckInDate', data.parkingCheckInDate || data.arrivalDate);
    params.set('parkingCheckInTime', data.parkingCheckInTime || data.arrivalTime);
    if (data.parkingCheckOutDate) params.set('parkingCheckOutDate', data.parkingCheckOutDate);
    if (data.parkingCheckOutTime) params.set('parkingCheckOutTime', data.parkingCheckOutTime);
    if (data.parkingDuration) params.set('parkingDuration', String(data.parkingDuration));
    if (extras.timeAnchor) params.set('timeAnchor', extras.timeAnchor);
  } else if (data.type === 'one-way-departure') {
    params.set('departureDate', data.departureDate);
    params.set('departureTime', data.departureTime);
    params.set('parkingCheckInDate', data.parkingCheckInDate || data.departureDate);
    if (data.parkingCheckOutDate) params.set('parkingCheckOutDate', data.parkingCheckOutDate);
    if (extras.parkingCheckOutTime) params.set('parkingCheckOutTime', extras.parkingCheckOutTime);
    if (data.parkingDuration) params.set('parkingDuration', String(data.parkingDuration));
    if (extras.timeAnchor) params.set('timeAnchor', extras.timeAnchor);

    if (options?.intent === 'flying-out' || params.get('intent') === 'flying-out') {
      const resolvedBagPlan = resolveBagPlan({
        bagPlan: extras.bagPlan,
        checkingBags: extras.checkingBags,
      });
      params.set('bagPlan', resolvedBagPlan);
      params.set('bags', resolvedBagPlan === 'none' ? 'no' : 'yes');
      const securityOption = extras.securityOption || 'standard';
      params.set('securityOption', securityOption);
      params.set('security', securityOption);
      params.set('flightType', extras.flightType || 'domestic');
      params.set('cabin', extras.cabin || 'economy');
    }

    if (typeof extras.checkedInAtAirport === 'boolean') {
      params.set('checkedInAtAirport', extras.checkedInAtAirport ? 'yes' : 'no');
    }
  } else if (data.type === 'one-way-arrival') {
    params.set('arrivalDate', data.arrivalDate);
    params.set('arrivalTime', data.arrivalTime);
  } else if (data.type === 'round-trip') {
    params.set('departureDate', data.departureDate);
    params.set('departureTime', data.departureTime);
    params.set('returnDate', data.returnDate);
    params.set('returnTime', data.returnTime);
    if (data.parkingDuration) params.set('parkingDuration', String(data.parkingDuration));
  } else if (data.type === 'dropoff-pickup') {
    params.set('airportTripDate', data.airportTripDate);
    params.set('airportTripTime', data.airportTripTime);
  }

  params.set('recalc', String(Date.now()));

  return params;
}

export function buildResultsPathFromSearchParams(params: URLSearchParams): string {
  const tripId = storeTripSearchParams(params);
  return tripId
    ? `/results/${encodeURIComponent(tripId)}`
    : `/results?${params.toString()}`;
}
