import { extractDrivingPreferences, needsPassengerCount } from '../drivingPreferences';

describe('extractDrivingPreferences', () => {
  test('returns null when no driving signal is present', () => {
    expect(extractDrivingPreferences('drive to Pike Place from Monroe')).toBeNull();
  });

  test('captures carpool, Express Pass and toll-lane access without claiming HOV eligibility', () => {
    const prefs = extractDrivingPreferences(
      'I might have a carpool and I have Express Pass / toll lane access',
    );
    expect(prefs).not.toBeNull();
    expect(prefs?.carpoolPossible).toBe(true);
    expect(prefs?.expressPassAvailable).toBe(true);
    expect(prefs?.tollLaneAllowed).toBe(true);
    expect(prefs?.hovLaneEligible).toBe('unknown');
    expect(prefs?.numberOfPeople).toBeNull();
  });

  test('marks HOV eligible only when occupancy of 2+ is stated', () => {
    const prefs = extractDrivingPreferences('carpool with 3 people in the car');
    expect(prefs?.numberOfPeople).toBe(3);
    expect(prefs?.hovLaneEligible).toBe('yes');
  });

  test('solo driver is not HOV eligible', () => {
    const prefs = extractDrivingPreferences('just me driving, I have a toll pass');
    expect(prefs?.numberOfPeople).toBe(1);
    expect(prefs?.hovLaneEligible).toBe('no');
  });

  test('avoid tolls clears toll-lane allowance and willingness', () => {
    const prefs = extractDrivingPreferences('please avoid tolls on the way');
    expect(prefs?.avoidTolls).toBe(true);
    expect(prefs?.tollLaneAllowed).toBe(false);
    expect(prefs?.willingToPayTollForTime).toBe(false);
  });

  test('detects willingness to pay tolls to save time', () => {
    const prefs = extractDrivingPreferences('I can pay tolls if it saves time');
    expect(prefs?.willingToPayTollForTime).toBe(true);
  });
});

describe('needsPassengerCount', () => {
  test('true when carpool/HOV intent has no occupancy yet', () => {
    expect(
      needsPassengerCount({
        carpoolPossible: true,
        numberOfPeople: null,
        hovLaneEligible: 'unknown',
        expressPassAvailable: true,
        tollLaneAllowed: true,
        avoidTolls: false,
        willingToPayTollForTime: null,
      }),
    ).toBe(true);
  });

  test('false once a count is known', () => {
    expect(
      needsPassengerCount({
        carpoolPossible: true,
        numberOfPeople: 2,
        hovLaneEligible: 'yes',
        expressPassAvailable: false,
        tollLaneAllowed: null,
        avoidTolls: false,
        willingToPayTollForTime: null,
      }),
    ).toBe(false);
  });

  test('false when the user confirmed they are unsure', () => {
    expect(
      needsPassengerCount({
        carpoolPossible: true,
        numberOfPeople: null,
        occupancyConfirmedUnknown: true,
        hovLaneEligible: 'unknown',
        expressPassAvailable: false,
        tollLaneAllowed: null,
        avoidTolls: false,
        willingToPayTollForTime: null,
      }),
    ).toBe(false);
  });

  test('false with no preferences', () => {
    expect(needsPassengerCount(null)).toBe(false);
  });
});
