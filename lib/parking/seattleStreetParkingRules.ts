import {
  uniqueStreetParkingSignals,
  type CityStreetParkingConfidence,
  type CityStreetParkingPaymentExpectation,
  type CityStreetParkingSpecialSignal,
  type CityStreetParkingType,
} from './cityStreetParkingRules';

export type SeattleParkingPaymentExpectation = CityStreetParkingPaymentExpectation;

export type SeattleStreetParkingType = CityStreetParkingType;

export type SeattleStreetParkingRulesInput = {
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationCity?: string | null;
  /** Destination text fallback when city/coords are incomplete. */
  destination?: string | null;
  tripDateTime: Date;
  parkingType?: SeattleStreetParkingType;
};

export type SeattleStreetParkingRulesResult = {
  paymentExpectation: SeattleParkingPaymentExpectation;
  reason: string;
  confidence: CityStreetParkingConfidence;
  /** Paid meter window start hour (local), when applicable. */
  paidStartHour?: number;
  /** Paid meter window end hour (local), when applicable. */
  paidEndHour?: number;
  holidayName?: string;
  isUptownEventArea?: boolean;
  cityRuleId?: 'seattle';
  jurisdictionName?: 'Seattle';
  sourceLabel?: 'Seattle rule';
  specialSignals?: CityStreetParkingSpecialSignal[];
};

/**
 * Future SDOT blockface integration — no live ingestion yet.
 * When wired, per-block paid hours/rates should override neighborhood defaults below.
 */
export type SdotBlockfaceParkingContext = {
  blockfaceId?: string;
  paidStartHour?: number;
  paidEndHour?: number;
  ratePerHour?: number;
  maxStayMinutes?: number;
};

export const SEATTLE_STREET_PARKING_SUBTEXT =
  'Street parking estimate based on Seattle payment hours. Garages/lots may still charge.';

const SEATTLE_PAID_START_HOUR = 8;
const SEATTLE_PAID_END_HOUR = 20;
const SEATTLE_EXTENDED_PAID_END_HOUR = 22;

const US_FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': "New Year's Day",
  '06-19': 'Juneteenth',
  '07-04': 'Independence Day',
  '11-11': 'Veterans Day',
  '12-25': 'Christmas Day',
};

