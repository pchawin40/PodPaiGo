'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { trackEvent } from '../../lib/analytics/trackEvent';
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
import { estimateParkingDays } from '../../lib/tripTime';
import { formatMoney } from '../utils/formatter';
import { calculateAirportReadinessBuffer } from '../../lib/airports/airportReadiness';
import TransitPaymentPicker from '../components/TransitPaymenPicker';
import ExpandableSection from '../components/ui/ExpandableSection';
import {
  getOptionButtonClass,
  getOptionInlineBadgeClass,
  getOptionSelectedBadgeClass,
} from '../../lib/ui/optionClasses';
import { buildResultsPathFromSearchParams } from '../../lib/trip/searchParams';
import {
  formatParkingWindowSummary,
  resolveParkingWindow,
} from '../../lib/trip/parkingWindow';
import SavedTripsPanel from '../components/SavedTripsPanel';
import SaveFavoriteTripButton from '../components/SaveFavoriteTripButton';
import type { RecommendationSortMode } from '../../lib/domain';
import type { FavoriteTripIntent } from '../../lib/trip/favoriteTrips';
import {
  FlexibleDateInput as DateTextInput,
  normalizeFlexibleDateInputValue,
} from '../components/FlexibleDateInput';
export { FlexibleDateInput as DateTextInput } from '../components/FlexibleDateInput';

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
  parkingPreference: 'none' | 'destination' | 'nearby';
  parkingCheckInDate: string;
  parkingCheckInTime: string;
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

function normalizeDateInputValue(value: string): string | null {
  return normalizeFlexibleDateInputValue(value);
}

function isAirportParkingTripIntent(intent: Intent | null): boolean {
  return intent === 'flying-out' || intent === 'parking-trip';
}

export function resolveAirportTripDate(state: Pick<FormState, 'date' | 'parkingCheckInDate'>): string {
  const fromParking = state.parkingCheckInDate
    ? normalizeDateInputValue(state.parkingCheckInDate)
    : null;
  if (fromParking) return fromParking;

  return state.date ? normalizeDateInputValue(state.date) || '' : '';
}

function resolveAirportTripDateRaw(state: Pick<FormState, 'date' | 'parkingCheckInDate'>): string {
  if (state.parkingCheckInDate.trim()) return state.parkingCheckInDate;
  return state.date;
}

const readableInputClass =
  'ppg-readable-input rounded-2xl border px-4 py-3 text-base shadow-sm outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15';

