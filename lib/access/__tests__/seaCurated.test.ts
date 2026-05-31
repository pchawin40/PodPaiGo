import {
  buildSeaCuratedAccessOptions,
  isSeaCuratedAccessEnabled,
  resetSeaCuratedAccessDiagnosticsForTests,
} from '../buildAccessOptions';
import type { TripData } from '../../types';

const originalEnv = process.env.SEA_CURATED_ACCESS;

describe('buildSeaCuratedAccessOptions', () => {
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SEA_CURATED_ACCESS;
    } else {
      process.env.SEA_CURATED_ACCESS = originalEnv;
    }
  });

  const trip: TripData = {
    type: 'one-way-departure',
    origin: 'Capitol Hill, Seattle, WA',
    destination: 'SEA',
    airportCode: 'SEA',
    departureDate: '2026-06-01',
    departureTime: '08:00',
    parkingDuration: 24 * 60,
  };

  test('returns Northgate when SEA and feature flag enabled', () => {
    process.env.SEA_CURATED_ACCESS = '1';

    expect(isSeaCuratedAccessEnabled()).toBe(true);

    const options = buildSeaCuratedAccessOptions(trip, 'SEA');
    expect(options).toHaveLength(1);
    expect(options[0].displayName).toBe('Northgate Park + Link');
    expect(options[0].strategyType).toBe('park_and_ride_transit');
    expect(options[0].pricing.displayPrimary).toContain('Estimated');
    expect(options[0].pricing.displayPrimary).toMatch(/\$/);
    expect(options[0].pricing.breakdown.parking).toBeDefined();
    expect(options[0].pricing.breakdown.transit).toBeDefined();
    expect(options[0].explanation).toContain('cheapest trip');
  });

  test('returns empty for non-SEA', () => {
    process.env.SEA_CURATED_ACCESS = '1';
    expect(buildSeaCuratedAccessOptions(trip, 'JFK')).toEqual([]);
  });

  test('returns empty when feature flag disabled', () => {
    delete process.env.SEA_CURATED_ACCESS;
    expect(buildSeaCuratedAccessOptions(trip, 'SEA')).toEqual([]);
  });

  test('logs dev diagnostic when flag disabled for SEA', () => {
    delete process.env.SEA_CURATED_ACCESS;
    resetSeaCuratedAccessDiagnosticsForTests();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    buildSeaCuratedAccessOptions(trip, 'SEA');

    expect(warnSpy).toHaveBeenCalledWith(
      '[access] SEA_CURATED_ACCESS disabled; Northgate hidden option will not render.',
    );

    warnSpy.mockRestore();
  });

  test('includes overnight caveat for long parking trips', () => {
    process.env.SEA_CURATED_ACCESS = '1';

    const overnightTrip: TripData = {
      ...trip,
      parkingDuration: 3 * 24 * 60,
    };

    const options = buildSeaCuratedAccessOptions(overnightTrip, 'SEA');
    expect(options[0].overnightCaveat).toBeTruthy();
  });
});
