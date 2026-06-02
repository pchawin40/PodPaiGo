import { calculateAirportReadinessBuffer } from '../airportReadiness';

describe('calculateAirportReadinessBuffer bag plan', () => {
  const baseInput = {
    securityOption: 'standard' as const,
    flightType: 'domestic' as const,
    cabin: 'economy' as const,
  };

  test('checked bag adds 25 minutes', () => {
    const none = calculateAirportReadinessBuffer({
      ...baseInput,
      bagPlan: 'none',
    });
    const checked = calculateAirportReadinessBuffer({
      ...baseInput,
      bagPlan: 'checked',
    });

    expect(checked.bufferMinutes - none.bufferMinutes).toBe(25);
    expect(checked.assumptions.some((item) => item.includes('25 minutes'))).toBe(true);
  });

  test('oversized bag adds 40 minutes', () => {
    const none = calculateAirportReadinessBuffer({
      ...baseInput,
      bagPlan: 'none',
    });
    const oversized = calculateAirportReadinessBuffer({
      ...baseInput,
      bagPlan: 'oversized',
    });

    expect(oversized.bufferMinutes - none.bufferMinutes).toBe(40);
    expect(oversized.assumptions.some((item) => item.includes('40 minutes'))).toBe(true);
  });
});
