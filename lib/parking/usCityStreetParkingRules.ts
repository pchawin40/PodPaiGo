import {
  seattleStreetParkingExpectationLabel,
} from './seattleStreetParkingRules';
import {
  uniqueStreetParkingSignals,
  type CityStreetParkingRuleModule,
  type CityStreetParkingRulesInput,
  type CityStreetParkingRulesResult,
  type CityStreetParkingSpecialSignal,
} from './cityStreetParkingRules';

export const US_CITY_STREET_PARKING_SUBTEXT =
  'Street parking estimate varies by city and block. Garages/lots may still charge.';

export type UsCityStreetParkingRulesInput = CityStreetParkingRulesInput;

export type UsCityStreetParkingRulesResult = CityStreetParkingRulesResult & {
  supplementalText: string;
};

const US_STATE_ABBREVIATIONS = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'DC',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
];

const US_STATE_NAMES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'District of Columbia',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
];

const US_STATE_ABBREVIATION_PATTERN = new RegExp(
  `(?:^|[\\s,])(${US_STATE_ABBREVIATIONS.join('|')})(?:\\s+\\d{5}(?:-\\d{4})?|[\\s,]|$)`,
  'i',
);
const US_STATE_NAME_PATTERN = new RegExp(
  `\\b(${US_STATE_NAMES.map((name) => name.replace(/\s+/g, '\\s+')).join('|')})\\b`,
  'i',
);
const US_ZIP_PATTERN = /\b\d{5}(?:-\d{4})?\b/;

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
  if (date.getDay() !== 1) return undefined;

  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  if (previous.getDay() !== 0) return undefined;

  const fixed = US_FIXED_HOLIDAYS[dateKey(previous)];
  return fixed ? `${fixed} (observed)` : undefined;
}

function usObservedHolidayName(date: Date): string | undefined {
  const fixed = US_FIXED_HOLIDAYS[dateKey(date)];
  if (fixed) return fixed;

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  if (sameCalendarDay(date, nthWeekdayOfMonth(year, 0, 1, 3))) {
    return 'Martin Luther King Jr. Day';
  }

  if (sameCalendarDay(date, nthWeekdayOfMonth(year, 1, 1, 3))) {
    return "Presidents' Day";
  }

  if (sameCalendarDay(date, lastWeekdayOfMonth(year, 4, 1))) {
    return 'Memorial Day';
  }

  if (sameCalendarDay(date, nthWeekdayOfMonth(year, 8, 1, 1))) {
    return 'Labor Day';
  }

  if (month === 10 && date.getDay() === 4 && day >= 22 && day <= 28) {
    return 'Thanksgiving';
  }

  return observedMondayForSundayFixedHoliday(date);
}

function textHasUsAddressSignal(value: string | null | undefined): boolean {
  const text = String(value || '').trim();
  if (!text) return false;
  return (
    /\b(?:usa|u\.s\.a\.|united states)\b/i.test(text) ||
    US_ZIP_PATTERN.test(text) ||
    US_STATE_ABBREVIATION_PATTERN.test(text) ||
    US_STATE_NAME_PATTERN.test(text)
  );
}

function coordsInUnitedStates(lat: number, lng: number): boolean {
  const contiguous = lat >= 24.4 && lat <= 49.4 && lng >= -124.9 && lng <= -66.9;
  const alaska = lat >= 51.0 && lat <= 72.0 && lng >= -179.9 && lng <= -129.0;
  const hawaii = lat >= 18.5 && lat <= 22.5 && lng >= -161.0 && lng <= -154.5;
  const puertoRico = lat >= 17.8 && lat <= 18.6 && lng >= -67.5 && lng <= -65.0;
  return contiguous || alaska || hawaii || puertoRico;
}

function isLikelyUsCityTrip(input: UsCityStreetParkingRulesInput): boolean {
  if (textHasUsAddressSignal(input.destination)) return true;
  if (textHasUsAddressSignal(input.destinationCity)) return true;

  const lat = input.destinationLat;
  const lng = input.destinationLng;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return coordsInUnitedStates(lat, lng);
  }

  return false;
}

