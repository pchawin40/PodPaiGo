import { getAirportById } from '../airports/catalog';
import { parseBagPlanParam, resolveBagPlan } from '../airports/bagPlan';
import type {
  BagPlan,
  CabinClass,
  FlightType,
  SecurityOption,
  TransportAvailability,
  TransitPaymentOption,
  ParkingPreference,
  TripData,
  TripType,
} from '../types';
import {
  deriveParkingWindowFromArrival,
  resolveParkingWindow,
} from './parkingWindow';

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function addMinutesToLocalDateTime(
  date: string,
  time: string,
  minutes: number,
): { date: string; time: string } | null {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch || !Number.isFinite(minutes)) return null;

  const start = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0,
    0,
  );

  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + minutes * 60_000);
  return {
    date: `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`,
    time: `${pad2(end.getHours())}:${pad2(end.getMinutes())}`,
  };
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
  const rawType = searchParams.get('type');
  const type = rawType as TripData['type'] | null;
  const origin = searchParams.get('origin') || '';
  const destination = searchParams.get('destination') || '';
  const airportCodeParam = (
    searchParams.get('airportCode') ||
    searchParams.get('airport') ||
    ''
  ).trim().toUpperCase();
  const airportCodeForAirportTrips = airportCodeParam || 'SEA';
  const parkingDurationStr = searchParams.get('parkingDuration');
  const parkingDuration = parkingDurationStr ? parseInt(parkingDurationStr, 10) : undefined;
  const parkingCheckInDate = searchParams.get('parkingCheckInDate') || '';
  const parkingCheckInTime = searchParams.get('parkingCheckInTime') || '';
  const parkingCheckOutDate = searchParams.get('parkingCheckOutDate') || '';
  const parkingCheckOutTime = searchParams.get('parkingCheckOutTime') || '';
  const originLatRaw = searchParams.get('originLat');
  const originLngRaw = searchParams.get('originLng');
  const originLat = originLatRaw ? Number(originLatRaw) : undefined;
  const originLng = originLngRaw ? Number(originLngRaw) : undefined;
  const destinationLatRaw = searchParams.get('destinationLat');
  const destinationLngRaw = searchParams.get('destinationLng');
  const destinationLat = destinationLatRaw ? Number(destinationLatRaw) : undefined;
  const destinationLng = destinationLngRaw ? Number(destinationLngRaw) : undefined;

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
  const parkingPreferenceRaw = searchParams.get('parkingPreference') || '';
  const parkingPreference: ParkingPreference | undefined = isOneOf(
    parkingPreferenceRaw,
    ['none', 'destination', 'nearby'] as const,
  )
    ? parkingPreferenceRaw
    : undefined;

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
    const departureDate =
      searchParams.get('departureDate') ||
      searchParams.get('flightDate') ||
      '';
    const departureTime = searchParams.get('departureTime') || '';

    let computedParkingDuration = parkingDuration;
    const resolvedParkingCheckInDate = parkingCheckInDate || departureDate;
    const resolvedParkingCheckInTime = parkingCheckInTime || departureTime;
    const resolvedParkingCheckOutDate = parkingCheckOutDate;
    const resolvedParkingCheckOutTime = parkingCheckOutTime || departureTime;

    if (!computedParkingDuration && resolvedParkingCheckInDate && resolvedParkingCheckOutDate) {
      const checkIn = new Date(`${resolvedParkingCheckInDate}T${resolvedParkingCheckInTime || '00:00'}`);
      const checkOut = new Date(`${resolvedParkingCheckOutDate}T${resolvedParkingCheckOutTime || '00:00'}`);
      if (!Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime())) {
        const diffMinutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
        if (diffMinutes > 0) {
          computedParkingDuration = parkingCheckInTime || parkingCheckOutTime
            ? diffMinutes
            : Math.max(24 * 60, diffMinutes);
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
              parkingCheckInDate: resolvedParkingCheckInDate,
              parkingCheckInTime: resolvedParkingCheckInTime,
              parkingCheckOutDate: resolvedParkingCheckOutDate,
              parkingCheckOutTime: resolvedParkingCheckOutTime,
              transportAvailability,
              transitPayment,
              parkingPreference,
              checkingBags,
              bagPlan,
              securityOption,
              flightType,
              cabin,
              checkedInAtAirport,
              airportCode: airportCodeForAirportTrips,
            }
          : {
              type,
              origin,
              destination,
              airportCode: airportCodeForAirportTrips,
              departureDate,
              departureTime,
              timeAnchor,
              parkingDuration: computedParkingDuration,
              parkingCheckInDate: resolvedParkingCheckInDate,
              parkingCheckInTime: resolvedParkingCheckInTime,
              parkingCheckOutDate: resolvedParkingCheckOutDate,
              parkingCheckOutTime: resolvedParkingCheckOutTime,
              transportAvailability,
              transitPayment,
              parkingPreference,
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
        parkingPreference,
        airportCode: airportCodeForAirportTrips,
        destinationKind: 'airport',
      };
    }
  } else if (type === 'round-trip') {
    const departureDate = searchParams.get('departureDate') || '';
    const departureTime = searchParams.get('departureTime') || '';
    const returnDate = searchParams.get('returnDate') || '';
    const returnTime = searchParams.get('returnTime') || '';
    const resolvedParkingCheckInDate = parkingCheckInDate || departureDate;
    const resolvedParkingCheckInTime = parkingCheckInTime || departureTime;
    const resolvedParkingCheckOutDate = parkingCheckOutDate || returnDate;
    const resolvedParkingCheckOutTime = parkingCheckOutTime || returnTime;
    const computedParkingDuration = parkingDuration ?? (() => {
      const checkIn = new Date(`${resolvedParkingCheckInDate}T${resolvedParkingCheckInTime}`);
      const checkOut = new Date(`${resolvedParkingCheckOutDate}T${resolvedParkingCheckOutTime}`);
      if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return undefined;
      const diffMinutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
      return diffMinutes > 0 ? diffMinutes : undefined;
    })();

    if (departureDate && departureTime && returnDate && returnTime && origin && destination) {
      data = {
        type,
        origin,
        destination,
        departureDate,
        departureTime,
        returnDate,
        returnTime,
        parkingDuration: computedParkingDuration,
        parkingCheckInDate: resolvedParkingCheckInDate,
        parkingCheckInTime: resolvedParkingCheckInTime,
        parkingCheckOutDate: resolvedParkingCheckOutDate,
        parkingCheckOutTime: resolvedParkingCheckOutTime,
        transportAvailability,
        transitPayment,
        parkingPreference,
        airportCode: airportCodeForAirportTrips,
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
        parkingPreference,
        airportCode: airportCodeForAirportTrips,
        destinationKind: 'airport',
      };
    }
  } else if (type === 'general-trip' || rawType === 'quick-go') {
    const arrivalDate = searchParams.get('arrivalDate') || '';
    const arrivalTime = searchParams.get('arrivalTime') || '';
    const tripMode = rawType === 'quick-go' || searchParams.get('tripMode') === 'quick-go'
      ? 'quick-go'
      : undefined;

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

    const resolvedParkingDuration =
      parkingDuration ?? (tripMode === 'quick-go' ? 2 * 60 : 8 * 60);
    const parkingWindow = resolveParkingWindow({
      arrivalDate,
      arrivalTime,
      durationMinutes: resolvedParkingDuration,
      parkingCheckInDate,
      parkingCheckInTime,
      parkingCheckOutDate,
      parkingCheckOutTime,
    });

    if (arrivalDate && arrivalTime && origin && destination) {
      data = {
        type: 'general-trip',
        origin,
        destination,
        destinationKind,
        destinationName,
        arrivalDate,
        arrivalTime,
        tripMode,
        parkingDuration: parkingWindow?.parkingDuration ?? resolvedParkingDuration,
        parkingCheckInDate: parkingWindow?.parkingCheckInDate || arrivalDate,
        parkingCheckInTime: parkingWindow?.parkingCheckInTime || arrivalTime,
        parkingCheckOutDate: parkingWindow?.parkingCheckOutDate || '',
        parkingCheckOutTime: parkingWindow?.parkingCheckOutTime || '',
        destinationLat: Number.isFinite(destinationLat) ? destinationLat : undefined,
        destinationLng: Number.isFinite(destinationLng) ? destinationLng : undefined,
        transportAvailability,
        transitPayment,
        parkingPreference,
      };
    }
  }

  if (data) {
    data = { ...data, transitPayment } as TripData;

    if (
      typeof originLat === 'number' &&
      Number.isFinite(originLat) &&
      typeof originLng === 'number' &&
      Number.isFinite(originLng)
    ) {
      data = { ...data, originLat, originLng };
    }

    const isAirportStyleTrip =
      data.destinationKind === 'airport' ||
      data.type === 'one-way-departure' ||
      data.type === 'one-way-arrival' ||
      data.type === 'round-trip' ||
      data.type === 'dropoff-pickup';

    if (isAirportStyleTrip) {
      const resolvedCode =
        ('airportCode' in data && data.airportCode) || airportCodeForAirportTrips;
      data = { ...data, airportCode: resolvedCode };
    }

    if (process.env.NODE_ENV !== 'production') {
      const parsed = data as TripDataWithExtras;
      console.debug('parsed_trip_data_summary', {
        type: parsed.type,
        hasOrigin: Boolean(parsed.origin),
        hasDestination: Boolean(parsed.destination),
        destinationKind: parsed.destinationKind,
        transportAvailability: parsed.transportAvailability,
        transitPayment: parsed.transitPayment,
        parkingPreference: parsed.parkingPreference,
        airportCode: parsed.airportCode,
        arrivalDate: parsed.type === 'general-trip' || parsed.type === 'one-way-arrival'
          ? parsed.arrivalDate
          : undefined,
        arrivalTime: parsed.type === 'general-trip' || parsed.type === 'one-way-arrival'
          ? parsed.arrivalTime
          : undefined,
        departureDate: parsed.type === 'one-way-departure' || parsed.type === 'round-trip'
          ? parsed.departureDate
          : undefined,
        departureTime: parsed.type === 'one-way-departure' || parsed.type === 'round-trip'
          ? parsed.departureTime
          : undefined,
        parkingCheckInDate: parsed.parkingCheckInDate,
        parkingCheckInTime: parsed.parkingCheckInTime,
        parkingCheckOutDate: parsed.parkingCheckOutDate,
        parkingCheckOutTime: parsed.parkingCheckOutTime,
        parkingDuration: parsed.parkingDuration,
        hasOriginCoords:
          typeof parsed.originLat === 'number' && typeof parsed.originLng === 'number',
        hasDestinationCoords:
          typeof parsed.destinationLat === 'number' && typeof parsed.destinationLng === 'number',
      });
    }
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
  parkingCheckInTime?: string;
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
  if (typeof data.originLat === 'number' && Number.isFinite(data.originLat)) {
    params.set('originLat', String(data.originLat));
  } else {
    params.delete('originLat');
  }
  if (typeof data.originLng === 'number' && Number.isFinite(data.originLng)) {
    params.set('originLng', String(data.originLng));
  } else {
    params.delete('originLng');
  }
  params.set('transport', data.transportAvailability || 'all');
  params.set('transitPayment', data.transitPayment || 'normal');
  if (data.parkingPreference) {
    params.set('parkingPreference', data.parkingPreference);
  } else {
    params.delete('parkingPreference');
  }

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
    if (typeof data.destinationLat === 'number' && Number.isFinite(data.destinationLat)) {
      params.set('destinationLat', String(data.destinationLat));
    } else {
      params.delete('destinationLat');
    }
    if (typeof data.destinationLng === 'number' && Number.isFinite(data.destinationLng)) {
      params.set('destinationLng', String(data.destinationLng));
    } else {
      params.delete('destinationLng');
    }
  }

  if (options?.intent) {
    params.set('intent', options.intent);
  } else if (!params.get('intent')) {
    params.set('intent', 'flying-out');
  }

  if (data.type === 'general-trip') {
    const parkingDurationMinutes = data.parkingDuration ?? (data.tripMode === 'quick-go' ? 2 * 60 : 8 * 60);
    const parkingWindow =
      resolveParkingWindow({
        arrivalDate: data.arrivalDate,
        arrivalTime: data.arrivalTime,
        durationMinutes: parkingDurationMinutes,
        parkingCheckInDate: data.parkingCheckInDate,
        parkingCheckInTime: data.parkingCheckInTime,
        parkingCheckOutDate: data.parkingCheckOutDate,
        parkingCheckOutTime: data.parkingCheckOutTime,
      }) ??
      deriveParkingWindowFromArrival(data.arrivalDate, data.arrivalTime, parkingDurationMinutes);

    params.set('destinationName', data.destinationName || data.destination);
    params.set('arrivalDate', data.arrivalDate);
    params.set('arrivalTime', data.arrivalTime);
    if (data.tripMode) params.set('tripMode', data.tripMode);
    else params.delete('tripMode');
    params.set('parkingCheckInDate', parkingWindow?.parkingCheckInDate || data.arrivalDate);
    params.set('parkingCheckInTime', parkingWindow?.parkingCheckInTime || data.arrivalTime);
    params.set('parkingCheckOutDate', parkingWindow?.parkingCheckOutDate || '');
    params.set('parkingCheckOutTime', parkingWindow?.parkingCheckOutTime || '');
    params.set('parkingDuration', String(parkingWindow?.parkingDuration ?? parkingDurationMinutes));
    if (extras.timeAnchor) params.set('timeAnchor', extras.timeAnchor);
  } else if (data.type === 'one-way-departure') {
    params.set('departureDate', data.departureDate);
    params.set('departureTime', data.departureTime);
    params.set('parkingCheckInDate', data.parkingCheckInDate || data.departureDate);
    params.set('parkingCheckInTime', data.parkingCheckInTime || data.departureTime);
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
    params.set('parkingCheckInDate', data.parkingCheckInDate || data.departureDate);
    params.set('parkingCheckInTime', data.parkingCheckInTime || data.departureTime);
    params.set('parkingCheckOutDate', data.parkingCheckOutDate || data.returnDate);
    params.set('parkingCheckOutTime', data.parkingCheckOutTime || data.returnTime);
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
