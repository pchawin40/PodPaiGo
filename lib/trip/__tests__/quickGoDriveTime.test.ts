import { resolveQuickGoDriveTime } from '../quickGo';

describe('resolveQuickGoDriveTime', () => {
  test('treats a positive duration as a valid drive time', () => {
    expect(resolveQuickGoDriveTime({ duration: 25, trustStatus: 'estimated' })).toEqual({
      minutes: 25,
      unavailable: false,
    });
  });

  test('marks route-unavailable estimates as unavailable (never 0 min)', () => {
    expect(
      resolveQuickGoDriveTime({ duration: 0, routeUnavailable: true, trustStatus: 'fallback' }),
    ).toEqual({ minutes: null, unavailable: true });
  });

  test('marks fallback duration <= 0 as unavailable', () => {
    expect(resolveQuickGoDriveTime({ duration: 0, trustStatus: 'fallback' })).toEqual({
      minutes: null,
      unavailable: true,
    });
  });

  test('treats a bare duration of 0 (no same-place signal) as unavailable', () => {
    expect(resolveQuickGoDriveTime({ duration: 0, trustStatus: 'estimated' })).toEqual({
      minutes: null,
      unavailable: true,
    });
  });

  test('allows 0 min only with an explicit same-place signal (zero distance, real route)', () => {
    expect(
      resolveQuickGoDriveTime({ duration: 0, distanceMeters: 0, trustStatus: 'live' }),
    ).toEqual({ minutes: 0, unavailable: false });
  });

  test('treats missing traffic estimate as unavailable', () => {
    expect(resolveQuickGoDriveTime(null)).toEqual({ minutes: null, unavailable: true });
    expect(resolveQuickGoDriveTime(undefined)).toEqual({ minutes: null, unavailable: true });
  });
});