function dateKey(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (occurrence - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function observedMondayForSundayFixedHoliday(date: Date): string | undefined {
  const dayOfWeek = date.getDay();
  if (dayOfWeek !== 1) return undefined;

  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  if (previous.getDay() !== 0) return undefined;

  const fixed = US_FIXED_HOLIDAYS[dateKey(previous)];
  return fixed ? `${fixed} (observed)` : undefined;
}

export function seattleParkingHolidayName(date: Date): string | undefined {
  const fixed = US_FIXED_HOLIDAYS[dateKey(date)];
  if (fixed) return fixed;

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  const mlk = nthWeekdayOfMonth(year, 0, 1, 3);
  if (sameCalendarDay(date, mlk)) return 'Martin Luther King Jr. Day';

  const presidents = nthWeekdayOfMonth(year, 1, 1, 3);
  if (sameCalendarDay(date, presidents)) return "Presidents' Day";

  const memorial = lastWeekdayOfMonth(year, 4, 1);
  if (sameCalendarDay(date, memorial)) return 'Memorial Day';

  const labor = nthWeekdayOfMonth(year, 8, 1, 1);
  if (sameCalendarDay(date, labor)) return 'Labor Day';

  if (month === 10 && date.getDay() === 4 && day >= 22 && day <= 28) {
    return 'Thanksgiving';
  }

  return observedMondayForSundayFixedHoliday(date);
}

export function isSeattleParkingHoliday(date: Date): boolean {
  return Boolean(seattleParkingHolidayName(date));
}

function normalizeCity(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function destinationMentionsSeattle(destination: string | null | undefined): boolean {
  return /\bseattle\b/i.test(String(destination || ''));
}

function isSeattleTrip(input: SeattleStreetParkingRulesInput): boolean {
  const city = normalizeCity(input.destinationCity);
  if (city === 'seattle') return true;
  if (destinationMentionsSeattle(input.destination)) return true;

  const lat = input.destinationLat;
  const lng = input.destinationLng;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return lat >= 47.49 && lat <= 47.74 && lng >= -122.45 && lng <= -122.22;
  }

  return false;
}

function isUptownClimatePledgeArea(input: SeattleStreetParkingRulesInput): boolean {
  const text = String(input.destination || '').toLowerCase();
  if (
    /\b(uptown|climate pledge|climate pledge arena|seattle center|keyarena|memorial stadium)\b/i.test(
      text,
    )
  ) {
    return true;
  }

  const lat = input.destinationLat;
  const lng = input.destinationLng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  return lat >= 47.615 && lat <= 47.635 && lng >= -122.355 && lng <= -122.325;
}

export function seattleStreetParkingExpectationLabel(
  expectation: SeattleParkingPaymentExpectation,
): string {
  switch (expectation) {
    case 'likely_free':
      return 'Likely free street parking';
    case 'likely_paid':
      return 'Likely paid street parking';
    case 'check_signs':
      return 'Check signs / special rules possible';
  }
}

function garageExpectation(): SeattleStreetParkingRulesResult {
  return seattleRulesResult({
    paymentExpectation: 'likely_paid',
    reason: 'Garages and lots typically charge unless the provider confirms free parking.',
    confidence: 'high',
    specialSignals: ['garage_or_lot', 'verify_signs'],
  });
}

function seattleRulesResult(
  result: Omit<
    SeattleStreetParkingRulesResult,
    'cityRuleId' | 'jurisdictionName' | 'sourceLabel'
  >,
): SeattleStreetParkingRulesResult {
  return {
    cityRuleId: 'seattle',
    jurisdictionName: 'Seattle',
    sourceLabel: 'Seattle rule',
    ...result,
    specialSignals: uniqueStreetParkingSignals([
      ...(result.specialSignals || []),
      'verify_signs',
    ]),
  };
}

/**
 * Time-aware Seattle on-street payment expectations.
 * Garages use separate paid defaults — street-only free rules do not apply to garages.
 */
export function evaluateSeattleStreetParkingRules(
  input: SeattleStreetParkingRulesInput,
  /** Reserved for future SDOT blockface overrides. */
  _sdot?: SdotBlockfaceParkingContext | null,
): SeattleStreetParkingRulesResult | null {
  void _sdot;

  if (!isSeattleTrip(input)) return null;

  const parkingType = input.parkingType ?? 'unknown';
  if (parkingType === 'garage') {
    return garageExpectation();
  }

  const trip = input.tripDateTime;
  const dayOfWeek = trip.getDay();
  const hour = trip.getHours();
  const isSunday = dayOfWeek === 0;
  const holidayName = seattleParkingHolidayName(trip);
  const isHoliday = Boolean(holidayName);
  const isUptown = isUptownClimatePledgeArea(input);

  if (isUptown) {
    return seattleRulesResult({
      paymentExpectation: 'check_signs',
      reason:
        'Special event parking may apply near Uptown and Climate Pledge Arena.',
      confidence: 'medium',
      isUptownEventArea: true,
      paidStartHour: SEATTLE_PAID_START_HOUR,
      paidEndHour: SEATTLE_EXTENDED_PAID_END_HOUR,
      specialSignals: ['event_zone_possible', 'extended_paid_hours', 'verify_signs'],
    });
  }

  if (isSunday) {
    return seattleRulesResult({
      paymentExpectation: 'likely_free',
      reason:
        'Seattle street parking is generally free on Sundays; posted time limits may still apply in some areas.',
      confidence: 'high',
      holidayName: undefined,
      paidStartHour: SEATTLE_PAID_START_HOUR,
      paidEndHour: SEATTLE_PAID_END_HOUR,
      specialSignals: ['sunday_free', 'verify_signs'],
    });
  }

  if (isHoliday) {
    return seattleRulesResult({
      paymentExpectation: 'likely_free',
      reason: 'Seattle street parking payment is not required on this holiday.',
      confidence: 'high',
      holidayName,
      paidStartHour: SEATTLE_PAID_START_HOUR,
      paidEndHour: SEATTLE_PAID_END_HOUR,
      specialSignals: ['holiday_free', 'verify_signs'],
    });
  }

  if (dayOfWeek >= 1 && dayOfWeek <= 6) {
    if (hour < SEATTLE_PAID_START_HOUR) {
      return seattleRulesResult({
        paymentExpectation: 'likely_free',
        reason: 'Paid parking generally starts around 8 AM.',
        confidence: 'medium',
        paidStartHour: SEATTLE_PAID_START_HOUR,
        paidEndHour: SEATTLE_PAID_END_HOUR,
        specialSignals: ['off_hours', 'verify_signs'],
      });
    }

    if (hour >= SEATTLE_EXTENDED_PAID_END_HOUR) {
      return seattleRulesResult({
        paymentExpectation: 'check_signs',
        reason: 'Paid parking generally ends by 8 PM or 10 PM depending on neighborhood.',
        confidence: 'medium',
        paidStartHour: SEATTLE_PAID_START_HOUR,
        paidEndHour: SEATTLE_EXTENDED_PAID_END_HOUR,
        specialSignals: ['off_hours', 'extended_paid_hours', 'verify_signs'],
      });
    }

    if (hour >= SEATTLE_PAID_END_HOUR) {
      return seattleRulesResult({
        paymentExpectation: 'check_signs',
        reason:
          'Between 8 PM and 10 PM, some Seattle neighborhoods still require payment while others do not. Check posted signs on arrival.',
        confidence: 'medium',
        paidStartHour: SEATTLE_PAID_START_HOUR,
        paidEndHour: SEATTLE_EXTENDED_PAID_END_HOUR,
        specialSignals: ['extended_paid_hours', 'verify_signs'],
      });
    }

    return seattleRulesResult({
      paymentExpectation: 'likely_paid',
      reason: `On weekdays during typical meter hours (about 8 AM–8 PM), Seattle street parking usually requires payment.`,
      confidence: 'high',
      paidStartHour: SEATTLE_PAID_START_HOUR,
      paidEndHour: SEATTLE_PAID_END_HOUR,
      specialSignals: ['typical_paid_hours', 'verify_signs'],
    });
  }

  return seattleRulesResult({
    paymentExpectation: 'check_signs',
    reason: 'Seattle street parking rules vary by block and time. Verify posted signs before you park.',
    confidence: 'low',
    paidStartHour: SEATTLE_PAID_START_HOUR,
    paidEndHour: SEATTLE_PAID_END_HOUR,
    specialSignals: ['verify_signs'],
  });
}

export function buildTripDateTime(
  arrivalDate?: string | null,
  arrivalTime?: string | null,
): Date | null {
  if (!arrivalDate) return null;
  const time = arrivalTime && /^\d{1,2}:\d{2}$/.test(arrivalTime) ? arrivalTime : '12:00';
  const parsed = new Date(`${arrivalDate}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
