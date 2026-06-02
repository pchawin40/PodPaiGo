'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddressInput } from './AddressInput';
import {
  CabinClass,
  FlightType,
  SecurityOption,
  TransportAvailability,
  TransitPaymentOption,
  TripData,
  TripType,
  DestinationKind,
  BagPlan,
} from '../../lib/types';
import { resolveSeatacCheckinZone } from '../../lib/airports/seatacCheckin';
import { getAirportById } from '../../lib/airports/catalog';
import AirportSearchPicker from '../components/AirportSearchPicker';
import AirlineLookupPanel from '../components/AirlineLookupPanel';
import AirlineCombobox from '../components/AirlineCombobox';
import { normalizeAirlineTextForTrip } from '../../lib/airlines/parseFlightInput';
import { parseLocalDate } from '../../lib/tripTime';
import { estimateParkingDays } from '../../lib/tripTime';
import { formatMoney } from '../utils/formatter';
import { calculateAirportReadinessBuffer } from '../../lib/airports/airportReadiness';
import TransitPaymentPicker from '../components/TransitPaymenPicker';
import { buildResultsPathFromSearchParams } from '../../lib/trip/searchParams';
import SavedTripsPanel from '../components/SavedTripsPanel';
import SaveFavoriteTripButton from '../components/SaveFavoriteTripButton';
import type { RecommendationSortMode } from '../../lib/domain';
import type { FavoriteTripIntent } from '../../lib/trip/favoriteTrips';

type Intent =
  | 'general-trip'
  | 'flying-out'
  | 'picking-up'
  | 'dropping-off'
  | 'parking-trip';

type Step = 1 | 2;

type SecurityLaneKey = 'standard' | 'precheck' | 'clear' | 'clearPrecheck';

type AirportSecurityStatus = {
  airportCode: string;
  sourceName: string;
  trustStatus: 'live' | 'estimated' | 'unavailable';
  lanes: Record<
    SecurityLaneKey,
    {
      available: boolean;
      waitMinutes?: number;
      note?: string;
    }
  >;
};

type FormState = {
  intent: Intent | null;
  transportAvailability: TransportAvailability;
  transitPayment: TransitPaymentOption;
  airlineOrFlight: string;
  origin: string;
  date: string;
  time: string;
  parkingCheckOutDate: string;
  parkingCheckOutTime: string;
  parkingDurationHours: string;
  bagPlan: BagPlan;
  securityOption: SecurityOption;
  flightType: FlightType;
  cabin: CabinClass;
  airportCode: string; // selected Washington airport for routing and airport guidance
  timeAnchor: 'flight-departure' | 'airport-arrival';
  destination: string;
  destinationKind: DestinationKind;
};

function formatLocalDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parkingTripTotalText(
  option: { price?: number },
  tripData: TripData | null
): string | null {
  if (typeof option.price !== 'number' || option.price <= 0) return null;

  const days = estimateParkingDays(tripData);
  const total = option.price * days;

  if (days <= 1) return `Est. total: ${formatMoney(total)} for 1 day`;

  return `Est. total: ${formatMoney(total)} for ${days} days`;
}

function isFullDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeDateInputValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);

  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : us
      ? { year: Number(us[3]), month: Number(us[1]), day: Number(us[2]) }
      : null;

  if (!parts) return null;

  const { year, month, day } = parts;
  if (![year, month, day].every(Number.isFinite)) return null;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return formatLocalDateInputValue(parsed);
}

function calendarDateValue(value: string): string {
  return normalizeDateInputValue(value) ?? '';
}

function addDays(dateString: string, days: number): string {
  const parsed = parseLocalDate(dateString);
  if (!parsed) return dateString;
  parsed.setDate(parsed.getDate() + days);
  return formatLocalDateInputValue(parsed);
}

function buildLocalDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null;

  const value = new Date(`${date}T${time}`);

  if (Number.isNaN(value.getTime())) return null;

  return value;
}

function formatLocalTimeInputValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function addMinutesToLocalDateTime(
  date: string,
  time: string,
  minutes: number
): { date: string; time: string } | null {
  const start = buildLocalDateTime(date, time);
  if (!start || !Number.isFinite(minutes)) return null;

  const end = new Date(start.getTime() + minutes * 60_000);

  return {
    date: formatLocalDateInputValue(end),
    time: formatLocalTimeInputValue(end),
  };
}

function calculateParkingDurationMinutes({
  checkInDate,
  checkInTime,
  checkOutDate,
  checkOutTime,
}: {
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
}): number | null {
  const checkIn = buildLocalDateTime(checkInDate, checkInTime);
  const checkOut = buildLocalDateTime(checkOutDate, checkOutTime);

  if (!checkIn || !checkOut) return null;

  const minutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);

  return Math.max(24 * 60, minutes);
}

function intentToTripType(intent: Intent): TripType {
  switch (intent) {
    case 'general-trip':
      return 'general-trip';
    case 'flying-out':
      return 'one-way-departure';
    case 'parking-trip':
      return 'one-way-departure';
    case 'picking-up':
      return 'dropoff-pickup';
    case 'dropping-off':
      return 'dropoff-pickup';
  }
}