function checkSignsResult(
  reason: string,
  holidayName?: string,
  specialSignals: CityStreetParkingSpecialSignal[] = ['verify_signs'],
): UsCityStreetParkingRulesResult {
  return {
    paymentExpectation: 'check_signs',
    reason,
    confidence: 'low',
    supplementalText: US_CITY_STREET_PARKING_SUBTEXT,
    holidayName,
    cityRuleId: 'generic_us_city',
    jurisdictionName: 'U.S. cities',
    sourceLabel: 'City estimate',
    specialSignals: uniqueStreetParkingSignals([...specialSignals, 'verify_signs']),
  };
}

/**
 * Generic U.S. city fallback module. City-specific modules for NYC, SF,
 * Chicago, Los Angeles, etc. can be registered ahead of this fallback later.
 * This intentionally avoids treating Seattle's Sunday/holiday/off-hour rules
 * as national rules.
 */
const genericUsCityStreetParkingRuleModule: CityStreetParkingRuleModule = {
  cityRuleId: 'generic_us_city',
  jurisdictionName: 'U.S. cities',
  sourceLabel: 'City estimate',
  matches: isLikelyUsCityTrip,
  evaluate(input) {
    const parkingType = input.parkingType ?? 'unknown';
    if (parkingType === 'garage') {
      return {
        paymentExpectation: 'likely_paid',
        reason: 'Garages and lots usually charge unless the provider confirms free parking.',
        confidence: 'medium',
        supplementalText: US_CITY_STREET_PARKING_SUBTEXT,
        cityRuleId: 'generic_us_city',
        jurisdictionName: 'U.S. cities',
        sourceLabel: 'City estimate',
        specialSignals: ['garage_or_lot', 'verify_signs'],
      };
    }

    const trip = input.tripDateTime;
    const dayOfWeek = trip.getDay();
    const hour = trip.getHours();
    const holidayName = usObservedHolidayName(trip);

    if (holidayName) {
      return checkSignsResult(
        `Holiday street parking payment rules vary by U.S. city. Some cities suspend meter payment on ${holidayName}, but posted signs and city parking apps control.`,
        holidayName,
        ['holiday_free', 'verify_signs'],
      );
    }

    if (dayOfWeek === 0) {
      return checkSignsResult(
        'Sunday street parking payment rules vary by U.S. city and block. Some cities make meters free, while business districts, waterfronts, and event areas may still charge.',
        undefined,
        ['sunday_free', 'event_zone_possible', 'verify_signs'],
      );
    }

    if (hour < 8) {
      return checkSignsResult(
        'Paid street parking often starts in the morning, but start times vary by U.S. city and block.',
        undefined,
        ['off_hours', 'verify_signs'],
      );
    }

    if (hour >= 22) {
      return checkSignsResult(
        'Late-night street parking payment rules vary by U.S. city. Many meters stop charging by late evening, but event and nightlife districts can differ.',
        undefined,
        ['off_hours', 'event_zone_possible', 'verify_signs'],
      );
    }

    if (hour >= 20) {
      return checkSignsResult(
        'Evening street parking payment rules vary by U.S. city. Some districts charge until 10 PM or during special events.',
        undefined,
        ['extended_paid_hours', 'event_zone_possible', 'verify_signs'],
      );
    }

    return checkSignsResult(
      `${seattleStreetParkingExpectationLabel('check_signs')}: street meter hours and payment rules vary by U.S. city and block during daytime hours.`,
      undefined,
      ['typical_paid_hours', 'verify_signs'],
    );
  },
};

export const US_CITY_STREET_PARKING_RULE_MODULES: CityStreetParkingRuleModule[] = [
  genericUsCityStreetParkingRuleModule,
];

export function evaluateUsCityStreetParkingRules(
  input: UsCityStreetParkingRulesInput,
): UsCityStreetParkingRulesResult | null {
  const ruleModule = US_CITY_STREET_PARKING_RULE_MODULES.find((candidate) =>
    candidate.matches(input),
  );

  const result = ruleModule?.evaluate(input);
  return result
    ? {
        ...result,
        supplementalText:
          result.supplementalText || US_CITY_STREET_PARKING_SUBTEXT,
      }
    : null;
}
