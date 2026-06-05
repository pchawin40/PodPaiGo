import type { ParkingOption, TripData } from '../types';
import { calculateParkingDuration } from '../domain';

export type ParkingHandoffWindow = {
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  durationMinutes: number;
};

export type ParkingProviderHandoff = {
  lotName: string;
  providerName: string;
  providerUrl: string | null;
  providerUrlSupportsPrefill: boolean;
  window: ParkingHandoffWindow | null;
  copySummary: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } | null {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch || !Number.isFinite(minutes)) return null;

  const start = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + minutes * 60_000);
  return {
    date: `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`,
    time: `${pad2(end.getHours())}:${pad2(end.getMinutes())}`,
  };
}

function durationText(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function tripParkingWindow(tripData: TripData | null): ParkingHandoffWindow | null {
  if (!tripData) return null;

  const durationMinutes = calculateParkingDuration(tripData);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const checkInDate =
    tripData.parkingCheckInDate ||
    (tripData.type === 'general-trip'
      ? tripData.arrivalDate
      : tripData.type === 'one-way-departure' || tripData.type === 'round-trip'
        ? tripData.departureDate
        : tripData.type === 'one-way-arrival'
          ? tripData.arrivalDate
          : tripData.type === 'dropoff-pickup'
            ? tripData.airportTripDate
            : '');

  const checkInTime =
    tripData.parkingCheckInTime ||
    (tripData.type === 'general-trip'
      ? tripData.arrivalTime
      : tripData.type === 'one-way-departure' || tripData.type === 'round-trip'
        ? tripData.departureTime
        : tripData.type === 'one-way-arrival'
          ? tripData.arrivalTime
          : tripData.type === 'dropoff-pickup'
            ? tripData.airportTripTime
            : '');

  const checkOutDate =
    tripData.parkingCheckOutDate ||
    (tripData.type === 'round-trip' ? tripData.returnDate : '');

  const checkOutTime =
    tripData.parkingCheckOutTime ||
    (tripData.type === 'round-trip' ? tripData.returnTime : '');

  if (!checkInDate || !checkInTime) return null;

  const derivedCheckout =
    checkOutDate && checkOutTime ? null : addMinutes(checkInDate, checkInTime, durationMinutes);

  return {
    checkInDate,
    checkInTime,
    checkOutDate: checkOutDate || derivedCheckout?.date || '',
    checkOutTime: checkOutTime || derivedCheckout?.time || '',
    durationMinutes,
  };
}

function supportsProviderPrefill(url: string | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('parkwhiz.com') || lower.includes('airportparkingreservations.com');
}

function formatAprDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function withProviderWindowParams(url: string | null, window: ParkingHandoffWindow | null): string | null {
  if (!url || !window) return url;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('airportparkingreservations.com')) {
      parsed.searchParams.set('checkindate', formatAprDate(window.checkInDate));
      parsed.searchParams.set('checkoutdate', formatAprDate(window.checkOutDate));
      return parsed.toString();
    }

    return url;
  } catch {
    return url;
  }
}

export function buildParkingProviderHandoff(
  option: ParkingOption,
  tripData: TripData | null,
  providerUrl?: string | null,
): ParkingProviderHandoff {
  const window = tripParkingWindow(tripData);
  const resolvedUrl = withProviderWindowParams(providerUrl || option.sourceLink || null, window);
  const providerName = option.bookingProvider || option.sourceName || 'Provider';
  const windowLines = window
    ? [
        `Check-in: ${window.checkInDate} ${window.checkInTime}`,
        `Check-out: ${window.checkOutDate} ${window.checkOutTime}`,
        `Duration: ${durationText(window.durationMinutes)}`,
      ]
    : ['Parking window: check selected trip dates/times in PodPaiGo'];

  return {
    lotName: option.name,
    providerName,
    providerUrl: resolvedUrl,
    providerUrlSupportsPrefill: supportsProviderPrefill(resolvedUrl),
    window,
    copySummary: [
      `Lot: ${option.name}`,
      `Provider: ${providerName}`,
      ...windowLines,
      'Provider controls final price. Confirm at checkout.',
    ].join('\n'),
  };
}

export function formatParkingHandoffDuration(minutes: number): string {
  return durationText(minutes);
}
