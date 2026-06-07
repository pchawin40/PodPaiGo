import {
  formatParkingCheckInDeltaDuration,
  resolveParkingCheckInTimingMessage,
} from '../airportLeaveBy';

const defaultTiming = {
  totalMinutes: 45,
  driveMinutes: 30,
  parkingBufferMinutes: 5,
  shuttleWalkMinutes: 10,
};

describe('formatParkingCheckInDeltaDuration', () => {
  test('formats sub-hour durations as minutes only', () => {
    expect(formatParkingCheckInDeltaDuration(5)).toBe('5 min');
    expect(formatParkingCheckInDeltaDuration(18)).toBe('18 min');
  });

  test('formats hour durations with zero-padded minutes', () => {
    expect(formatParkingCheckInDeltaDuration(65)).toBe('1h 05m');
    expect(formatParkingCheckInDeltaDuration(90)).toBe('1h 30m');
    expect(formatParkingCheckInDeltaDuration(130)).toBe('2h 10m');
  });

  test('never uses a zero-hour prefix', () => {
    expect(formatParkingCheckInDeltaDuration(5)).not.toContain('0h');
    expect(formatParkingCheckInDeltaDuration(45)).not.toContain('0h');
  });
});

describe('resolveParkingCheckInTimingMessage', () => {
  test('shows extra cushion when selected check-in is 90 min earlier', () => {
    const message = resolveParkingCheckInTimingMessage({
      checkInTime: '06:30',
      recommendedCheckInTime: '08:00',
      timing: defaultTiming,
    });

    expect(message).toMatchObject({
      status: 'early',
      deltaMinutes: 90,
      absoluteDeltaLabel: '1h 30m',
      recommendedCheckInTime: '08:00',
      selectedCheckInTime: '06:30',
    });
    expect(message?.title).toBe('You have 1h 30m extra airport cushion');
    expect(message?.body).toContain('6:30 AM parking check-in');
    expect(message?.basis).toBe('Based on your selected parking check-in.');
  });

  test('shows tightness when selected check-in is 20 min later', () => {
    const message = resolveParkingCheckInTimingMessage({
      checkInTime: '08:20',
      recommendedCheckInTime: '08:00',
      timing: defaultTiming,
    });

    expect(message).toMatchObject({
      status: 'late',
      deltaMinutes: -20,
      absoluteDeltaLabel: '20 min',
    });
    expect(message?.title).toBe('Parking check-in may be tight by 20 min');
    expect(message?.basis).toBe(
      'Consider moving check-in earlier or choosing a faster parking option.',
    );
  });

  test('shows good timing when within 10 minutes of recommended', () => {
    const message = resolveParkingCheckInTimingMessage({
      checkInTime: '07:50',
      recommendedCheckInTime: '08:00',
      timing: defaultTiming,
    });

    expect(message).toMatchObject({
      status: 'good',
      deltaMinutes: 10,
      absoluteDeltaLabel: '10 min',
    });
    expect(message?.title).toBe('Parking time looks good');
    expect(message?.basis).toBe('');
  });

  test('returns unknown status without duration when recommended is missing', () => {
    const message = resolveParkingCheckInTimingMessage({
      checkInTime: '06:00',
      recommendedCheckInTime: null,
      timing: defaultTiming,
    });

    expect(message).toMatchObject({
      status: 'unknown',
      deltaMinutes: null,
      absoluteDeltaLabel: null,
      recommendedCheckInTime: null,
      selectedCheckInTime: '06:00',
    });
    expect(message?.title).not.toMatch(/\d/);
    expect(message?.body).not.toMatch(/\d/);
  });
});
