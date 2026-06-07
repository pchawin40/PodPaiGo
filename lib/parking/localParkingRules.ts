import { isDenseUrbanDestination } from './destinationParkingClassifier';
import { matchCuratedLocalParkingZone } from './localParkingZones';

export type LocalParkingRuleDetails = {
  dayOfWeek?: string;
  holidayName?: string;
  meterHours?: string;
  maxDuration?: number;
};

export type LocalStreetParkingSignal = {
  freeLikely: boolean;
  paidLikely: boolean;
  penalty: number;
  headline?: string;
  detail?: string;
  verifyRequired: boolean;
  appliesToday?: boolean;
  ruleDetails?: LocalParkingRuleDetails;
};

const US_FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': "New Year's Day",
  '07-04': 'Independence Day',
  '11-11': 'Veterans Day',
  '12-25': 'Christmas Day',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dateKey(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function holidayNameForDate(date: Date): string | undefined {
  const fixed = US_FIXED_HOLIDAYS[dateKey(date)];
  if (fixed) return fixed;

  const month = date.getMonth();
  const day = date.getDate();
  const dayOfWeek = date.getDay();

  if (month === 4 && dayOfWeek === 1 && day >= 25) return 'Memorial Day';
  if (month === 8 && dayOfWeek === 1 && day <= 7) return 'Labor Day';
  if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) return 'Thanksgiving';

  return undefined;
}

function isLikelyUsHoliday(date: Date): boolean {
  return Boolean(holidayNameForDate(date));
}

function buildArrivalDate(
  arrivalDate?: string | null,
  arrivalTime?: string | null,
): Date | null {
  if (!arrivalDate) return null;
  const time = arrivalTime && /^\d{1,2}:\d{2}$/.test(arrivalTime) ? arrivalTime : '12:00';
  const parsed = new Date(`${arrivalDate}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSeattleDestination(destination: string): boolean {
  return /\bseattle\b/i.test(destination);
}

const SEATTLE_DOWNTOWN_METER_HOURS = 'Mon–Sat 8am–6pm';
const SEATTLE_DOWNTOWN_PAID_START_HOUR = 8;
const SEATTLE_DOWNTOWN_PAID_END_HOUR = 18;

export function evaluateLocalStreetParkingRules(input: {
  destination: string;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  durationMinutes: number;
  isAirportTrip?: boolean;
}): LocalStreetParkingSignal {
  if (input.isAirportTrip) {
    return {
      freeLikely: false,
      paidLikely: false,
      penalty: 5000,
      headline: 'Street parking not recommended',
      detail: 'Airport and overnight trips should use verified lots or garages.',
      verifyRequired: true,
    };
  }

  const arrival = buildArrivalDate(input.arrivalDate, input.arrivalTime);
  const durationHours = Math.max(0, input.durationMinutes) / 60;
  const curatedZone = matchCuratedLocalParkingZone(input.destination);
  let penalty = 0;
  let freeLikely = false;
  let paidLikely = false;
  let headline: string | undefined;
  let detail: string | undefined;
  let appliesToday: boolean | undefined;
  let ruleDetails: LocalParkingRuleDetails | undefined;

  if (isSeattleDestination(input.destination) && arrival) {
    const dayOfWeek = arrival.getDay();
    const hour = arrival.getHours();
    const isSunday = dayOfWeek === 0;
    const holidayName = holidayNameForDate(arrival);
    const isHoliday = Boolean(holidayName);
    const isDowntown = isDenseUrbanDestination(input.destination);

    if (isSunday || isHoliday) {
      freeLikely = true;
      appliesToday = true;
      headline = 'Free street parking may be available today';
      detail = isHoliday
        ? 'Seattle holiday street parking payment is generally not required. Verify posted signs and time limits before leaving your car.'
        : 'Seattle Sunday street parking payment is generally not required. Verify posted signs and time limits before leaving your car.';
      ruleDetails = {
        dayOfWeek: DAY_NAMES[dayOfWeek],
        holidayName,
      };
    } else if (isDowntown && dayOfWeek >= 1 && dayOfWeek <= 6) {
      const duringPaidHours =
        hour >= SEATTLE_DOWNTOWN_PAID_START_HOUR && hour < SEATTLE_DOWNTOWN_PAID_END_HOUR;

      if (duringPaidHours) {
        paidLikely = true;
        headline = 'Paid parking likely';
        detail =
          'Downtown Seattle street parking usually requires payment on weekdays during meter hours. Garages and lots are common nearby.';
        ruleDetails = {
          dayOfWeek: DAY_NAMES[dayOfWeek],
          meterHours: SEATTLE_DOWNTOWN_METER_HOURS,
        };
      } else {
        freeLikely = true;
        appliesToday = true;
        headline = 'Free street parking may be available today';
        detail =
          'Outside typical downtown meter hours, street payment may not be required. Signs still vary by block and zone.';
        ruleDetails = {
          dayOfWeek: DAY_NAMES[dayOfWeek],
          meterHours: 'Evening/off-hours',
        };
      }
    }
  }

  if (curatedZone) {
    headline = headline || curatedZone.headline;
    detail = detail || curatedZone.detail;

    if (curatedZone.maxStreetHours) {
      ruleDetails = {
        ...ruleDetails,
        maxDuration: curatedZone.maxStreetHours,
      };
    }

    if (curatedZone.maxStreetHours && durationHours > curatedZone.maxStreetHours) {
      penalty += 28 + Math.round((durationHours - curatedZone.maxStreetHours) * 6);
      detail = `${curatedZone.detail} Your stay looks longer than the posted limit.`;
    }
  }

  if (durationHours >= 8) {
    penalty += 16;
  }

  return {
    freeLikely,
    paidLikely,
    penalty,
    headline,
    detail,
    verifyRequired: true,
    appliesToday,
    ruleDetails,
  };
}
