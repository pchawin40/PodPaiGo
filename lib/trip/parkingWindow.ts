export type ParkingWindow = {
  parkingCheckInDate: string;
  parkingCheckInTime: string;
  parkingCheckOutDate: string;
  parkingCheckOutTime: string;
  parkingDuration: number;
};

export type ParkingWindowInput = {
  arrivalDate: string;
  arrivalTime: string;
  durationMinutes: number | null | undefined;
  parkingCheckInDate?: string | null;
  parkingCheckInTime?: string | null;
  parkingCheckOutDate?: string | null;
  parkingCheckOutTime?: string | null;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(value: Date): string {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function formatTime(value: Date): string {
  return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
}

function parseLocalDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function calculateParkingWindowDurationMinutes(args: {
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
}): number | null {
  const start = parseLocalDateTime(args.checkInDate, args.checkInTime);
  const end = parseLocalDateTime(args.checkOutDate, args.checkOutTime);
  if (!start || !end) return null;

  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return minutes > 0 ? minutes : null;
}

export function deriveParkingWindowFromArrival(
  arrivalDate: string,
  arrivalTime: string,
  durationMinutes: number | null | undefined,
): ParkingWindow | null {
  if (!Number.isFinite(durationMinutes) || Number(durationMinutes) <= 0) return null;

  const start = parseLocalDateTime(arrivalDate, arrivalTime);
  if (!start) return null;

  const duration = Math.round(Number(durationMinutes));
  const end = new Date(start.getTime() + duration * 60_000);

  return {
    parkingCheckInDate: formatDate(start),
    parkingCheckInTime: formatTime(start),
    parkingCheckOutDate: formatDate(end),
    parkingCheckOutTime: formatTime(end),
    parkingDuration: duration,
  };
}

export function hasCustomParkingWindow(input: ParkingWindowInput): boolean {
  const explicitFields = [
    input.parkingCheckInDate,
    input.parkingCheckInTime,
    input.parkingCheckOutDate,
    input.parkingCheckOutTime,
  ].map((value) => String(value || '').trim());

  if (explicitFields.every((value) => !value)) return false;

  const derived = deriveParkingWindowFromArrival(
    input.arrivalDate,
    input.arrivalTime,
    input.durationMinutes,
  );

  if (!derived) return true;

  return (
    (Boolean(explicitFields[0]) && explicitFields[0] !== derived.parkingCheckInDate) ||
    (Boolean(explicitFields[1]) && explicitFields[1] !== derived.parkingCheckInTime) ||
    (Boolean(explicitFields[2]) && explicitFields[2] !== derived.parkingCheckOutDate) ||
    (Boolean(explicitFields[3]) && explicitFields[3] !== derived.parkingCheckOutTime)
  );
}

export function resolveParkingWindow(input: ParkingWindowInput): ParkingWindow | null {
  const derived = deriveParkingWindowFromArrival(
    input.arrivalDate,
    input.arrivalTime,
    input.durationMinutes,
  );

  if (!hasCustomParkingWindow(input)) return derived;

  const checkInDate = input.parkingCheckInDate || derived?.parkingCheckInDate || input.arrivalDate;
  const checkInTime = input.parkingCheckInTime || derived?.parkingCheckInTime || input.arrivalTime;
  const checkOutDate = input.parkingCheckOutDate || derived?.parkingCheckOutDate || '';
  const checkOutTime = input.parkingCheckOutTime || derived?.parkingCheckOutTime || '';

  const customDuration = calculateParkingWindowDurationMinutes({
    checkInDate,
    checkInTime,
    checkOutDate,
    checkOutTime,
  });

  if (customDuration == null) return null;

  return {
    parkingCheckInDate: checkInDate,
    parkingCheckInTime: checkInTime,
    parkingCheckOutDate: checkOutDate,
    parkingCheckOutTime: checkOutTime,
    parkingDuration: customDuration,
  };
}

function formatTimeForSummary(date: string, time: string): string {
  const value = parseLocalDateTime(date, time);
  if (!value) return time;

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

function formatDateForSummary(date: string): string {
  const value = parseLocalDateTime(date, '12:00');
  if (!value) return date;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(value);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;

  const hours = minutes / 60;
  if (Number.isInteger(hours)) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  return `${Math.round(hours * 10) / 10} hours`;
}

export function formatParkingWindowSummary(window: ParkingWindow | null): string {
  if (!window) return 'Parking window will be set after arrival time and duration are entered.';

  const startTime = formatTimeForSummary(
    window.parkingCheckInDate,
    window.parkingCheckInTime,
  );
  const endTime = formatTimeForSummary(
    window.parkingCheckOutDate,
    window.parkingCheckOutTime,
  );
  const duration = formatDuration(window.parkingDuration);

  if (window.parkingCheckInDate === window.parkingCheckOutDate) {
    return `Parking: ${startTime}-${endTime} (${duration})`;
  }

  return `Parking: ${formatDateForSummary(window.parkingCheckInDate)} ${startTime}-${formatDateForSummary(window.parkingCheckOutDate)} ${endTime} (${duration})`;
}