function intentCopy(intent: Intent) {
  switch (intent) {
    case 'flying-out':
      return {
        title: 'Flying out',
        timeLabel: 'When does your flight leave?',
        helper: 'Use your scheduled airline departure time.',
        wantsAirline: true,
        wantsParkingDuration: true,
      };
    case 'picking-up':
      return {
        title: 'Picking someone up',
        timeLabel: "When does their flight arrive?",
        helper: 'Use their scheduled arrival time. We’ll estimate when you should leave.',
        wantsAirline: false,
        wantsParkingDuration: false,
      };
    case 'dropping-off':
      return {
        title: 'Dropping someone off',
        timeLabel: 'When do they need to arrive at the airport?',
        helper: "Use the time they need to be at the airport; we'll estimate when you should leave.",
        wantsAirline: false,
        wantsParkingDuration: false,
      };
    case 'parking-trip':
      return {
        title: 'Airport parking',
        timeLabel: 'When do you want to arrive at the airport?',
        helper: 'We’ll compare official garage vs nearby lots and rides.',
        wantsAirline: false,
        wantsParkingDuration: true,
      };
    case 'general-trip':
      return {
        title: 'Compare a local trip',
        timeLabel: 'When do you need to arrive?',
        helper: 'Compare driving, parking, rideshare, transit, and park & ride where available.',
        wantsAirline: false,
        wantsParkingDuration: true,
      };
  }
}

function securityLaneKey(option: SecurityOption): SecurityLaneKey {
  if (option === 'clear-precheck') return 'clearPrecheck';
  return option;
}

function securityHintText(
  option: SecurityOption,
  status: AirportSecurityStatus | null
): string {
  if (!status) return 'Checking availability...';

  const lane = status.lanes[securityLaneKey(option)];

  if (!lane) return 'Availability unknown';

  const waitText =
    typeof lane.waitMinutes === 'number'
      ? ` · about ${lane.waitMinutes} min`
      : '';

  if (!lane.available) return 'Not confirmed here';

  if (option === 'clear-precheck') {
    if (status.trustStatus === 'live') return `Fastest eligible${waitText} live`;
    if (status.trustStatus === 'estimated') return `Fastest eligible${waitText} estimated`;
    return `Fastest eligible${waitText}`;
  }

  if (option === 'clear') {
    if (status.trustStatus === 'live') return `Available${waitText} live`;
    if (status.trustStatus === 'estimated') return `Available${waitText} estimated`;
    return `Available${waitText}`;
  }

  if (status.trustStatus === 'live') return `Available${waitText} live`;
  if (status.trustStatus === 'estimated') return `Available${waitText} estimated`;
  return `Usually available${waitText}`;
}

function Card({
  title,
  subtitle,
  selected,
  onClick,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        `group w-full rounded-2xl border p-4 text-left shadow-sm transition sm:p-5 ` +
        (selected
          ? 'border-blue-500 bg-blue-50 shadow-blue-900/10'
          : 'border-slate-200 bg-white/95 hover:border-sky-200 hover:bg-sky-50/40')
      }
    >
      <div className="text-base font-semibold text-zinc-900">{title}</div>
      <div className="mt-1 text-sm text-zinc-600">{subtitle}</div>
      <div className={
        `mt-4 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ` +
        (selected ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-700 group-hover:bg-zinc-200')
      }>
        {selected ? 'Selected' : 'Choose'}
      </div>
    </button>
  );
}