function formInputClass({
  hasError = false,
  highlighted = false,
  className = '',
}: {
  hasError?: boolean;
  highlighted?: boolean;
  className?: string;
} = {}): string {
  return [
    readableInputClass,
    hasError ? 'border-danger ring-4 ring-danger/15' : 'border-border',
    highlighted ? 'animate-pulse' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
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

function subtractMinutesFromLocalDateTime(
  date: string,
  time: string,
  minutes: number
): { date: string; time: string } | null {
  return addMinutesToLocalDateTime(date, time, -minutes);
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

  return minutes > 0 ? minutes : null;
}

function parkingDurationHoursToMinutes(value: string, fallbackHours: number): number | null {
  const raw = value.trim();
  const hours = raw ? Number(raw) : fallbackHours;
  const minutes = Math.round(hours * 60);

  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function resolveAirportParkingCheckIn(
  state: FormState,
  normalizedTripDate: string
): { date: string; time: string } {
  const mainTime = state.time || '12:00';
  const explicitDate = state.parkingCheckInDate
    ? normalizeDateInputValue(state.parkingCheckInDate)
    : null;

  if (explicitDate || state.parkingCheckInTime) {
    return {
      date: explicitDate || normalizedTripDate,
      time: state.parkingCheckInTime || mainTime,
    };
  }

  if (state.intent === 'flying-out' && state.timeAnchor === 'flight-departure') {
    const readiness = calculateAirportReadinessBuffer({
      bagPlan: state.bagPlan,
      securityOption: state.securityOption,
      flightType: state.flightType,
      cabin: state.cabin,
    });

    const derived = subtractMinutesFromLocalDateTime(
      normalizedTripDate,
      mainTime,
      readiness.bufferMinutes
    );

    if (derived) return derived;
  }

  return { date: normalizedTripDate, time: mainTime };
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
      className={'group ' + getOptionButtonClass(selected)}
    >
      <div className="text-base font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
      <div className={'mt-4 ' + getOptionSelectedBadgeClass(selected)}>
        {selected ? 'Selected' : 'Choose'}
      </div>
    </button>
  );
}


export default function TripFlow() {
  const router = useRouter();
  const plannerStartedTracked = useRef(false);

  useEffect(() => {
    if (plannerStartedTracked.current) return;
    plannerStartedTracked.current = true;
    trackEvent('trip_planner_started');
  }, []);

  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [showAdvancedGeneralParkingTime, setShowAdvancedGeneralParkingTime] = useState(false);
  const [generalParkingWindowOverridden, setGeneralParkingWindowOverridden] = useState(false);
  // Airport "Parking time" holds the required trip date, so it starts open and
  // re-opens automatically when a parking date error needs fixing.
  const [parkingTimeOpen, setParkingTimeOpen] = useState(true);

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
    parkingPreference: 'nearby',
    parkingCheckInDate: '',
    parkingCheckInTime: '',
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

  const transportAvailabilityLabel: Record<TransportAvailability, string> = {
    car: 'I have a car',
    rideshare: 'No car / rideshare',
    transit: 'Transit only',
    all: 'Compare all',
  };

  const selectedAirport = useMemo(() => {
    return getAirportById(state.airportCode) || getAirportById('SEA')!;
  }, [state.airportCode]);

  const generalParkingDurationMinutes = useMemo(
    () => parkingDurationHoursToMinutes(state.parkingDurationHours, 8),
    [state.parkingDurationHours],
  );
  const normalizedTripDateForParking = useMemo(
    () => normalizeDateInputValue(state.date) || '',
    [state.date],
  );
  const normalizedParkingCheckInDateForParking = useMemo(
    () =>
      state.parkingCheckInDate
        ? normalizeDateInputValue(state.parkingCheckInDate) || state.parkingCheckInDate
        : '',
    [state.parkingCheckInDate],
  );
  const normalizedParkingCheckOutDateForParking = useMemo(
    () =>
      state.parkingCheckOutDate
        ? normalizeDateInputValue(state.parkingCheckOutDate) || state.parkingCheckOutDate
        : '',
    [state.parkingCheckOutDate],
  );
  const generalParkingWindow = useMemo(
    () =>
      resolveParkingWindow({
        arrivalDate: normalizedTripDateForParking,
        arrivalTime: state.time || '09:00',
        durationMinutes: generalParkingDurationMinutes,
        parkingCheckInDate: generalParkingWindowOverridden
          ? normalizedParkingCheckInDateForParking
          : '',
        parkingCheckInTime: generalParkingWindowOverridden ? state.parkingCheckInTime : '',
        parkingCheckOutDate: generalParkingWindowOverridden
          ? normalizedParkingCheckOutDateForParking
          : '',
        parkingCheckOutTime: generalParkingWindowOverridden ? state.parkingCheckOutTime : '',
      }),
    [
      generalParkingDurationMinutes,
      generalParkingWindowOverridden,
      normalizedParkingCheckInDateForParking,
      normalizedParkingCheckOutDateForParking,
      normalizedTripDateForParking,
      state.parkingCheckInTime,
      state.parkingCheckOutTime,
      state.time,
    ],
  );
  const generalParkingSummary = formatParkingWindowSummary(generalParkingWindow);

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

  const usesParkingCheckInAsTripDate = isAirportParkingTripIntent(intent);

  const validate = (forStep: Step): string[] => {
    const next: string[] = [];
    const tripDateRaw = usesParkingCheckInAsTripDate
      ? resolveAirportTripDateRaw(state)
      : state.date;
    const normalizedDate = usesParkingCheckInAsTripDate
      ? resolveAirportTripDate(state) || null
      : normalizeDateInputValue(state.date);
    const normalizedParkingCheckInDate = state.parkingCheckInDate
      ? normalizeDateInputValue(state.parkingCheckInDate)
      : null;
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

    if (!tripDateRaw) {
      next.push(
        state.intent === 'general-trip'
          ? 'Trip date is required.'
          : usesParkingCheckInAsTripDate
            ? 'Parking check-in date is required.'
            : 'Date is required.',
      );
    } else if (!normalizedDate) {
      next.push(
        state.intent === 'general-trip'
          ? 'Enter the trip date as MM/DD/YYYY or YYYY-MM-DD.'
          : usesParkingCheckInAsTripDate
            ? 'Enter the parking check-in date as MM/DD/YYYY or YYYY-MM-DD.'
            : 'Enter the date as MM/DD/YYYY or YYYY-MM-DD.',
      );
    }

    if (ENABLE_AIRPORT_TIMING_FIELDS && state.intent !== 'parking-trip' && !state.time) {
      next.push('Time is required.');
    }

    // Optional check-out date
    if (state.parkingCheckOutDate && !normalizedParkingCheckOutDate) {
      next.push('Enter the parking check-out date as MM/DD/YYYY or YYYY-MM-DD.');
    }

    if (
      state.parkingCheckInDate &&
      !normalizedParkingCheckInDate &&
      !usesParkingCheckInAsTripDate
    ) {
      next.push('Enter the parking check-in date as MM/DD/YYYY or YYYY-MM-DD.');
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

    if ((normalizedDate || normalizedParkingCheckInDate) && normalizedParkingCheckOutDate) {
      const checkInDate = normalizedParkingCheckInDate || normalizedDate!;
      const checkInTime = state.parkingCheckInTime || state.time || '12:00';
      const checkOutTime = state.parkingCheckOutTime || checkInTime;

      const checkIn = buildLocalDateTime(checkInDate, checkInTime);
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

    if (
      state.intent === 'general-trip' &&
      state.parkingPreference !== 'none' &&
      generalParkingWindowOverridden &&
      !generalParkingWindow
    ) {
      next.push('Custom parking window must end after it starts.');
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

      const nextParkingCheckInDate =
        isAirportParkingTripIntent(s.intent) && !s.parkingCheckInDate
          ? nextDate
          : s.parkingCheckInDate;

      return {
        ...s,
        date: nextDate,
        time: nextTime,
        parkingCheckInDate: nextParkingCheckInDate,
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

    const tripDateRaw = usesParkingCheckInAsTripDate
      ? resolveAirportTripDateRaw(state)
      : state.date;
    const normalizedDate = usesParkingCheckInAsTripDate
      ? resolveAirportTripDate(state) || null
      : normalizeDateInputValue(state.date);
    const normalizedParkingCheckInDate = state.parkingCheckInDate
      ? normalizeDateInputValue(state.parkingCheckInDate)
      : null;
    const normalizedParkingCheckOutDate = state.parkingCheckOutDate
      ? normalizeDateInputValue(state.parkingCheckOutDate)
      : null;

    const nextFieldErrors: Record<string, string> = {};

    if (!state.origin.trim()) {
      nextFieldErrors.origin = 'Enter your starting address.';
    }

    if (!tripDateRaw) {
      next.push(
        state.intent === 'general-trip'
          ? 'Trip date is required.'
          : usesParkingCheckInAsTripDate
            ? 'Parking check-in date is required.'
            : 'Date is required.',
      );
    } else if (!normalizedDate) {
      next.push(
        state.intent === 'general-trip'
          ? 'Enter the trip date as MM/DD/YYYY or YYYY-MM-DD.'
          : usesParkingCheckInAsTripDate
            ? 'Enter the parking check-in date as MM/DD/YYYY or YYYY-MM-DD.'
            : 'Enter the date as MM/DD/YYYY or YYYY-MM-DD.',
      );
    }

    if (!state.time) {
      nextFieldErrors.time = 'Select your flight or trip time.';
    }

    if (state.parkingCheckOutDate && !normalizedParkingCheckOutDate) {
      nextFieldErrors.parkingCheckOutDate = 'Use MM/DD/YYYY or YYYY-MM-DD.';
    }

    if (
      state.parkingCheckInDate &&
      !normalizedParkingCheckInDate &&
      !usesParkingCheckInAsTripDate
    ) {
      nextFieldErrors.parkingCheckInDate = 'Use MM/DD/YYYY or YYYY-MM-DD.';
    }

    const tripDateField = usesParkingCheckInAsTripDate ? 'parkingCheckInDate' : 'date';

    // Make "past trip" error point to the date/time fields
    if (normalizedDate && state.time) {
      const combined = new Date(`${normalizedDate}T${state.time}`);
      const now = new Date();

      if (Number.isNaN(combined.getTime())) {
        nextFieldErrors[tripDateField] =
          state.intent === 'general-trip'
            ? 'Trip date is invalid.'
            : usesParkingCheckInAsTripDate
              ? 'Parking check-in date is invalid.'
              : 'Date is invalid.';

        nextFieldErrors.time =
          state.intent === 'general-trip'
            ? 'Arrival time is invalid.'
            : 'Flight or trip time is invalid.';
      } else if (combined.getTime() < now.getTime()) {
        nextFieldErrors[tripDateField] =
          state.intent === 'general-trip'
            ? 'Trip date/time cannot be in the past.'
            : usesParkingCheckInAsTripDate
              ? 'Parking check-in date/time cannot be in the past.'
              : 'Date/time cannot be in the past.';

        nextFieldErrors.time =
          state.intent === 'general-trip'
            ? 'Arrival time cannot be in the past.'
            : 'Flight or trip time cannot be in the past.';
      }
    }

    // Make checkout ordering error point to checkout field
    if (normalizedDate && normalizedParkingCheckOutDate) {
      const resolvedCheckIn = isGeneralTrip
        ? {
            date: normalizedParkingCheckInDate || normalizedDate,
            time: state.parkingCheckInTime || state.time || '12:00',
          }
        : resolveAirportParkingCheckIn(state, normalizedDate);
      const checkOutTime = state.parkingCheckOutTime || resolvedCheckIn.time;

      const checkIn = buildLocalDateTime(resolvedCheckIn.date, resolvedCheckIn.time);
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

    if (
      state.intent === 'general-trip' &&
      state.parkingPreference !== 'none' &&
      generalParkingWindowOverridden &&
      !generalParkingWindow
    ) {
      nextFieldErrors.parkingCheckOutDate = 'Custom parking window must end after it starts.';
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

    const submittedTripDate = normalizedDate!;
    const submittedParkingCheckInDate = usesParkingCheckInAsTripDate
      ? submittedTripDate
      : normalizedParkingCheckInDate ?? state.parkingCheckInDate;

    setFieldErrors({});
    setState((s) => ({
      ...s,
      date: submittedTripDate,
      parkingCheckInDate: submittedParkingCheckInDate,
      parkingCheckOutDate: normalizedParkingCheckOutDate ?? s.parkingCheckOutDate,
    }));

    const tripType = intentToTripType(state.intent!);
    const submittingGeneralTrip = state.intent === 'general-trip';

    const destination = submittingGeneralTrip
      ? state.destination.trim()
      : airportGuide.destination;

    const params = new URLSearchParams();

    params.set('type', tripType);
    params.set('origin', state.origin);
    params.set('destination', destination);
    params.set('intent', state.intent!);
    params.set('transport', state.transportAvailability);
    params.set('transitPayment', state.transitPayment);
    params.set('parkingPreference', state.parkingPreference);
    params.set('destinationKind', submittingGeneralTrip ? state.destinationKind : 'airport');

    if (submittingGeneralTrip) {
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
      const minutes = parkingDurationHoursToMinutes(state.parkingDurationHours, 8);
      const parkingWindow = resolveParkingWindow({
        arrivalDate: normalizedDate!,
        arrivalTime,
        durationMinutes: minutes,
        parkingCheckInDate: generalParkingWindowOverridden
          ? normalizedParkingCheckInDate || ''
          : '',
        parkingCheckInTime: generalParkingWindowOverridden ? state.parkingCheckInTime : '',
        parkingCheckOutDate: generalParkingWindowOverridden
          ? normalizedParkingCheckOutDate || ''
          : '',
        parkingCheckOutTime: generalParkingWindowOverridden ? state.parkingCheckOutTime : '',
      });

      params.set('arrivalDate', normalizedDate!);
      params.set('arrivalTime', arrivalTime);

      if (parkingWindow) {
        params.set('parkingCheckInDate', parkingWindow.parkingCheckInDate);
        params.set('parkingCheckInTime', parkingWindow.parkingCheckInTime);
        params.set('parkingCheckOutDate', parkingWindow.parkingCheckOutDate);
        params.set('parkingCheckOutTime', parkingWindow.parkingCheckOutTime);
        params.set('parkingDuration', String(parkingWindow.parkingDuration));
      }
    } else if (tripType === 'one-way-departure') {
      const parkingCheckIn = resolveAirportParkingCheckIn(state, submittedTripDate);
      const parkingCheckOutDate = normalizedParkingCheckOutDate || '';
      const parkingCheckOutTime = state.parkingCheckOutTime || parkingCheckIn.time;

      params.set('departureDate', submittedTripDate);
      params.set('flightDate', submittedTripDate);
      params.set('departureTime', state.time || '12:00');
      params.set('parkingCheckInDate', parkingCheckIn.date);
      params.set('parkingCheckInTime', parkingCheckIn.time);
      if (parkingCheckOutDate) {
        params.set('parkingCheckOutDate', parkingCheckOutDate);
        params.set('parkingCheckOutTime', parkingCheckOutTime);
      }

      // Flying-out only: airport readiness assumptions
      if (state.intent === 'flying-out') {
        params.set('bagPlan', state.bagPlan);
        params.set('bags', state.bagPlan === 'none' ? 'no' : 'yes');
        params.set('security', state.securityOption);
        params.set('flightType', state.flightType);
        params.set('cabin', state.cabin);
      }

      if (parkingCheckOutDate) {
        const minutes = calculateParkingDurationMinutes({
          checkInDate: parkingCheckIn.date,
          checkInTime: parkingCheckIn.time,
          checkOutDate: parkingCheckOutDate,
          checkOutTime: parkingCheckOutTime,
        });

        if (minutes !== null) {
          params.set('parkingDuration', String(minutes));
        }
      } else if (state.parkingDurationHours) {
        const minutes = parkingDurationHoursToMinutes(state.parkingDurationHours, 24);
        if (minutes !== null) {
          params.set('parkingDuration', String(minutes));
        }
      }
    } else {
      // airport pickup/dropoff
      params.set('airportTripDate', normalizedDate!);
      params.set('airportTripTime', state.time);
    }

    trackEvent('trip_form_submitted', {
      eventProperties: {
        tripType,
        intent: state.intent ?? undefined,
        airportCode: submittingGeneralTrip ? undefined : selectedAirport.id,
        destinationCategory: submittingGeneralTrip ? state.destinationKind : 'airport',
        preference: state.transportAvailability,
        mode: state.bagPlan,
        sort: state.securityOption,
      },
    });

    if (process.env.NODE_ENV !== 'production') {
      console.debug('trip_form_submit_params', {
        type: params.get('type'),
        intent: params.get('intent'),
        hasOrigin: Boolean(params.get('origin')),
        hasDestination: Boolean(params.get('destination')),
        destinationKind: params.get('destinationKind'),
        transport: params.get('transport'),
        transitPayment: params.get('transitPayment'),
        parkingPreference: params.get('parkingPreference'),
        arrivalDate: params.get('arrivalDate'),
        arrivalTime: params.get('arrivalTime'),
        departureDate: params.get('departureDate'),
        departureTime: params.get('departureTime'),
        parkingCheckInDate: params.get('parkingCheckInDate'),
        parkingCheckInTime: params.get('parkingCheckInTime'),
        parkingCheckOutDate: params.get('parkingCheckOutDate'),
        parkingCheckOutTime: params.get('parkingCheckOutTime'),
        parkingDuration: params.get('parkingDuration'),
      });
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
          <div className="mb-3 inline-flex rounded-full border border-primary/25 bg-card/90 px-3 py-1 text-xs font-semibold uppercase text-primary shadow-sm">
            Trip decision helper
          </div>
          <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
            Compare the best way to get there
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
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
            className="mb-6 rounded-2xl border border-danger/30 bg-danger/10 p-4 shadow-sm"
          >
            <div className="text-sm font-medium text-danger">Please fix:</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-danger">
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {step === 1 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">What kind of trip are you planning?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Choose one so PodPaiGo can use the right timing and parking logic.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card
                title="Compare a local trip"
                subtitle="Going to work, downtown, an event, hotel, hospital, restaurant, or anywhere in WA."
                selected={state.intent === 'general-trip'}
                onClick={() => {
                  trackEvent('trip_type_selected', {
                    eventProperties: { tripType: 'general-trip', intent: 'general-trip' },
                  });
                  setState((s) => ({
                    ...s,
                    intent: 'general-trip',
                    date: '',
                    time: '',
                    destination: '',
                    destinationKind: 'general',
                    parkingDurationHours: '8',
                    parkingPreference: 'nearby',
                    parkingCheckInDate: '',
                    parkingCheckInTime: '',
                    parkingCheckOutDate: '',
                    parkingCheckOutTime: '',
                  }));
                }}
              />

              <Card
                title="Airport trip"
                subtitle="Flying out or parking at the airport? Compare airport parking, rideshare, transit, and when to leave."
                selected={state.intent === 'flying-out'}
                onClick={() => {
                  trackEvent('trip_type_selected', {
                    eventProperties: { tripType: 'one-way-departure', intent: 'flying-out' },
                  });
                  setState((s) => ({
                    ...s,
                    intent: 'flying-out',
                    date: '',
                    time: '',
                    destination: '',
                    destinationKind: 'airport',
                    parkingDurationHours: '',
                    parkingPreference: 'nearby',
                    parkingCheckInDate: '',
                    parkingCheckInTime: '',
                    parkingCheckOutDate: '',
                    parkingCheckOutTime: '',
                    airportCode: s.airportCode || 'SEA',
                    timeAnchor: 'flight-departure',
                  }));
                }}
              />
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onContinue}
                disabled={!state.intent}
                className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-base font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Continue
              </button>
            </div>
          </section>
        )}

        {step === 2 && intent && (
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="rounded-3xl border border-border bg-card/95 p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="ppg-form-eyebrow">Trip setup</div>
                  <h2 className="mt-1 text-xl font-semibold text-foreground">
                    {intentCopy(intent).title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{intentCopy(intent).helper}</p>
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
                      <div className="ppg-callout-panel mt-3 rounded-2xl px-3 py-3 text-xs leading-5">
                        <div className="font-medium text-foreground">
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
                      <label className="block text-sm font-medium text-foreground">
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
                      <p className="mt-2 text-xs text-muted-foreground">
                        For now, PodPaiGo is optimized for Washington State trips.
                      </p>
                    </div>
                  )}
                  <div className="mt-6 text-sm font-medium text-foreground">What can you use today?</div>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(
                      [
                        { key: 'car' as const, title: 'I have a car', sub: 'Show parking normally and still compare strong ride or transit options.' },
                        { key: 'rideshare' as const, title: 'No car / rideshare', sub: 'Prioritize rideshare, taxi, and non-car transit where available.' },
                        { key: 'transit' as const, title: 'Transit only', sub: 'No car or rideshare.' },
                        { key: 'all' as const, title: 'Compare all', sub: 'Show car, rideshare, taxi, transit, parking, and park-and-ride.' },
                      ] as Array<{ key: TransportAvailability; title: string; sub: string }>
                    ).map((opt) => {
                      const selected = state.transportAvailability === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            trackEvent('transport_preference_selected', {
                              eventProperties: { preference: opt.key },
                            });
                            setState((s) => ({ ...s, transportAvailability: opt.key }));
                          }}
                          className={getOptionButtonClass(selected)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-foreground">{opt.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{opt.sub}</div>
                            </div>
                            {selected ? (
                              <span className={getOptionInlineBadgeClass()}>Selected</span>
                            ) : null}
                          </div>
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
                      airportCode={state.airportCode}
                      className="mt-5"
                    />
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">Default: Compare all</div>
                </div>

                {intent === 'flying-out' && (
                  <div className="ppg-callout-panel rounded-2xl p-4 md:col-span-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">Airport readiness</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Helps estimate how early you should arrive before your flight.
                        </div>
                      </div>

                      <div className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-right">
                        <div className="text-xs font-medium text-primary">Recommended</div>
                        <div className="text-lg font-bold text-foreground">
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
                        <div className="text-xs font-semibold uppercase text-muted-foreground">
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
                                onClick={() => {
                                  trackEvent('bag_plan_selected', {
                                    eventProperties: { mode: opt.value },
                                  });
                                  setState((s) => ({ ...s, bagPlan: opt.value }));
                                }}
                                className={getOptionButtonClass(selected, { compact: true })}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div>{opt.label}</div>
                                  {selected ? (
                                    <span className={getOptionInlineBadgeClass()}>Selected</span>
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase text-muted-foreground">
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
                                onClick={() => {
                                  trackEvent('security_option_selected', {
                                    eventProperties: { preference: opt.value },
                                  });
                                  setState((s) => ({ ...s, securityOption: opt.value }));
                                }}
                                className={getOptionButtonClass(selected, { compact: true })}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div>{opt.label}</div>
                                    <div className="mt-1 text-xs font-normal text-muted-foreground">
                                      {securityHintText(opt.value, airportSecurityStatus)}
                                    </div>
                                  </div>
                                  {selected ? (
                                    <span className={getOptionInlineBadgeClass()}>Selected</span>
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase text-muted-foreground">
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
                                className={getOptionButtonClass(selected, { compact: true })}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div>{opt.label}</div>
                                  {selected ? (
                                    <span className={getOptionInlineBadgeClass()}>Selected</span>
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase text-muted-foreground">
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
                                className={getOptionButtonClass(selected, { compact: true })}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div>{opt.label}</div>
                                  {selected ? (
                                    <span className={getOptionInlineBadgeClass()}>Selected</span>
                                  ) : null}
                                </div>
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
                          className="ppg-chip rounded-full px-2.5 py-1 text-xs font-medium"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="ppg-section-panel md:col-span-2 rounded-2xl p-4">
                  <div className="text-sm font-medium text-foreground">
                    {usesParkingCheckInAsTripDate
                      ? 'Flight departure'
                      : 'What time should we plan around?'}
                  </div>

                  {/* 1) buttons first */}
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Flight departure button */}
                    {/* Airport arrival button */}
                  </div>

                  {/* 2) time input second */}
                  <div id="time-field" className="mt-4">
                    <label className="block text-sm font-medium text-foreground">
                      {isGeneralTrip
                        ? 'Arrival time'
                        : usesParkingCheckInAsTripDate
                          ? 'Departure time'
                          : state.timeAnchor === 'flight-departure'
                            ? 'Flight departure time'
                            : 'Airport arrival time'}
                    </label>

                    <input
                      type="time"
                      value={state.time}
                      aria-label={
                        isGeneralTrip
                          ? 'Arrival time'
                          : usesParkingCheckInAsTripDate
                            ? 'Departure time'
                            : state.timeAnchor === 'flight-departure'
                              ? 'Flight departure time'
                              : 'Airport arrival time'
                      }
                      onChange={(e) => {
                        setTimeTouched(true);
                        setState((s) => ({ ...s, time: e.target.value }));
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.time;
                          return next;
                        });
                      }}
                      className={formInputClass({
                        hasError: Boolean(fieldErrors.time),
                        highlighted: highlightedField === 'time',
                        className: 'mt-2 w-full',
                      })}
                    />

                    {fieldErrors.time && (
                      <div className="mt-2 text-sm text-danger">{fieldErrors.time}</div>
                    )}
                  </div>
                </div>

                {!usesParkingCheckInAsTripDate && (
                  <div id="date-field">
                    <label className="block text-sm font-medium text-foreground">
                      {isGeneralTrip ? 'Trip date' : 'Date'}
                    </label>
                    <div className="mt-2">
                      <DateTextInput
                        value={state.date}
                        onChange={(nextDate) => {
                          setState((s) => ({
                            ...s,
                            date: nextDate,
                          }));

                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.date;
                            return next;
                          });
                        }}
                        ariaLabel="Trip date"
                        hasError={Boolean(fieldErrors.date)}
                        highlighted={highlightedField === 'date'}
                        className="w-full"
                      />
                      {fieldErrors.date && (
                        <p className="mt-2 text-sm font-medium text-danger">
                          {fieldErrors.date}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {showTimingFields &&
                  ENABLE_AIRPORT_TIMING_FIELDS && (
                    <div id="time-field">
                      <label className="block text-sm font-medium text-foreground">
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
                        className={formInputClass({
                          hasError: Boolean(fieldErrors.time),
                          highlighted: highlightedField === 'time',
                          className: 'mt-2 w-full rounded-xl focus:ring-2',
                        })}
                        aria-label="Trip time"
                      />
                      {fieldErrors.time && (
                        <p className="mt-2 text-sm font-medium text-danger">
                          {fieldErrors.time}
                        </p>
                      )}
                    </div>
                  )}

                {isAirportTrip && (intent === 'flying-out' || intent === 'parking-trip') && (
                  <div className="md:col-span-2 rounded-2xl border border-border bg-card p-4">
                    <div className="text-sm font-medium text-foreground">Parking time</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Parking check-in date is used as your airport trip date. Leave time is calculated from your departure time and parking plan.
                    </p>

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div id="parking-checkin-field">
                        <label className="block text-sm font-medium text-foreground">
                          Parking check-in date
                        </label>
                        <DateTextInput
                          value={state.parkingCheckInDate}
                          onChange={(value) => {
                            const normalized = normalizeDateInputValue(value);
                            setState((s) => ({
                              ...s,
                              parkingCheckInDate: value,
                              date: normalized || (!value.trim() ? '' : s.date),
                            }));
                            setFieldErrors((prev) => {
                              const next = { ...prev };
                              delete next.parkingCheckInDate;
                              delete next.date;
                              return next;
                            });
                          }}
                          ariaLabel="Parking check-in date"
                          hasError={Boolean(fieldErrors.parkingCheckInDate)}
                          highlighted={highlightedField === 'parkingCheckInDate'}
                          className="mt-2 w-full"
                        />
                        {fieldErrors.parkingCheckInDate && (
                          <div className="mt-2 text-sm text-danger">{fieldErrors.parkingCheckInDate}</div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground">
                          Parking check-in time
                          <span className="ml-1 text-xs font-normal text-muted-foreground">Optional</span>
                        </label>
                        <input
                          type="time"
                          value={state.parkingCheckInTime}
                          onChange={(e) =>
                            setState((s) => ({
                              ...s,
                              parkingCheckInTime: e.target.value,
                            }))
                          }
                          className={formInputClass({ className: 'mt-2 w-full' })}
                        />
                      </div>

                      <div id="parking-checkout-field">
                        <label className="block text-sm font-medium text-foreground">
                          Parking check-out date
                          <span className="ml-1 text-xs font-normal text-muted-foreground">Optional</span>
                        </label>
                        <DateTextInput
                          value={state.parkingCheckOutDate}
                          onChange={(value) => {
                            setState((s) => ({
                              ...s,
                              parkingCheckOutDate: value,
                            }));
                            setFieldErrors((prev) => {
                              const next = { ...prev };
                              delete next.parkingCheckOutDate;
                              return next;
                            });
                          }}
                          ariaLabel="Parking check-out date"
                          hasError={Boolean(fieldErrors.parkingCheckOutDate)}
                          className="mt-2 w-full"
                        />
                        {fieldErrors.parkingCheckOutDate && (
                          <div className="mt-2 text-sm text-danger">{fieldErrors.parkingCheckOutDate}</div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground">
                          Parking check-out time
                          <span className="ml-1 text-xs font-normal text-muted-foreground">Optional</span>
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
                          className={formInputClass({ className: 'mt-2 w-full' })}
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div id="origin-field" className="md:col-span-2">
                  <div
                    className={
                      'rounded-2xl ' +
                      (fieldErrors.origin ? 'ring-4 ring-danger/15 ' : '') +
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
                    <div className="mt-2 text-sm text-danger">{fieldErrors.origin}</div>
                  )}
                </div>

                {isAirportTrip && (
                  <div className="md:col-span-2">
                    <div className="ppg-callout-panel rounded-2xl p-4">
                      <div className="text-sm font-medium text-foreground">Destination</div>
                      <div className="mt-1 text-base font-semibold text-foreground">
                        {(getAirportById(state.airportCode) || getAirportById('SEA')!)?.destinationName}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {airportGuide.note || 'We’ll route you to the correct check-in area.'}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Rideshare/taxi drop-off: {airportGuide.rideshareDestinationName}
                      </div>
                    </div>
                  </div>
                )}

                {isGeneralTrip && intentCopy(intent).wantsParkingDuration && (
                  <div id="parking-duration-field" className="ppg-section-panel md:col-span-2 rounded-2xl p-4">
                    <div className="text-sm font-medium text-foreground">Need parking?</div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {[
                        {
                          key: 'none' as const,
                          title: 'No parking needed',
                          sub: 'Use rideshare, transit, or directions without parking cards.',
                        },
                        {
                          key: 'destination' as const,
                          title: 'Parking likely at destination',
                          sub: 'Show on-site, customer, street, or official destination guidance.',
                        },
                        {
                          key: 'nearby' as const,
                          title: 'Find parking nearby',
                          sub: 'Compare physical lots, garages, and destination expectations.',
                        },
                      ].map((opt) => {
                        const selected = state.parkingPreference === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => {
                              setState((s) => ({
                                ...s,
                                parkingPreference: opt.key,
                                transportAvailability:
                                  opt.key === 'none' && s.transportAvailability === 'car'
                                    ? 'rideshare'
                                    : s.transportAvailability,
                              }));
                            }}
                            className={getOptionButtonClass(selected)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-foreground">{opt.title}</div>
                                <div className="mt-1 text-xs leading-5 text-muted-foreground">{opt.sub}</div>
                              </div>
                              {selected ? (
                                <span className={getOptionInlineBadgeClass()}>Selected</span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {state.parkingPreference !== 'none' && (
                      <div className="mt-5 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground">
                            Parking duration
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
                            placeholder="8"
                            min="0.5"
                            step="0.5"
                            className={formInputClass({ className: 'mt-2 w-full' })}
                          />
                        </div>

                        <div className="ppg-callout-panel rounded-2xl p-3">
                          <div className="text-sm font-semibold text-foreground">
                            {generalParkingSummary}
                          </div>
                          {generalParkingWindowOverridden ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Using custom parking window
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setGeneralParkingWindowOverridden(false);
                                  setState((s) => ({
                                    ...s,
                                    parkingCheckInDate: '',
                                    parkingCheckInTime: '',
                                    parkingCheckOutDate: '',
                                    parkingCheckOutTime: '',
                                  }));
                                  setFieldErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.parkingCheckInDate;
                                    delete next.parkingCheckOutDate;
                                    return next;
                                  });
                                }}
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                Reset to arrival + duration
                              </button>
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Park from defaults to your arrival time. Park until updates with duration.
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowAdvancedGeneralParkingTime((current) => !current)}
                          className="text-sm font-semibold text-primary hover:underline"
                          aria-expanded={showAdvancedGeneralParkingTime}
                        >
                          {showAdvancedGeneralParkingTime
                            ? 'Hide advanced parking time'
                            : 'Advanced parking time'}
                        </button>

                        {showAdvancedGeneralParkingTime ? (
                          <div className="ppg-section-panel grid grid-cols-1 gap-4 rounded-2xl bg-muted/30 p-4 md:grid-cols-2">
                            <div>
                              <label className="block text-sm font-medium text-foreground">
                                Park from date
                              </label>
                              <DateTextInput
                                value={
                                  generalParkingWindowOverridden
                                    ? state.parkingCheckInDate
                                    : generalParkingWindow?.parkingCheckInDate || ''
                                }
                                onChange={(value) => {
                                  setGeneralParkingWindowOverridden(true);
                                  setState((s) => ({
                                    ...s,
                                    parkingCheckInDate: value,
                                  }));
                                  setFieldErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.parkingCheckInDate;
                                    return next;
                                  });
                                }}
                                ariaLabel="Park from date"
                                hasError={Boolean(fieldErrors.parkingCheckInDate)}
                                className="mt-2 w-full"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-foreground">
                                Park from time
                              </label>
                              <input
                                type="time"
                                aria-label="Park from time"
                                value={
                                  generalParkingWindowOverridden
                                    ? state.parkingCheckInTime
                                    : generalParkingWindow?.parkingCheckInTime || ''
                                }
                                onChange={(e) => {
                                  setGeneralParkingWindowOverridden(true);
                                  setState((s) => ({
                                    ...s,
                                    parkingCheckInTime: e.target.value,
                                  }));
                                }}
                                className={formInputClass({ className: 'mt-2 w-full' })}
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-foreground">
                                Park until date
                              </label>
                              <DateTextInput
                                value={
                                  generalParkingWindowOverridden
                                    ? state.parkingCheckOutDate
                                    : generalParkingWindow?.parkingCheckOutDate || ''
                                }
                                onChange={(value) => {
                                  setGeneralParkingWindowOverridden(true);
                                  setState((s) => ({
                                    ...s,
                                    parkingCheckOutDate: value,
                                  }));
                                  setFieldErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.parkingCheckOutDate;
                                    return next;
                                  });
                                }}
                                ariaLabel="Park until date"
                                hasError={Boolean(fieldErrors.parkingCheckOutDate)}
                                className="mt-2 w-full"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-foreground">
                                Park until time
                              </label>
                              <input
                                type="time"
                                aria-label="Park until time"
                                value={
                                  generalParkingWindowOverridden
                                    ? state.parkingCheckOutTime
                                    : generalParkingWindow?.parkingCheckOutTime || ''
                                }
                                onChange={(e) => {
                                  setGeneralParkingWindowOverridden(true);
                                  setState((s) => ({
                                    ...s,
                                    parkingCheckOutTime: e.target.value,
                                  }));
                                  setFieldErrors((prev) => {
                                    const next = { ...prev };
                                    delete next.parkingCheckOutDate;
                                    return next;
                                  });
                                }}
                                className={formInputClass({ className: 'mt-2 w-full' })}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Near-time warning (non-blocking) - only show after user edited/selected time */}
              {timeTouched && state.time && (() => {
                const normalizedDate = usesParkingCheckInAsTripDate
                  ? resolveAirportTripDate(state)
                  : normalizeDateInputValue(state.date) || '';
                if (!normalizedDate) return null;

                const combined = new Date(`${normalizedDate}T${state.time}`);
                const now = new Date();
                if (!isNaN(combined.getTime())) {
                  const mins = Math.ceil((combined.getTime() - now.getTime()) / 60000);
                  if (mins > 0 && mins < 60) {
                    return (
                      <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
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
                  className="inline-flex items-center justify-center rounded-2xl border border-border bg-card px-5 py-3 text-base font-medium text-foreground hover:bg-muted"
                >
                  Back
                </button>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-sm hover:opacity-90"
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
