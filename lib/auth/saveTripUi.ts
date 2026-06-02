export type SaveTripUiState = {
  label: string;
  action: 'save' | 'sign-in';
};

export function getSaveTripUiState(isAuthenticated: boolean): SaveTripUiState {
  if (isAuthenticated) {
    return {
      label: 'Save trip',
      action: 'save',
    };
  }

  return {
    label: 'Sign in to save trip',
    action: 'sign-in',
  };
}
