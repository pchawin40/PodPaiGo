import { buildFavoriteTripName, intentFromSearchParams } from '../trip/favoriteTrips';
import type { TripData } from '../types';
import type { SavedTripInsert } from './types';

function parseLocalDateTime(date?: string, time?: string): string | null {
  if (!date?.trim()) return null;

  const normalizedTime = time?.trim() || '00:00';
  const parsed = new Date(`${date}T${normalizedTime}:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function resolveSavedTripDepartureAt(tripData: TripData): string | null {
  switch (tripData.type) {
    case 'general-trip':
      return parseLocalDateTime(tripData.arrivalDate, tripData.arrivalTime);
    case 'one-way-departure':
      return parseLocalDateTime(tripData.departureDate, tripData.departureTime);
    case 'one-way-arrival':
      return parseLocalDateTime(tripData.arrivalDate, tripData.arrivalTime);
    case 'round-trip':
      return parseLocalDateTime(tripData.departureDate, tripData.departureTime);
    case 'dropoff-pickup':
      return parseLocalDateTime(tripData.airportTripDate, tripData.airportTripTime);
    default:
      return null;
  }
}

export function resolveSavedTripReturnAt(tripData: TripData): string | null {
  if (tripData.type === 'round-trip') {
    return parseLocalDateTime(tripData.returnDate, tripData.returnTime);
  }

  return null;
}

export function buildSavedTripInsert(
  tripData: TripData,
  userId: string,
  options?: { intent?: string | null; tripName?: string },
): SavedTripInsert {
  const intent = intentFromSearchParams(options?.intent ?? null);
  const airportCode = tripData.airportCode?.toUpperCase() || null;

  const tripName =
    options?.tripName?.trim() ||
    buildFavoriteTripName({
      origin: tripData.origin,
      airportCode: airportCode || 'SEA',
      intent,
      destination: tripData.type === 'general-trip' ? tripData.destination : undefined,
    });

  return {
    user_id: userId,
    trip_name: tripName,
    origin_text: tripData.origin.trim(),
    destination_text: tripData.destination.trim(),
    airport_code: airportCode,
    departure_at: resolveSavedTripDepartureAt(tripData),
    return_at: resolveSavedTripReturnAt(tripData),
    trip_type: tripData.type,
    trip_payload: tripData,
  };
}
