import { TripData } from './types';

export function parseHHMMToMinutes(time24: string): number | null {
  const m = time24.match(/^([0-2]\d):([0-5]\d)$/);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

export function minutesToHHMM(totalMinutes: number): string {
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatTimeFriendly(time24: string): string {
  const m = time24.match(/^([0-2]\d):([0-5]\d)$/);
  if (!m) return time24;

  let hours = Number(m[1]);
  const minutes = m[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes} ${ampm}`;
}

export function parseLocalDate(dateString: string): Date | null {
  const m = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  if (![year, month, day].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day);
}

export function estimateParkingDays(tripData: TripData | null): number {
  if (!tripData) return 1;

  if ('parkingDuration' in tripData && tripData.parkingDuration) {
    return Math.max(1, Math.ceil(tripData.parkingDuration / 60 / 24));
  }

  if (tripData.type === 'round-trip') {
    const start = parseLocalDate(tripData.departureDate);
    const end = parseLocalDate(tripData.returnDate);

    if (start && end) {
      const delta = end.getTime() - start.getTime();
      return Math.max(1, Math.ceil(delta / (1000 * 60 * 60 * 24)));
    }
  }

  return 1;
}

export function buildLocalDateTime(dateString: string, timeString: string): Date | null {
  const mDate = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mTime = timeString.match(/^(\d{2}):(\d{2})$/);

  if (!mDate || !mTime) return null;

  const y = Number(mDate[1]);
  const mo = Number(mDate[2]);
  const d = Number(mDate[3]);
  const hh = Number(mTime[1]);
  const mm = Number(mTime[2]);

  if (![y, mo, d, hh, mm].every(Number.isFinite)) return null;

  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

export function formatLocalYYYYMMDD(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}