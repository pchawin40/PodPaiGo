import { getAirportById } from '../airports/catalog';
import { normalizeAirlineTextForAssistant } from '../airlines/parseFlightInput';
import { buildQuickGoSearchParams } from '../trip/quickGo';
import type { ParsedTripAssistantResult } from './tripParseTypes';
import type { QuickGoOriginSelection } from '../trip/quickGo';

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

  const now = new Date();
  if (parsed.departureDate && parsed.departureTime) {
    const parsedNow = new Date(`${parsed.departureDate}T${parsed.departureTime}:00`);
    if (!Number.isNaN(parsedNow.getTime())) {
      now.setTime(parsedNow.getTime());
    }
  }

  const params = buildQuickGoSearchParams({
    destinationText,
    origin,
    continueAsQuickGo: true,
    now,
  });

  params.set('assistantParsed', '1');
  params.set('recalc', String(Date.now()));

  if (parsed.destinationCategory) {
    params.set('assistantDestinationCategory', parsed.destinationCategory);
  }

  return params;
}

export function parsedTripToSearchParams(
  parsed: ParsedTripAssistantResult,
  options?: { confirmed?: boolean },
): URLSearchParams | null {
  if (assistantRequiresConfirmation(options?.confirmed ?? false)) {
    return null;
  }

  if (parsed.mode === 'quick_go') {
    return parsedQuickGoToSearchParams(parsed);
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
  params.set('transport', 'all');
  params.set('transitPayment', 'normal');
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
