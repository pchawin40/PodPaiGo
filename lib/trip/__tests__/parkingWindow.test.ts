import {
  deriveParkingWindowFromArrival,
  formatParkingWindowSummary,
  hasCustomParkingWindow,
  resolveParkingWindow,
} from '../parkingWindow';

describe('parkingWindow', () => {
  test('general trip arrival 9 AM plus 8 hours derives 9 AM to 5 PM', () => {
    const window = deriveParkingWindowFromArrival('2026-11-13', '09:00', 8 * 60);

    expect(window).toEqual({
      parkingCheckInDate: '2026-11-13',
      parkingCheckInTime: '09:00',
      parkingCheckOutDate: '2026-11-13',
      parkingCheckOutTime: '17:00',
      parkingDuration: 480,
    });
    expect(formatParkingWindowSummary(window)).toBe('Parking: 9:00 AM-5:00 PM (8 hours)');
  });

  test('changing duration from 2h to 4h updates park until', () => {
    expect(
      deriveParkingWindowFromArrival('2026-11-13', '09:00', 2 * 60)
        ?.parkingCheckOutTime,
    ).toBe('11:00');
    expect(
      deriveParkingWindowFromArrival('2026-11-13', '09:00', 4 * 60)
        ?.parkingCheckOutTime,
    ).toBe('13:00');
  });

  test('changing arrival time updates park from and park until', () => {
    const window = deriveParkingWindowFromArrival('2026-11-13', '10:30', 2 * 60);

    expect(window?.parkingCheckInTime).toBe('10:30');
    expect(window?.parkingCheckOutTime).toBe('12:30');
  });

  test('manual custom park until is preserved', () => {
    const window = resolveParkingWindow({
      arrivalDate: '2026-11-13',
      arrivalTime: '09:00',
      durationMinutes: 8 * 60,
      parkingCheckOutDate: '2026-11-13',
      parkingCheckOutTime: '18:30',
    });

    expect(window?.parkingCheckInTime).toBe('09:00');
    expect(window?.parkingCheckOutTime).toBe('18:30');
    expect(window?.parkingDuration).toBe(570);
    expect(
      hasCustomParkingWindow({
        arrivalDate: '2026-11-13',
        arrivalTime: '09:00',
        durationMinutes: 8 * 60,
        parkingCheckOutDate: '2026-11-13',
        parkingCheckOutTime: '18:30',
      }),
    ).toBe(true);
  });

  test('reset-to-default recomputes from arrival plus duration', () => {
    const resetWindow = resolveParkingWindow({
      arrivalDate: '2026-11-13',
      arrivalTime: '11:00',
      durationMinutes: 4 * 60,
    });

    expect(resetWindow?.parkingCheckInTime).toBe('11:00');
    expect(resetWindow?.parkingCheckOutTime).toBe('15:00');
  });
});