export default function TripFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [highlightedField, setHighlightedField] = useState<string | null>(null);

  const [parkingCheckoutTouched, setParkingCheckoutTouched] = useState(false);

  // track if user manually interacted with time input
  const [timeTouched, setTimeTouched] = useState(false);

  const [airportSecurityStatus, setAirportSecurityStatus] =
    useState<AirportSecurityStatus | null>(null);

  const [state, setState] = useState<FormState>({
    intent: 'general-trip',
    timeAnchor: 'flight-departure',
    transportAvailability: 'all',
    transitPayment: 'normal',
    airlineOrFlight: '',
    origin: '',
    date: '',
    time: '',
    parkingCheckOutDate: '',
    parkingCheckOutTime: '',
    parkingDurationHours: '8',
    bagPlan: 'none',
    securityOption: 'standard',
    flightType: 'domestic',
    cabin: 'economy',
    airportCode: 'SEA',
    destination: '',
    destinationKind: 'general',
  });
  const intent = state.intent;
  const isGeneralTrip = intent === 'general-trip';
  const isAirportTrip = !isGeneralTrip;

  const ENABLE_AIRPORT_TIMING_FIELDS = false;
  const showTimingFields = ENABLE_AIRPORT_TIMING_FIELDS || intent !== 'parking-trip';

  const selectedAirport = useMemo(() => {
    return getAirportById(state.airportCode) || getAirportById('SEA')!;
  }, [state.airportCode]);

  const airportGuide = useMemo(() => {
    const wantsAirline = intent ? intentCopy(intent).wantsAirline : false;
    const airlineOrFlight = state.airlineOrFlight.trim();

    if (selectedAirport.id === 'SEA' && wantsAirline && airlineOrFlight) {
      const seaTacZone = resolveSeatacCheckinZone(airlineOrFlight);

      return {
        destination: seaTacZone.destination,
        note: seaTacZone.note,
        rideshareDestinationName: selectedAirport.rideshareDestinationName,
      };
    }

    return {
      destination: selectedAirport.routingAddress,
      note:
        selectedAirport.checkinNote ||
        selectedAirport.genericGuidance ||
        `Use your airline app or airport display to confirm check-in area for ${selectedAirport.id}.`,
      rideshareDestinationName: selectedAirport.rideshareDestinationName,
    };
  }, [intent, selectedAirport, state.airlineOrFlight]);

  const validate = (forStep: Step): string[] => {
    const next: string[] = [];
    const normalizedDate = normalizeDateInputValue(state.date);
    const normalizedParkingCheckOutDate = state.parkingCheckOutDate
      ? normalizeDateInputValue(state.parkingCheckOutDate)
      : null;

    // Step 1 only chooses intent.
    if (forStep === 1) {
      if (!state.intent) next.push('Please choose what you’re doing today.');
      return next;
    }

    // Step 2 validates the full form.
    if (!state.intent) next.push('Please choose what you’re doing today.');
    if (!state.origin.trim()) next.push('Origin is required.');

    if (state.intent === 'general-trip' && !state.destination.trim()) {
      next.push('Destination is required.');
    }

    // Parking check-in/check-out required for date-range flows
    if (!state.date) {
      next.push(state.intent === 'general-trip' ? 'Trip date is required.' : 'Parking check-in date is required.');
    } else if (!normalizedDate) {
      next.push(state.intent === 'general-trip' ? 'Enter the trip date as MM/DD/YYYY or YYYY-MM-DD.' : 'Enter the parking check-in date as MM/DD/YYYY or YYYY-MM-DD.');
    }

    if (ENABLE_AIRPORT_TIMING_FIELDS && state.intent !== 'parking-trip' && !state.time) {
      next.push('Time is required.');
    }

    // Optional check-out date
    if (state.parkingCheckOutDate && !normalizedParkingCheckOutDate) {
      next.push('Enter the parking check-out date as MM/DD/YYYY or YYYY-MM-DD.');
    }

    // If both present, validate combined datetime against now
    if (normalizedDate && state.time) {
      const combined = new Date(`${normalizedDate}T${state.time}`);
      const now = new Date();
      if (isNaN(combined.getTime())) {
        next.push('Invalid date or time');
      } else if (combined.getTime() < now.getTime()) {
        next.push('Trip time cannot be in the past.');
      }
    }

    if (normalizedDate && normalizedParkingCheckOutDate) {
      const checkInTime = state.time || '12:00';
      const checkOutTime = state.parkingCheckOutTime || checkInTime;

      const checkIn = buildLocalDateTime(normalizedDate, checkInTime);
      const checkOut = buildLocalDateTime(normalizedParkingCheckOutDate, checkOutTime);

      if (!checkIn || !checkOut) {
        next.push('Parking check-in/check-out time is invalid.');
      } else if (checkOut.getTime() <= checkIn.getTime()) {
        next.push('Parking checkout must be after parking check-in.');
      }
    }

    // Airline/flight is helpful but optional for flying-out; do not block submission if blank
    if (intent && intentCopy(intent).wantsAirline && intent !== 'flying-out') {
      if (!state.airlineOrFlight.trim()) {
        next.push('Airline or flight number is required.');
      }
    }

    if (intent && intentCopy(intent).wantsParkingDuration) {
      if (state.parkingDurationHours) {
        const hours = Number(state.parkingDurationHours);
        if (!Number.isFinite(hours) || hours <= 0) {
          next.push('Parking duration must be a positive number of hours.');
        }
      }
    }

    return next;
  };

  const onContinue = () => {
    const next = validate(1);
    setErrors(next);

    if (next.length > 0) return;
    setFieldErrors({});

    // Friendly defaults when entering step 2.
    setState((s) => {
      const now = new Date();
      const yyyyMmDd = formatLocalDateInputValue(now);

      // If date already set keep it; otherwise default to today for all intents
      const nextDate = s.date || yyyyMmDd;

      // Default time behavior depends on intent
      let nextTime = s.time; // preserve if already provided

      if (!nextTime) {
        if (state.intent === 'general-trip') {
          const d = new Date();
          d.setMinutes(d.getMinutes() + 60);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          nextTime = `${hh}:${mm}`;
        } else if (state.intent === 'flying-out') {
          // keep time blank for flying out to avoid confusion
          nextTime = '';
        } else if (state.intent === 'picking-up' || state.intent === 'parking-trip') {
          // now + 60 minutes
          const d = new Date();
          d.setMinutes(d.getMinutes() + 60);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          nextTime = `${hh}:${mm}`;
        } else if (state.intent === 'dropping-off') {
          // now + 90 minutes
          const d = new Date();
          d.setMinutes(d.getMinutes() + 90);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          nextTime = `${hh}:${mm}`;
        }
      }

      return {
        ...s,
        date: nextDate,
        time: nextTime,
        parkingCheckOutDate:
          s.intent !== 'general-trip' && !parkingCheckoutTouched && isFullDate(nextDate)
            ? addDays(nextDate, 7)
            : s.parkingCheckOutDate,
        parkingDurationHours:
          s.intent === 'general-trip' && !s.parkingDurationHours
            ? '8'
            : s.parkingDurationHours,
      };
    });

    // Do not mark timeTouched when we programmatically set defaults
    setStep(2);
  };

  const onBack = () => {
    setErrors([]);
    setStep(1);
  };

  const scrollToField = (field: string) => {
    setHighlightedField(field);

    requestAnimationFrame(() => {
      document.getElementById(`${field}-field`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    setTimeout(() => setHighlightedField(null), 2200);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const next = validate(2);

    const normalizedDate = normalizeDateInputValue(state.date);
    const normalizedParkingCheckOutDate = state.parkingCheckOutDate
      ? normalizeDateInputValue(state.parkingCheckOutDate)
      : null;

    const nextFieldErrors: Record<string, string> = {};

    if (!state.origin.trim()) {
      nextFieldErrors.origin = 'Enter your starting address.';
    }

    if (!state.date) {
      next.push(state.intent === 'general-trip' ? 'Trip date is required.' : 'Parking check-in date is required.');
    } else if (!normalizedDate) {
      next.push(state.intent === 'general-trip' ? 'Enter the trip date as MM/DD/YYYY or YYYY-MM-DD.' : 'Enter the parking check-in date as MM/DD/YYYY or YYYY-MM-DD.');
    }

    if (!state.time) {
      nextFieldErrors.time = 'Select your flight or trip time.';
    }

    if (state.parkingCheckOutDate && !normalizedParkingCheckOutDate) {
      nextFieldErrors.parkingCheckOutDate = 'Use MM/DD/YYYY or YYYY-MM-DD.';
    }

    // Make "past trip" error point to the date/time fields
    if (normalizedDate && state.time) {
      const combined = new Date(`${normalizedDate}T${state.time}`);
      const now = new Date();

      if (Number.isNaN(combined.getTime())) {
        nextFieldErrors.date =
          state.intent === 'general-trip'
            ? 'Trip date is invalid.'
            : 'Parking check-in date is invalid.';

        nextFieldErrors.time =
          state.intent === 'general-trip'
            ? 'Arrival time is invalid.'
            : 'Flight or trip time is invalid.';
      } else if (combined.getTime() < now.getTime()) {
        nextFieldErrors.date =
          state.intent === 'general-trip'
            ? 'Trip date/time cannot be in the past.'
            : 'Parking check-in date/time cannot be in the past.';

        nextFieldErrors.time =
          state.intent === 'general-trip'
            ? 'Arrival time cannot be in the past.'
            : 'Flight or trip time cannot be in the past.';
      }
    }

    // Make checkout ordering error point to checkout field
    if (normalizedDate && normalizedParkingCheckOutDate) {
      const checkInTime = state.time || '12:00';
      const checkOutTime = state.parkingCheckOutTime || checkInTime;

      const checkIn = buildLocalDateTime(normalizedDate, checkInTime);
      const checkOut = buildLocalDateTime(normalizedParkingCheckOutDate, checkOutTime);

      if (!checkIn || !checkOut) {
        nextFieldErrors.parkingCheckOutDate = 'Parking check-in/check-out time is invalid.';
      } else if (checkOut.getTime() <= checkIn.getTime()) {
        nextFieldErrors.parkingCheckOutDate = 'Parking checkout must be after parking check-in.';
      }
    }

    if (state.intent === 'general-trip' && !state.destination.trim()) {
      nextFieldErrors.destination = 'Enter where you are going.';
    }

    setErrors(next);
    setFieldErrors(nextFieldErrors);

    const firstFieldError = Object.keys(nextFieldErrors)[0];

    if (next.length > 0 || firstFieldError) {
      if (firstFieldError) {
        scrollToField(firstFieldError);
      } else {
        requestAnimationFrame(() => {
          document.getElementById('trip-error-summary')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        });
      }
      return;
    }

    setFieldErrors({});
    setState((s) => ({
      ...s,
      date: normalizedDate!,
      parkingCheckOutDate: normalizedParkingCheckOutDate ?? s.parkingCheckOutDate,
    }));

    const tripType = intentToTripType(state.intent!);
    const isGeneralTrip = state.intent === 'general-trip';

    const destination = isGeneralTrip
      ? state.destination.trim()
      : airportGuide.destination;

    const params = new URLSearchParams();

    params.set('type', tripType);
    params.set('origin', state.origin);
    params.set('destination', destination);
    params.set('intent', state.intent!);
    params.set('transport', state.transportAvailability);
    params.set('transitPayment', state.transitPayment);
    params.set('destinationKind', isGeneralTrip ? state.destinationKind : 'airport');

    if (isGeneralTrip) {
      params.set('destinationName', state.destination.trim());
      params.set('timeAnchor', 'arrival-time');
    } else {
      params.set('airport', selectedAirport.id);
      params.set('airportCode', selectedAirport.id);
      params.set('airportName', selectedAirport.label);
      params.set('airportCheckinNote', airportGuide.note ?? '');
      params.set('rideshareDestinationName', airportGuide.rideshareDestinationName);
      params.set('timeAnchor', state.timeAnchor);
    }

    if (state.airlineOrFlight.trim()) {
      params.set('airlineOrFlight', normalizeAirlineTextForTrip(state.airlineOrFlight) || state.airlineOrFlight.trim());
    }

    if (tripType === 'general-trip') {
      const arrivalTime = state.time || '09:00';

      params.set('arrivalDate', normalizedDate!);
      params.set('arrivalTime', arrivalTime);

      params.set('parkingCheckInDate', normalizedDate!);
      params.set('parkingCheckInTime', arrivalTime);

      const hours = state.parkingDurationHours
        ? Number(state.parkingDurationHours)
        : 8;

      const minutes = Math.round(hours * 60);

      if (Number.isFinite(minutes) && minutes > 0) {
        params.set('parkingDuration', String(minutes));

        const checkout = addMinutesToLocalDateTime(
          normalizedDate!,
          arrivalTime,
          minutes
        );

        if (checkout) {
          params.set('parkingCheckOutDate', checkout.date);
          params.set('parkingCheckOutTime', checkout.time);
        }
      }
    } else if (tripType === 'one-way-departure') {
      params.set('departureDate', normalizedDate!);
      params.set('departureTime', state.time || '12:00');
      params.set('parkingCheckInDate', normalizedDate!);
      if (normalizedParkingCheckOutDate) {
        params.set('parkingCheckOutDate', normalizedParkingCheckOutDate);

        if (state.parkingCheckOutTime) {
          params.set('parkingCheckOutTime', state.parkingCheckOutTime);
        }
      }

      // Flying-out only: airport readiness assumptions
      if (state.intent === 'flying-out') {
        params.set('bagPlan', state.bagPlan);
        params.set('bags', state.bagPlan === 'none' ? 'no' : 'yes');
        params.set('security', state.securityOption);
        params.set('flightType', state.flightType);
        params.set('cabin', state.cabin);
      }

      if (normalizedParkingCheckOutDate) {
        const checkInTime = state.time || '12:00';
        const checkOutTime = state.parkingCheckOutTime || checkInTime;

        const minutes = calculateParkingDurationMinutes({
          checkInDate: normalizedDate!,
          checkInTime,
          checkOutDate: normalizedParkingCheckOutDate,
          checkOutTime,
        });

        if (minutes !== null) {
          params.set('parkingDuration', String(minutes));
        }
      } else if (state.parkingDurationHours) {
        const minutes = Math.round(Number(state.parkingDurationHours) * 60);
        if (Number.isFinite(minutes) && minutes > 0) {
          params.set('parkingDuration', String(minutes));
        }
      } else {
        params.set('parkingDuration', String(24 * 60));
      }
    } else {
      // airport pickup/dropoff
      params.set('airportTripDate', normalizedDate!);
      params.set('airportTripTime', state.time);
    }

    router.push(buildResultsPathFromSearchParams(params));
  };

  useEffect(() => {
    let active = true;

    async function loadAirportSecurity() {
      try {
        const res = await fetch(`/api/airport-security?airport=${state.airportCode}`);
        const data = await res.json();

        if (active) {
          setAirportSecurityStatus(data);
        }
      } catch {
        if (active) {
          setAirportSecurityStatus(null);
        }
      }
    }

    loadAirportSecurity();

    return () => {
      active = false;
    };
  }, [state.airportCode]);

  const favoriteTripInput = useMemo(
    () => ({
      origin: state.origin,
      airportCode: state.airportCode,
      intent: (state.intent || 'flying-out') as FavoriteTripIntent,
      checkingBags: state.bagPlan !== 'none',
      cabin: state.cabin,
      transportAvailability: state.transportAvailability,
      preferredSort: 'easiest' as RecommendationSortMode,
      destination: state.destination || undefined,
      destinationKind: state.destinationKind,
    }),
    [
      state.origin,
      state.airportCode,
      state.intent,
      state.bagPlan,
      state.cabin,
      state.transportAvailability,
      state.destination,
      state.destinationKind,
    ],
  );

  return (
    <div className="airport-page-bg flex flex-1 flex-col font-sans">
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-8 sm:px-4 sm:py-10">
        <div className="mb-8">
          <div className="mb-3 inline-flex rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase text-sky-800 shadow-sm">
            Trip decision helper
          </div>
          <h1 className="text-3xl font-semibold text-slate-950 sm:text-4xl">
            Compare the best way to get there
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Enter where you’re starting and where you’re going. PodPaiGo compares driving, parking, rideshare, transit, and park & ride when available.
          </p>
        </div>

        <SavedTripsPanel
          className="mb-6"
          description="Tap a saved route to compare options with today’s dates."
        />

        {errors.length > 0 && (
          <div
            id="trip-error-summary"
            className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm"
          >
            <div className="text-sm font-medium text-red-900">Please fix:</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {step === 1 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">What kind of trip are you planning?</h2>
              <p className="mt-1 text-sm text-zinc-600">Choose one so PodPaiGo can use the right timing and parking logic.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card
                title="Compare a local trip"
                subtitle="Going to work, downtown, an event, hotel, hospital, restaurant, or anywhere in WA."
                selected={state.intent === 'general-trip'}
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    intent: 'general-trip',
                    date: '',
                    time: '',
                    destination: '',
                    destinationKind: 'general',
                    parkingDurationHours: '8',
                    parkingCheckOutDate: '',
                    parkingCheckOutTime: '',
                  }))
                }
              />

              <Card
                title="Airport trip"
                subtitle="Flying out or parking at the airport? Compare airport parking, rideshare, transit, and when to leave."
                selected={state.intent === 'flying-out'}
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    intent: 'flying-out',
                    date: '',
                    time: '',
                    destination: '',
                    destinationKind: 'airport',
                    parkingDurationHours: '',
                    parkingCheckOutDate: '',
                    parkingCheckOutTime: '',
                    airportCode: s.airportCode || 'SEA',
                    timeAnchor: 'flight-departure',
                  }))
                }
              />
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onContinue}
                disabled={!state.intent}
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-base font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Continue
              </button>
            </div>
          </section>
        )}

        {step === 2 && intent && (
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="rounded-3xl border border-sky-100 bg-white/95 p-4 shadow-[0_18px_50px_rgba(14,116,144,0.12)] sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase text-sky-700">Trip setup</div>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">
                    {intentCopy(intent).title}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">{intentCopy(intent).helper}</p>
                </div>
                {/* <button
                  type="button"
                  onClick={() => setState((s) => ({ ...s, intent: 'parking-trip' }))}
                  className="text-sm font-medium text-blue-700 hover:text-blue-800"
                >
                  Parking only
                </button> */}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  {isAirportTrip && (
                    <div className="md:col-span-2">
                      <AirportSearchPicker
                        value={state.airportCode}
                        onChange={(airportCode) =>
                          setState((s) => ({ ...s, airportCode }))
                        }
                      />
                      <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-xs leading-5 text-slate-600">
                        <div className="font-medium text-zinc-800">
                          {selectedAirport.id} guidance
                        </div>
                        <div className="mt-1">{airportGuide.note}</div>
                      </div>
                      {intent && intentCopy(intent).wantsAirline ? (
                        <div className="mt-4">
                          <AirlineCombobox
                            value={state.airlineOrFlight}
                            onChange={(value) =>
                              setState((s) => ({ ...s, airlineOrFlight: value }))
                            }
                          />
                          <AirlineLookupPanel
                            airportCode={state.airportCode}
                            airlineOrFlight={state.airlineOrFlight}
                            className="mt-3"
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                  {isGeneralTrip && (
                    <div id="destination-field" className="md:col-span-2">
                      <label className="block text-sm font-medium text-zinc-800">
                        Where are you going?
                      </label>
                      <AddressInput
                        label="Where are you going?"
                        value={state.destination}
                        onChange={(value) =>
                          setState((s) => ({
                            ...s,
                            destination: value,
                          }))
                        }
                        placeholder="Office, stadium, restaurant, hotel, hospital, or address"
                      />
                      <p className="mt-2 text-xs text-zinc-500">
                        For now, PodPaiGo is optimized for Washington State trips.
                      </p>
                    </div>
                  )}
                  <div className="mt-6 text-sm font-medium text-zinc-900">What can you use today?</div>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(
                      [
                        { key: 'car' as const, title: 'Driving is okay', sub: 'Prioritize parking and park-and-ride options, but still compare other strong choices.' },
                        { key: 'rideshare' as const, title: 'I need rideshare/taxi', sub: 'Shows Uber, Lyft, taxi, and non-car transit where available.' },
                        { key: 'transit' as const, title: 'Transit only', sub: 'No car or rideshare.' },
                        { key: 'all' as const, title: 'No preference — compare everything', sub: 'Show car, rideshare, taxi, transit, parking, and park-and-ride.' },
                      ] as Array<{ key: TransportAvailability; title: string; sub: string }>
                    ).map((opt) => {
                      const selected = state.transportAvailability === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setState((s) => ({ ...s, transportAvailability: opt.key }))}
                          className={
                            'w-full rounded-2xl border p-4 text-left shadow-sm transition ' +
                            (selected
                              ? 'border-blue-500 bg-blue-50 shadow-blue-900/10'
                              : 'border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40')
                          }
                        >
                          <div className="text-sm font-semibold text-zinc-900">{opt.title}</div>
                          <div className="mt-1 text-xs text-zinc-600">{opt.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                  {(state.transportAvailability === 'all' || state.transportAvailability === 'transit') && (
                    <TransitPaymentPicker
                      value={state.transitPayment}
                      onChange={(transitPayment) =>
                        setState((s) => ({ ...s, transitPayment }))
                      }
                      className="mt-5"
                    />
                  )}
                  <div className="mt-2 text-xs text-zinc-500">Default: No preference — compare everything</div>
                </div>

                {intent === 'flying-out' && (
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 md:col-span-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-zinc-900">Airport readiness</div>
                        <div className="mt-1 text-xs text-zinc-600">
                          Helps estimate how early you should arrive before your flight.
                        </div>
                      </div>

                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-right">
                        <div className="text-xs font-medium text-blue-700">Recommended</div>
                        <div className="text-lg font-bold text-blue-950">
                          {calculateAirportReadinessBuffer({
                            bagPlan: state.bagPlan,
                            securityOption: state.securityOption,
                            flightType: state.flightType,
                            cabin: state.cabin,
                          }).bufferMinutes}{' '}
                          min
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <div className="text-xs font-semibold uppercase text-zinc-500">
                          Bag plan
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {(
                            [
                              { value: 'none' as BagPlan, label: 'No checked bag' },
                              { value: 'checked' as BagPlan, label: 'Checked bag' },
                              { value: 'oversized' as BagPlan, label: 'Oversized / special item' },
                            ] as Array<{ value: BagPlan; label: string }>
                          ).map((opt) => {
                            const selected = state.bagPlan === opt.value;

                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  setState((s) => ({ ...s, bagPlan: opt.value }))
                                }
                                className={
                                  'rounded-xl border px-3 py-2 text-left text-sm font-medium transition ' +
                                  (selected
                                    ? 'border-blue-500 bg-blue-50 text-blue-950'
                                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50')
                                }
                              >
                                <div>{opt.label}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase text-zinc-500">
                          Security
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {[
                            { value: 'standard' as SecurityOption, label: 'Standard TSA' },
                            { value: 'precheck' as SecurityOption, label: 'TSA PreCheck' },
                            { value: 'clear' as SecurityOption, label: 'CLEAR' },
                            { value: 'clear-precheck' as SecurityOption, label: 'CLEAR + PreCheck' },
                          ].map((opt) => {
                            const selected = state.securityOption === opt.value;

                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  setState((s) => ({ ...s, securityOption: opt.value }))
                                }
                                className={
                                  'rounded-xl border px-3 py-2 text-left text-sm font-medium transition ' +
                                  (selected
                                    ? 'border-blue-500 bg-blue-50 text-blue-950'
                                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50')
                                }
                              >
                                <div>{opt.label}</div>
                                <div className="mt-1 text-xs font-normal text-zinc-500">
                                  {securityHintText(opt.value, airportSecurityStatus)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase text-zinc-500">
                          Flight type
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {[
                            { value: 'domestic' as FlightType, label: 'Domestic' },
                            { value: 'international' as FlightType, label: 'International' },
                          ].map((opt) => {
                            const selected = state.flightType === opt.value;

                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  setState((s) => ({ ...s, flightType: opt.value }))
                                }
                                className={
                                  'rounded-xl border px-3 py-2 text-left text-sm font-medium transition ' +
                                  (selected
                                    ? 'border-blue-500 bg-blue-50 text-blue-950'
                                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50')
                                }
                              >
                                <div>{opt.label}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase text-zinc-500">
                          Cabin
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {[
                            { value: 'economy' as CabinClass, label: 'Economy' },
                            { value: 'premium' as CabinClass, label: 'Premium / Business / First' },
                          ].map((opt) => {
                            const selected = state.cabin === opt.value;

                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  setState((s) => ({ ...s, cabin: opt.value }))
                                }
                                className={
                                  'rounded-xl border px-3 py-2 text-left text-sm font-medium transition ' +
                                  (selected
                                    ? 'border-blue-500 bg-blue-50 text-blue-950'
                                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50')
                                }
                              >
                                <div>{opt.label}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {calculateAirportReadinessBuffer({
                        bagPlan: state.bagPlan,
                        securityOption: state.securityOption,
                        flightType: state.flightType,
                        cabin: state.cabin,
                      }).assumptions.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="md:col-span-2 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-medium text-zinc-900">
                    What time should we plan around?
                  </div>

                  {/* 1) buttons first */}
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Flight departure button */}
                    {/* Airport arrival button */}
                  </div>

                  {/* 2) time input second */}
                  <div id="time-field" className="mt-4">
                    <label className="block text-sm font-medium text-zinc-800">
                      {isGeneralTrip
                        ? 'Arrival time'
                        : state.timeAnchor === 'flight-departure'
                          ? 'Flight departure time'
                          : 'Airport arrival time'}
                    </label>

                    <input
                      type="time"
                      value={state.time}
                      onChange={(e) => {
                        setTimeTouched(true);
                        setState((s) => ({ ...s, time: e.target.value }));
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.time;
                          return next;
                        });
                      }}
                      className={
                        'mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ' +
                        (fieldErrors.time ? 'border-red-400 ring-4 ring-red-100 ' : 'border-zinc-200 ') +
                        (highlightedField === 'time' ? 'animate-pulse' : '')
                      }
                    />

                    {fieldErrors.time && (
                      <div className="mt-2 text-sm text-red-700">{fieldErrors.time}</div>
                    )}
                  </div>
                </div>

                <div id="date-field">
                  <label className="block text-sm font-medium text-zinc-800">
                    {isGeneralTrip
                      ? 'Trip date'
                      : (intent === 'flying-out' || intent === 'parking-trip')
                        ? 'Parking start date'
                        : 'Date'}
                  </label>
                  <div className="mt-2">
                    <input
                      type="date"
                      value={isFullDate(state.date) ? state.date : ''}
                      onChange={(e) => {
                        const nextDate = e.target.value;

                        setState((s) => ({
                          ...s,
                          date: nextDate,
                          parkingCheckOutDate:
                            !parkingCheckoutTouched && isFullDate(nextDate)
                              ? addDays(nextDate, 7)
                              : s.parkingCheckOutDate,
                        }));

                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.date;
                          return next;
                        });
                      }}
                      aria-label="Choose parking start date from calendar"
                      className={
                        'w-full rounded-2xl border bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ' +
                        (fieldErrors.date ? 'border-red-400 ring-4 ring-red-100 ' : 'border-zinc-200 ') +
                        (highlightedField === 'date' ? 'animate-pulse' : '')
                      }
                    />
                    {fieldErrors.date && (
                      <p className="mt-2 text-sm font-medium text-red-600">
                        {fieldErrors.date}
                      </p>
                    )}
                  </div>
                </div>

                {showTimingFields &&
                  ENABLE_AIRPORT_TIMING_FIELDS && (
                    <div id="time-field">
                      <label className="block text-sm font-medium text-zinc-800">
                        {state.timeAnchor === 'flight-departure'
                          ? 'What time does your flight depart?'
                          : 'What time do you want to arrive at the airport?'}
                      </label>
                      <input
                        type="time"
                        value={state.time}
                        onChange={(e) => {
                          setTimeTouched(true);
                          setState((s) => ({ ...s, time: e.target.value }));
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.time;
                            return next;
                          });
                        }}
                        className={
                          'mt-2 w-full rounded-xl border bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ' +
                          (fieldErrors.time ? 'border-red-400 ring-4 ring-red-100 ' : 'border-zinc-200 ') +
                          (highlightedField === 'time' ? 'animate-pulse' : '')
                        }
                        aria-label="Trip time"
                      />
                      {fieldErrors.time && (
                        <p className="mt-2 text-sm font-medium text-red-600">
                          {fieldErrors.time}
                        </p>
                      )}
                    </div>
                  )}

                {isAirportTrip && (intent === 'flying-out' || intent === 'parking-trip') && (
                  <>
                    <div id="parking-checkout-field">
                      <label className="block text-sm font-medium text-zinc-800">
                        Return / parking check-out date
                        <span className="ml-1 text-xs font-normal text-zinc-500">
                          Optional
                        </span>
                      </label>

                      <div className="mt-2">
                        <input
                          type="date"
                          value={calendarDateValue(state.parkingCheckOutDate)}
                          onChange={(e) => {
                            setParkingCheckoutTouched(true);
                            setState((s) => ({
                              ...s,
                              parkingCheckOutDate: e.target.value,
                            }));

                            setFieldErrors((prev) => {
                              const next = { ...prev };
                              delete next.parkingCheckOutDate;
                              return next;
                            });
                          }}
                          aria-label="Choose return or parking check-out date from calendar"
                          className={
                            'w-full rounded-2xl border bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ' +
                            (fieldErrors.parkingCheckOutDate ? 'border-red-400 ring-4 ring-red-100' : 'border-zinc-200')
                          }
                        />
                      </div>

                      {fieldErrors.parkingCheckOutDate && (
                        <div className="mt-2 text-sm text-red-700">{fieldErrors.parkingCheckOutDate}</div>
                      )}

                      <div className="mt-2 text-xs text-zinc-500">
                        Leave blank if one-way or return date unknown.
                      </div>
                    </div>

                    {showTimingFields && ENABLE_AIRPORT_TIMING_FIELDS && (
                      <div>
                        <label className="block text-sm font-medium text-zinc-800">
                          Return arrival time
                          <span className="ml-1 text-xs font-normal text-zinc-500">
                            Optional
                          </span>
                        </label>

                        <input
                          type="time"
                          value={state.parkingCheckOutTime}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              parkingCheckOutTime: e.target.value,
                            }))
                          }
                          className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />

                        <div className="mt-2 text-xs text-zinc-500">
                          Optional — defaults to your parking check-in time if blank.
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div id="origin-field" className="md:col-span-2">
                  <div
                    className={
                      'rounded-2xl ' +
                      (fieldErrors.origin ? 'ring-4 ring-red-100 ' : '') +
                      (highlightedField === 'origin' ? 'animate-pulse' : '')
                    }
                  >
                    <AddressInput
                      label="Origin address"
                      value={state.origin}
                      onChange={(origin) => {
                        setState((s) => ({ ...s, origin }));
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.origin;
                          return next;
                        });
                      }}
                      placeholder="Start typing your address"
                    />
                  </div>

                  {fieldErrors.origin && (
                    <div className="mt-2 text-sm text-red-700">{fieldErrors.origin}</div>
                  )}
                </div>

                {isAirportTrip && (
                  <div className="md:col-span-2">
                    <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                      <div className="text-sm font-medium text-zinc-900">Destination</div>
                      <div className="mt-1 text-base font-semibold text-zinc-900">
                        {(getAirportById(state.airportCode) || getAirportById('SEA')!)?.destinationName}
                      </div>
                      <div className="mt-1 text-sm text-zinc-600">
                        {airportGuide.note || 'We’ll route you to the correct check-in area.'}
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        Rideshare/taxi drop-off: {airportGuide.rideshareDestinationName}
                      </div>
                    </div>
                  </div>
                )}

                {isGeneralTrip && intentCopy(intent).wantsParkingDuration && (
                  <div id="parking-duration-field" className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-800">
                      {isGeneralTrip ? 'How long will you park?' : 'Parking duration'}
                      <span className="ml-1 text-xs font-normal text-zinc-500">
                        Optional
                      </span>
                    </label>

                    <input
                      type="number"
                      value={state.parkingDurationHours}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          parkingDurationHours: e.target.value,
                        }))
                      }
                      placeholder={isGeneralTrip ? '8' : '24'}
                      min="0.5"
                      step="0.5"
                      className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />

                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      {isGeneralTrip
                        ? 'Use hours for office, downtown, stadium, restaurant, event, or hospital parking. Example: 2, 4, or 8 hours.'
                        : 'Airport trips can use the return/check-out date above. Use this only if you prefer entering total hours manually.'}
                    </p>

                    {isGeneralTrip && !state.parkingDurationHours && (
                      <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                        Default: 8 hours if left blank.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Near-time warning (non-blocking) - only show after user edited/selected time */}
              {timeTouched && state.date && state.time && (() => {
                const normalizedDate = normalizeDateInputValue(state.date);
                if (!normalizedDate) return null;

                const combined = new Date(`${normalizedDate}T${state.time}`);
                const now = new Date();
                if (!isNaN(combined.getTime())) {
                  const mins = Math.ceil((combined.getTime() - now.getTime()) / 60000);
                  if (mins > 0 && mins < 60) {
                    return (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Your trip time is very soon. You may need to leave immediately or consider the fastest option.
                      </div>
                    );
                  }
                }
                return null;
              })()}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SaveFavoriteTripButton
                  trip={favoriteTripInput}
                  label="Save as favorite"
                  savedLabel="Saved to this device"
                />

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-medium text-slate-900 hover:bg-slate-50"
                >
                  Back
                </button>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-base font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700"
                >
                  See options
                </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
