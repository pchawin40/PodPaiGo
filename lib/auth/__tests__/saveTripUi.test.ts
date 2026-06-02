import { getSaveTripUiState } from '../saveTripUi';

describe('saveTripUi', () => {
  test('logged-out users see sign-in prompt', () => {
    expect(getSaveTripUiState(false)).toEqual({
      label: 'Sign in to save trip',
      action: 'sign-in',
    });
  });

  test('logged-in users see save trip action', () => {
    expect(getSaveTripUiState(true)).toEqual({
      label: 'Save trip',
      action: 'save',
    });
  });
});
