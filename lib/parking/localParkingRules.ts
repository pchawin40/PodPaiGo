import { matchCuratedLocalParkingZone } from './localParkingZones';

export type LocalStreetParkingSignal = {
  freeLikely: boolean;
  penalty: number;
  headline?: string;
  detail?: string;
  verifyRequired: boolean;
};

const US_FIXED_HOLIDAYS = new Set(['01-01', '07-04', '11-11', '12-25']);

function dateKey(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isLikelyUsHoliday(date: Date): boolean {
  if (US_FIXED_HOLIDAYS.has(dateKey(date))) return true;

  const month = date.getMonth();
  const day = date.getDate();
  const dayOfWeek = date.getDay();

  if (month === 4 && dayOfWeek === 1 && day >= 25) return true;
  if (month === 8 && dayOfWeek === 1 && day <= 7) return true;
  if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;

  return false;
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
  let headline: string | undefined;
  let detail: string | undefined;

  if (isSeattleDestination(input.destination) && arrival) {
    const isSunday = arrival.getDay() === 0;
    const isHoliday = isLikelyUsHoliday(arrival);

    if (isSunday || isHoliday) {
      freeLikely = true;
      headline = 'Free street parking may be available today';
      detail = isHoliday
        ? 'Seattle holiday street parking may be free. Verify posted signs and time limits before leaving your car.'
        : 'Seattle Sunday street parking may be free. Verify posted signs and time limits before leaving your car.';
    }
  }

  if (curatedZone) {
    headline = headline || curatedZone.headline;
    detail = detail || curatedZone.detail;

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
    penalty,
    headline,
    detail,
    verifyRequired: true,
  };
}
