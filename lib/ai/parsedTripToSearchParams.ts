import { getAirportById } from '../airports/catalog';
import { normalizeAirlineTextForAssistant } from '../airlines/parseFlightInput';
import type { ParsedTripAssistantResult } from './tripParseTypes';
import type { QuickGoOriginSelection } from '../trip/quickGo';
import type { DestinationKind, ParkingPreference, TransportAvailability } from '../types';
import { resolveParkingWindow } from '../trip/parkingWindow';

function calculateParkingDurationMinutes(args: {
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
}): number | null {
  const start = new Date(`${args.checkInDate}T${args.checkInTime}:00`);
  const end = new Date(`${args.checkOutDate}T${args.checkOutTime}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return minutes > 0 ? minutes : null;
}

export function assistantRequiresConfirmation(confirmed: boolean): boolean {
  return !confirmed;
}

function buildQuickGoOriginFromParsed(
  parsed: ParsedTripAssistantResult,
): QuickGoOriginSelection | null {
  if (parsed.originSource === 'current_location') {
    return {
      origin: 'Current location',
      originLabel: 'Current location',
      originSource: 'geolocation',
    };
  }

  if (parsed.originText?.trim()) {
    return {
      origin: parsed.originText.trim(),
      originLabel: parsed.originText.trim(),
      originSource: parsed.originSource === 'saved' ? 'saved' : 'manual',
    };
  }

  return null;
}

function parsedQuickGoToSearchParams(
  parsed: ParsedTripAssistantResult,
): URLSearchParams | null {
  const destinationText = parsed.destinationText?.trim();
  if (!destinationText) return null;

  const origin = buildQuickGoOriginFromParsed(parsed);
  if (!origin) return null;

  const arrivalDate = parsed.departureDate;
  const arrivalTime = parsed.departureTime;
  if (!arrivalDate || !arrivalTime) return null;

  const transportAvailability: TransportAvailability = parsed.transportAvailability || 'all';
  const parkingPreference: ParkingPreference =
    parsed.parkingPreference ||
    (transportAvailability === 'rideshare' || transportAvailability === 'transit'
      ? 'none'
      : 'nearby');
  const parkingDuration = parsed.parkingDurationMinutes || 8 * 60;
  const parkingWindow = resolveParkingWindow({
    arrivalDate,
    arrivalTime,
    durationMinutes: parkingDuration,
    parkingCheckInDate: parsed.parkingCheckInDate,
    parkingCheckInTime: parsed.parkingCheckInTime,
    parkingCheckOutDate: parsed.parkingCheckOutDate,
    parkingCheckOutTime: parsed.parkingCheckOutTime,
  });
  const destinationKind: DestinationKind =
    parsed.destinationKind ||
    (parsed.destinationCategory === 'restaurant'
      ? 'restaurant'
      : parsed.destinationCategory === 'hotel'
        ? 'hotel'
        : 'general');

  const params = new URLSearchParams();
  params.set('type', 'general-trip');
  if (parsed.mode === 'quick_go') {
    params.set('tripMode', 'quick-go');
    params.set('quickGoConfirmed', '1');
  }
  params.set('origin', origin.origin);
  params.set('originLabel', origin.originLabel);
  params.set('originSource', origin.originSource);
  params.set('destination', destinationText);
  params.set('destinationName', destinationText);
  params.set('destinationLabel', destinationText);
  params.set('destinationAddress', destinationText);
  params.set('destinationSource', 'typed');
  params.set('destinationKind', destinationKind);
  params.set('intent', 'general-trip');
  params.set('transport', transportAvailability);
  params.set('transitPayment', 'normal');
  params.set('parkingPreference', parkingPreference);
  params.set('arrivalDate', arrivalDate);
  params.set('arrivalTime', arrivalTime);
  params.set('parkingCheckInDate', parkingWindow?.parkingCheckInDate || arrivalDate);
  params.set('parkingCheckInTime', parkingWindow?.parkingCheckInTime || arrivalTime);
  params.set('parkingCheckOutDate', parkingWindow?.parkingCheckOutDate || '');
  params.set('parkingCheckOutTime', parkingWindow?.parkingCheckOutTime || '');
  params.set('parkingDuration', String(parkingWindow?.parkingDuration ?? parkingDuration));

  params.set('assistantParsed', '1');
  params.set('recalc', String(Date.now()));

  if (parsed.destinationCategory) {
    params.set('assistantDestinationCategory', parsed.destinationCategory);
  }

  return params;
}

function parsedParkingOnlyToSearchParams(
  parsed: ParsedTripAssistantResult,
): URLSearchParams | null {
  if (
    !parsed.parkingCheckInDate ||
    !parsed.parkingCheckInTime ||
    !parsed.parkingCheckOutDate ||
    !parsed.parkingCheckOutTime
  ) {
    return null;
  }

  const airport = parsed.airportCode ? getAirportById(parsed.airportCode.toUpperCase()) : null;
  const destination = airport?.routingAddress || parsed.destinationText?.trim();
  if (!destination) return null;

  const origin = parsed.originText?.trim() || destination;
  const params = new URLSearchParams();
  params.set('type', 'one-way-departure');
  params.set('intent', airport ? 'parking-trip' : 'general-trip');
  params.set('origin', origin);
  params.set('destination', destination);
  params.set('transport', parsed.transportAvailability || 'car');
  params.set('transitPayment', 'normal');
  params.set('parkingPreference', parsed.parkingPreference || 'nearby');
  params.set('departureDate', parsed.parkingCheckInDate);
  params.set('departureTime', parsed.parkingCheckInTime);
  params.set('parkingCheckInDate', parsed.parkingCheckInDate);
  params.set('parkingCheckInTime', parsed.parkingCheckInTime);
  params.set('parkingCheckOutDate', parsed.parkingCheckOutDate);
  params.set('parkingCheckOutTime', parsed.parkingCheckOutTime);
  params.set('destinationKind', airport ? 'airport' : parsed.destinationKind || 'general');

  const parkingDuration =
    parsed.parkingDurationMinutes ||
    calculateParkingDurationMinutes({
      checkInDate: parsed.parkingCheckInDate,
      checkInTime: parsed.parkingCheckInTime,
      checkOutDate: parsed.parkingCheckOutDate,
      checkOutTime: parsed.parkingCheckOutTime,
    });

  if (parkingDuration) {
    params.set('parkingDuration', String(parkingDuration));
  }

  if (airport) {
    params.set('airport', airport.id);
    params.set('airportCode', airport.id);
    params.set('airportName', airport.label);
    params.set('rideshareDestinationName', airport.rideshareDestinationName);
    params.set('airportCheckinNote', airport.checkinNote || '');
  }

  params.set('assistantParsed', '1');
  params.set('recalc', String(Date.now()));

  return params;
}

export function parsedTripToSearchParams(
  parsed: ParsedTripAssistantResult,
  options?: { confirmed?: boolean },
): URLSearchParams | null {
  if (assistantRequiresConfirmation(options?.confirmed ?? false)) {
    return null;
  }

  if (parsed.mode === 'quick_go' || parsed.mode === 'general_trip') {
    return parsedQuickGoToSearchParams(parsed);
  }

  if (parsed.mode === 'parking_only') {
    return parsedParkingOnlyToSearchParams(parsed);
  }

  if (!parsed.originText?.trim() || !parsed.airportCode || !parsed.departureDate) {
    return null;
  }

  const airport = getAirportById(parsed.airportCode.toUpperCase());
  if (!airport) return null;

  const params = new URLSearchParams();
  const tripType = parsed.tripType === 'round-trip' ? 'round-trip' : 'one-way-departure';
  const intent = parsed.needsParking ? 'flying-out' : 'flying-out';
  const departureTime = parsed.departureTime || '12:00';
  const returnDate = parsed.returnDate || parsed.departureDate;
  const returnTime = parsed.returnTime || departureTime;

  params.set('type', tripType);
  params.set('origin', parsed.originText.trim());
  params.set('destination', airport.routingAddress);
  params.set('intent', intent);
  params.set('transport', parsed.transportAvailability || 'all');
  params.set('transitPayment', 'normal');
  params.set('parkingPreference', parsed.parkingPreference || 'nearby');
  params.set('destinationKind', 'airport');
  params.set('airport', airport.id);
  params.set('airportCode', airport.id);
  params.set('airportName', airport.label);
  params.set('rideshareDestinationName', airport.rideshareDestinationName);
  params.set('airportCheckinNote', airport.checkinNote || '');
  params.set('timeAnchor', 'flight-departure');

  if (parsed.destinationCity) {
    params.set('assistantDestinationCity', parsed.destinationCity);
  }

  if (parsed.airlineText?.trim()) {
    params.set(
      'airlineOrFlight',
      normalizeAirlineTextForAssistant(parsed.airlineText) || parsed.airlineText.trim(),
    );
  }

  if (tripType === 'round-trip') {
    params.set('departureDate', parsed.departureDate);
    params.set('departureTime', departureTime);
    params.set('returnDate', returnDate);
    params.set('returnTime', returnTime);
    params.set('parkingCheckInDate', parsed.departureDate);
    params.set('parkingCheckOutDate', returnDate);
    params.set('parkingCheckOutTime', returnTime);
  } else {
    params.set('departureDate', parsed.departureDate);
    params.set('departureTime', departureTime);
    params.set('parkingCheckInDate', parsed.departureDate);

    if (parsed.returnDate) {
      params.set('parkingCheckOutDate', parsed.returnDate);
      params.set('parkingCheckOutTime', returnTime);
    }
  }

  const parkingMinutes = calculateParkingDurationMinutes({
    checkInDate: parsed.departureDate,
    checkInTime: departureTime,
    checkOutDate: parsed.returnDate || parsed.departureDate,
    checkOutTime: returnTime,
  });

  if (parkingMinutes) {
    params.set('parkingDuration', String(parkingMinutes));
  } else if (parsed.needsParking) {
    params.set('parkingDuration', String(4 * 24 * 60));
  }

  params.set('bags', 'no');
  params.set('security', 'standard');
  params.set('securityOption', 'standard');
  params.set('flightType', 'domestic');
  params.set('cabin', 'economy');
  params.set('assistantParsed', '1');
  params.set('recalc', String(Date.now()));

  return params;
}
