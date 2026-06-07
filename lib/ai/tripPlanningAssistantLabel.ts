export function resolveTripPlannerStatusLabel(input: {
  liveProviderActive?: boolean;
  providerUsed?: 'mock' | 'openai';
}): string {
  if (input.liveProviderActive || input.providerUsed === 'openai') {
    return 'AI Trip Planner';
  }

  const debugMock =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEBUG_TRIP_PLANNER === 'true';

  if (debugMock) {
    return 'Mock parser in development';
  }

  return 'AI planner beta';
}

export function shouldShowDevMockProviderNote(input: {
  liveProviderActive?: boolean;
  providerUsed?: 'mock' | 'openai';
}): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEBUG_TRIP_PLANNER === 'true' &&
    !input.liveProviderActive &&
    input.providerUsed !== 'openai'
  );
}
