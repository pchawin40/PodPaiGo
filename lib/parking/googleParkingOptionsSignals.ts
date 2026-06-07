import type { ParkingOption, TripData } from '../types';
import { evaluateLocalStreetParkingRules } from './localParkingRules';

export type GoogleParkingOptionsSignals = {
  freeStreetParking?: boolean;
  paidStreetParking?: boolean;
  freeParkingLot?: boolean;
  paidParkingLot?: boolean;
  freeGarageParking?: boolean;
  paidGarageParking?: boolean;
  valetParking?: boolean;
};

export type ParkingOptionsHint = {
  category: 'customer_lot' | 'street' | 'garage_paid' | 'valet' | 'unknown';
  label: string;
  detail?: string;
};

export type ParkingOptionsHintBundle = {
  hints: ParkingOptionsHint[];
  verifyNotice: string;
};

const VERIFY_NOTICE = 'Verify posted signs and lot rules.';

export function parseGoogleParkingOptionsSignals(
  raw: GoogleParkingOptionsSignals | null | undefined,
): GoogleParkingOptionsSignals | null {
  if (!raw || typeof raw !== 'object') return null;

  const signals: GoogleParkingOptionsSignals = {};
  for (const key of [
    'freeStreetParking',
    'paidStreetParking',
    'freeParkingLot',
    'paidParkingLot',
    'freeGarageParking',
    'paidGarageParking',
    'valetParking',
  ] as const) {
    if (raw[key] === true) signals[key] = true;
  }

  return Object.keys(signals).length > 0 ? signals : null;
}

export function inferParkingCategoryFromSignals(
  signals: GoogleParkingOptionsSignals | null | undefined,
): ParkingOptionsHint['category'] {
  if (!signals) return 'unknown';
  if (signals.freeParkingLot) return 'customer_lot';
  if (signals.freeStreetParking) return 'street';
  if (signals.paidGarageParking || signals.paidParkingLot || signals.paidStreetParking) {
    return 'garage_paid';
  }
  if (signals.valetParking) return 'valet';
  return 'unknown';
}

export function buildParkingOptionsHints(
  signals: GoogleParkingOptionsSignals | null | undefined,
  options?: { airportTrip?: boolean },
): ParkingOptionsHintBundle {
  const hints: ParkingOptionsHint[] = [];

  if (signals?.freeParkingLot) {
    hints.push({
      category: 'customer_lot',
      label: 'Free customer parking likely',
    });
  }

  if (signals?.freeStreetParking && !options?.airportTrip) {
    hints.push({
      category: 'street',
      label: 'Free street parking may be available nearby',
    });
  }

  if (
    signals?.paidStreetParking ||
    signals?.paidGarageParking ||
    signals?.paidParkingLot
  ) {
    hints.push({
      category: 'garage_paid',
      label: 'Paid parking likely',
    });
  }

  if (signals?.valetParking) {
    hints.push({
      category: 'valet',
      label: 'Valet parking may be available',
    });
  }

  return {
    hints,
    verifyNotice: VERIFY_NOTICE,
  };
}

export function streetParkingScorePenalty(
  option: ParkingOption,
  tripData?: TripData | null,
): number {
  const signals = option.googleParkingOptions;
  const category =
    option.parkingCategory || inferParkingCategoryFromSignals(signals);

  if (category !== 'street') return 0;

  const durationHours = (tripData?.parkingDuration ?? 120) / 60;
  let penalty = 18;

  if (durationHours >= 4) penalty += 24;
  if (durationHours >= 8) penalty += 20;

  if (tripData?.destinationKind === 'airport' || tripData?.type !== 'general-trip') {
    penalty += 5000;
  }

  if (tripData?.type === 'general-trip') {
    const arrivalDate =
      tripData.type === 'general-trip' ? tripData.arrivalDate : undefined;
    const arrivalTime =
      tripData.type === 'general-trip' ? tripData.arrivalTime : undefined;

    penalty += evaluateLocalStreetParkingRules({
      destination: tripData.destinationName || tripData.destination,
      arrivalDate,
      arrivalTime,
      durationMinutes: durationHours * 60,
      isAirportTrip: false,
    }).penalty;
  }

  return penalty;
}

export function shouldDeprioritizeStreetParking(
  option: ParkingOption,
  tripData?: TripData | null,
): boolean {
  return streetParkingScorePenalty(option, tripData) >= 5000;
}
